"""Minimal streaming client for Google Gemini (REST + server-sent events). Keys never appear in logs or error text.

Two Google front doors exist and keys look different:
  * AI Studio keys ("AIza...")  -> generativelanguage.googleapis.com
  * Vertex AI express keys ("AQ....") -> aiplatform.googleapis.com
We pick by the key's look, and if Google answers 401/403/404 we try the other door once, then remember what worked.
"""
from __future__ import annotations

import json
import logging
from collections.abc import Iterator

import httpx

from .config import get_settings

log = logging.getLogger("reschedule.llm")
S = get_settings()

_client = httpx.Client(timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0), limits=httpx.Limits(max_keepalive_connections=8))
_working: tuple[str, str] | None = None   # (url, auth mode) that last worked


class LLMError(Exception):
    """code: offline | busy | auth | failed"""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(code)
        self.code = code
        self.detail = detail


def enabled() -> bool:
    return S.llm_provider == "gemini" and bool(S.llm_api_key)


def _urls(stream: bool = True) -> list[str]:
    m = S.gemini_model
    verb = ":streamGenerateContent?alt=sse" if stream else ":generateContent"
    if S.gemini_base:
        return [f"{S.gemini_base}/models/{m}{verb}"]
    ai = f"https://generativelanguage.googleapis.com/v1beta/models/{m}{verb}"
    vx = f"https://aiplatform.googleapis.com/v1/publishers/google/models/{m}{verb}"
    return [vx, ai] if S.llm_api_key.startswith("AQ.") else [ai, vx]


def _body(system: str, contents: list[dict], tools: list[dict] | None) -> dict:
    gen: dict = {"temperature": 0.8, "maxOutputTokens": 600, "topP": 0.95}
    if "flash" in S.gemini_model and "lite" not in S.gemini_model:
        gen["thinkingConfig"] = {"thinkingBudget": 0}   # no hidden "thinking" delay; lite models reject the field, so it is never sent to them
    body = {"systemInstruction": {"parts": [{"text": system}]}, "contents": contents, "generationConfig": gen}
    if tools:
        body["tools"] = [{"functionDeclarations": tools}]
    return body


def _why(r: httpx.Response) -> str:
    """Google's own explanation, with the key scrubbed, so a wrong key and a wrong model are told apart."""
    try:
        m = str(r.json().get("error", {}).get("message", ""))
    except Exception:
        m = r.text[:200]
    return m.replace(S.llm_api_key, "***")[:240] if S.llm_api_key else m[:240]


def _attempts() -> list[tuple[str, str]]:
    if _working:
        return [_working]
    return [(u, mode) for u in _urls() for mode in ("header", "query")]


def complete_json(system: str, user_text: str, *, max_tokens: int = 400) -> dict:
    """One short, non-streaming call that must answer with a JSON object. Raises LLMError. The caller must validate the result."""
    if not enabled():
        raise LLMError("offline")
    body = {"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": user_text}]}],
            "generationConfig": {"temperature": 0, "maxOutputTokens": max_tokens, "responseMimeType": "application/json"}}
    if "flash" in S.gemini_model and "lite" not in S.gemini_model:
        body["generationConfig"]["thinkingConfig"] = {"thinkingBudget": 0}
    last, detail = "failed", ""
    pairs = [_working_plain] if _working_plain else [(u, m) for u in _urls(False) for m in ("header", "query")]
    for url, mode in pairs:
        headers = {"Content-Type": "application/json"}
        params = None
        if mode == "header":
            headers["x-goog-api-key"] = S.llm_api_key
        else:
            params = {"key": S.llm_api_key}
        try:
            r = _client.post(url, json=body, headers=headers, params=params)
        except httpx.HTTPError as e:
            log.warning("gemini transport error: %s", type(e).__name__)
            last = "busy" if isinstance(e, httpx.TimeoutException) else "failed"
            continue
        if r.status_code != 200:
            msg = _why(r)
            log.warning("gemini json status %s via %s: %s", r.status_code, mode, msg)
            if r.status_code == 429:
                raise LLMError("busy", msg)
            key_bad = r.status_code in (401, 403) or (r.status_code == 400 and "api key" in msg.lower())
            last, detail = ("auth" if key_bad else "failed"), f"Google said {r.status_code}: {msg}"
            if r.status_code in (400, 401, 403, 404) and not _working_plain:
                continue
            raise LLMError(last, detail)
        _set_working_plain((url, mode))
        try:
            parts = r.json()["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
            out = json.loads(text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip())
        except (KeyError, IndexError, ValueError, TypeError):
            raise LLMError("failed", "The model did not return JSON")
        if not isinstance(out, dict):
            raise LLMError("failed", "The model did not return a JSON object")
        return out
    raise LLMError(last, detail)


_working_plain: tuple[str, str] | None = None


def _set_working_plain(v: tuple[str, str]) -> None:
    global _working_plain
    _working_plain = v


def _events(resp: httpx.Response) -> Iterator[dict]:
    for line in resp.iter_lines():
        if not line.startswith("data:"):
            continue
        raw = line[5:].strip()
        if not raw or raw == "[DONE]":
            continue
        try:
            yield json.loads(raw)
        except ValueError:
            continue


def stream_round(system: str, contents: list[dict], tools: list[dict] | None = None) -> Iterator[dict]:
    """Yield {"text": str} and {"call": {"name", "args"}} as they arrive. Raises LLMError."""
    global _working
    if not enabled():
        raise LLMError("offline")
    body = _body(system, contents, tools)
    last, last_detail = "failed", ""
    started = False
    for url, mode in _attempts():
        headers = {"Content-Type": "application/json"}
        params = None
        if mode == "header":
            headers["x-goog-api-key"] = S.llm_api_key
        else:
            params = {"key": S.llm_api_key}
        try:
            with _client.stream("POST", url, json=body, headers=headers, params=params) as r:
                if r.status_code != 200:
                    r.read()
                    msg = _why(r)
                    log.warning("gemini status %s via %s: %s", r.status_code, mode, msg)
                    if r.status_code == 429:
                        raise LLMError("busy", msg)
                    key_bad = r.status_code in (401, 403) or (r.status_code == 400 and "api key" in msg.lower())
                    last, last_detail = ("auth" if key_bad else "failed"), f"Google said {r.status_code}: {msg}"
                    if r.status_code in (400, 401, 403, 404) and not _working:
                        continue          # try the next door / auth style
                    raise LLMError(last, last_detail)
                _working = (url, mode)
                started = True
                for ev in _events(r):
                    for cand in ev.get("candidates", [])[:1]:
                        for part in (cand.get("content") or {}).get("parts", []):
                            if part.get("text") and not part.get("thought"):
                                yield {"text": part["text"]}
                            elif part.get("functionCall"):
                                fc = part["functionCall"]
                                sig = part.get("thoughtSignature") or part.get("thought_signature")
                                out = {"call": {"name": fc.get("name", ""), "args": fc.get("args") or {}}}
                                if sig:
                                    out["sig"] = sig
                                yield out
                return
        except LLMError:
            raise
        except httpx.TimeoutException:
            if started:
                raise LLMError("busy")
            last = "busy"
        except httpx.HTTPError as e:                  # type only: the message can contain the URL
            log.warning("gemini transport error: %s", type(e).__name__)
            if started:
                raise LLMError("failed")
            last = "failed"
    raise LLMError(last, last_detail)
