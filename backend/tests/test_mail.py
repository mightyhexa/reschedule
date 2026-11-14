"""Email: branded templates and the HTTPS providers (no network, the HTTP call is faked)."""
import httpx
import pytest

from app import mailtpl, notify


def test_otp_email_has_code_everywhere_and_escapes():
    for purpose in ("login", "verify", "reset", "unknown"):
        subject, html, text = mailtpl.otp_email("123456", purpose)
        assert "123456" in subject and "123456" in html and "123456" in text
        assert "<html" in html and "expires" in text.lower()
    _, html, _ = mailtpl.invite_email('<b>x</b>', 'Shop & Co', "https://a/#/login")
    assert "<b>x</b>" not in html and "Shop &amp; Co" in html


def test_split_from():
    assert notify._split_from("ReSchedule <hi@x.com>") == ("ReSchedule", "hi@x.com")
    assert notify._split_from("hi@x.com") == ("ReSchedule", "hi@x.com")


class _R:
    def __init__(self, code=201, text="ok"):
        self.status_code, self.text = code, text


def test_brevo_payload(monkeypatch):
    seen = {}
    monkeypatch.setattr(notify.S, "brevo_api_key", "k", raising=False)
    monkeypatch.setattr(notify.S, "mail_from", "ReSchedule <hello@example.com>", raising=False)
    def fake(url, json=None, headers=None, timeout=None):
        seen.update(url=url, json=json, headers=headers); return _R()
    monkeypatch.setattr(notify.httpx, "post", fake)
    assert notify.send_otp("a@b.com", "654321", "login") is True
    assert seen["url"].startswith("https://api.brevo.com")
    assert seen["json"]["sender"]["email"] == "hello@example.com"
    assert "654321" in seen["json"]["htmlContent"] and "654321" in seen["json"]["textContent"]
    assert seen["headers"]["api-key"] == "k"


def test_provider_failure_returns_false(monkeypatch):
    monkeypatch.setattr(notify.S, "brevo_api_key", "k", raising=False)
    monkeypatch.setattr(notify.httpx, "post", lambda *a, **k: _R(401, "unauthorized a@b.com"))
    assert notify.send_email("a@b.com", "s", "t") is False
    def boom(*a, **k): raise httpx.ConnectError("x")
    monkeypatch.setattr(notify.httpx, "post", boom)
    assert notify.send_email("a@b.com", "s", "t") is False
