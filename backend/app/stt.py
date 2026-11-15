"""Speech to text for the voice button.

Any OpenAI-compatible transcription endpoint works: Groq (free tier, Whisper large v3 turbo), OpenAI, or your own
faster-whisper / whisper.cpp server. Audio is forwarded once and never stored or logged. If nothing is configured the
browser's own speech recognition is used instead and no audio reaches this server."""
from __future__ import annotations

import logging
import re

import httpx

from .config import get_settings

S = get_settings()
log = logging.getLogger("reschedule.stt")
MAX_BYTES = 3_000_000
OK_TYPES = {"audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/flac", "audio/m4a", "audio/x-m4a", "video/webm"}
EXT = {"audio/webm": "webm", "video/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/mpeg": "mp3",
       "audio/wav": "wav", "audio/x-wav": "wav", "audio/flac": "flac", "audio/m4a": "m4a", "audio/x-m4a": "m4a"}


class STTError(Exception):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(code)
        self.code, self.detail = code, detail


def enabled() -> bool:
    return bool(S.stt_url and S.stt_key)


def clean_hints(raw: str) -> str:
    """Shop vocabulary (machine names, job codes) that helps the model hear 'VMC-2' and not 'BMC to'."""
    s = re.sub(r"[^\w\-\s,./+]", " ", raw or "")
    return re.sub(r"\s+", " ", s).strip()[:300]


def normalise_mime(mime: str) -> str:
    return (mime or "").split(";")[0].strip().lower()


def transcribe(data: bytes, mime: str, hints: str = "", lang: str = "") -> str:
    if not enabled():
        raise STTError("offline")
    mime = normalise_mime(mime)
    if mime not in OK_TYPES:
        raise STTError("type", "Unsupported audio type")
    if not data or len(data) < 800:
        raise STTError("short", "Too short")
    if len(data) > MAX_BYTES:
        raise STTError("long", "Too long")
    prompt = ("Shop floor note about a CNC machine shop, spoken in English or Hindi mixed with English. "
              "Write Hindi words in Roman letters. Numbers as digits. "
              + (f"Machines and jobs: {clean_hints(hints)}." if hints else ""))[:600]
    form = {"model": S.stt_model, "response_format": "json", "temperature": "0", "prompt": prompt}
    if lang == "en":
        form["language"] = "en"          # Hindi is left to auto-detect so it comes back in Roman letters
    try:
        r = httpx.post(S.stt_url.rstrip("/") + "/audio/transcriptions", data=form,
                       files={"file": (f"note.{EXT[mime]}", data, mime)},
                       headers={"Authorization": f"Bearer {S.stt_key}"}, timeout=30)
    except httpx.TimeoutException:
        raise STTError("busy", "Timed out")
    except httpx.HTTPError as e:
        log.warning("stt transport error: %s", type(e).__name__)
        raise STTError("failed", "Could not reach the speech service")
    if r.status_code == 429:
        raise STTError("busy", "Rate limited")
    if r.status_code != 200:
        log.warning("stt status %s: %s", r.status_code, r.text[:200].replace(S.stt_key, "***"))
        raise STTError("auth" if r.status_code in (401, 403) else "failed", f"Speech service said {r.status_code}")
    try:
        text = str(r.json().get("text", "")).strip()
    except ValueError:
        raise STTError("failed", "Unreadable reply")
    return re.sub(r"\s+", " ", text)[:500]
