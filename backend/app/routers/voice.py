"""Voice notes: audio in, text out. The text is only ever shown back to the person to confirm; it never acts by itself."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from .. import stt
from ..deps import current_user
from ..models import User
from ..ratelimit import limit

router = APIRouter(prefix="/voice", tags=["voice"])


@router.get("/config")
def config() -> dict:
    return {"server": stt.enabled()}


@router.post("/transcribe")
def transcribe(request: Request, audio: UploadFile = File(...), hints: str = Form(""), lang: str = Form(""),
               user: User = Depends(current_user)) -> dict:
    limit(request, "stt_min", 12, 60, user.id)
    limit(request, "stt_day", 200, 86400, user.id)
    data = audio.file.read(stt.MAX_BYTES + 1)
    try:
        return {"text": stt.transcribe(data, audio.content_type or "", hints, lang)}
    except stt.STTError as e:
        status = {"offline": 503, "type": 415, "short": 422, "long": 413, "busy": 429, "auth": 502, "failed": 502}.get(e.code, 502)
        raise HTTPException(status, {"code": e.code, "message": {
            "offline": "Server voice is not set up. Your browser will transcribe instead.",
            "short": "That was too short. Hold the button and speak for a moment.",
            "long": "That was too long. Keep notes under 30 seconds.",
            "type": "This audio format is not supported.",
            "busy": "Voice is busy. Try again in a moment.",
        }.get(e.code, "I could not understand that audio. Try again or type it.")})
