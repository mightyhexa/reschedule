"""Voice notes: config, validation, the transcription call (faked) and the access rules."""
from conftest import signup
from app import stt


def _audio(n=4000):
    return {"audio": ("note.webm", b"\x1aE\xdf\xa3" + b"\0" * n, "audio/webm;codecs=opus")}


def test_config_reports_off_by_default(client):
    assert client.get("/voice/config").json() == {"server": False}


def test_requires_sign_in(client):
    assert client.post("/voice/transcribe", files=_audio()).status_code == 401


def test_offline_tells_browser_to_take_over(client):
    signup(client, "v1@x.com")
    r = client.post("/voice/transcribe", files=_audio())
    assert r.status_code == 503 and r.json()["detail"]["code"] == "offline"


def test_transcribes_with_hints(client, monkeypatch):
    signup(client, "v2@x.com")
    monkeypatch.setattr(stt.S, "stt_url", "https://stt.example/v1", raising=False)
    monkeypatch.setattr(stt.S, "stt_key", "k", raising=False)
    seen = {}

    class R:
        status_code = 200
        text = "{}"
        def json(self): return {"text": "  LATHE-1 down   for 2 hours "}

    def fake(url, data=None, files=None, headers=None, timeout=None):
        seen.update(url=url, data=data, files=files, headers=headers); return R()

    monkeypatch.setattr(stt.httpx, "post", fake)
    assert client.get("/voice/config").json() == {"server": True}
    r = client.post("/voice/transcribe", files=_audio(), data={"hints": "LATHE-1, VMC-2; <script>", "lang": "hi"})
    assert r.status_code == 200 and r.json()["text"] == "LATHE-1 down for 2 hours"
    assert seen["url"] == "https://stt.example/v1/audio/transcriptions"
    assert "LATHE-1" in seen["data"]["prompt"] and "<script>" not in seen["data"]["prompt"]
    assert "language" not in seen["data"]            # Hindi stays on auto-detect
    assert seen["headers"]["Authorization"] == "Bearer k"


def test_rejects_bad_audio(client, monkeypatch):
    signup(client, "v3@x.com")
    monkeypatch.setattr(stt.S, "stt_url", "https://stt.example/v1", raising=False)
    monkeypatch.setattr(stt.S, "stt_key", "k", raising=False)
    assert client.post("/voice/transcribe", files={"audio": ("a.exe", b"x" * 5000, "application/x-msdownload")}).status_code == 415
    assert client.post("/voice/transcribe", files=_audio(10)).status_code == 422
    assert client.post("/voice/transcribe", files=_audio(stt.MAX_BYTES + 10)).status_code == 413


def test_provider_errors_map_cleanly(client, monkeypatch):
    signup(client, "v4@x.com")
    monkeypatch.setattr(stt.S, "stt_url", "https://stt.example/v1", raising=False)
    monkeypatch.setattr(stt.S, "stt_key", "secret-key", raising=False)

    class R:
        def __init__(self, c): self.status_code, self.text = c, "bad secret-key"
    monkeypatch.setattr(stt.httpx, "post", lambda *a, **k: R(429))
    assert client.post("/voice/transcribe", files=_audio()).status_code == 429
    monkeypatch.setattr(stt.httpx, "post", lambda *a, **k: R(401))
    r = client.post("/voice/transcribe", files=_audio())
    assert r.status_code == 502 and "secret-key" not in r.text
