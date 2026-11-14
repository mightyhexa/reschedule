"""Regression tests for the findings of the pre-deployment audit."""
from conftest import signup


def test_session_survives_access_token_expiry(client):
    signup(client, email="expiry@example.com", shop="Expiry Shop")
    client.cookies.delete("rs_access")            # what happens after the 15 minute access token lapses
    assert client.get("/auth/me").status_code == 401
    r = client.post("/auth/refresh")              # the refresh cookie must still reach this route
    assert r.status_code == 200, r.text
    assert client.get("/auth/me").status_code == 200


def test_refresh_cookie_is_scoped_and_hardened(client):
    signup(client, email="cookie@example.com", shop="Cookie Shop")
    c = client.post("/auth/login", json={"email": "cookie@example.com", "password": "correct-horse-9"})
    sc = [h for h in c.headers.get_list("set-cookie") if h.startswith("rs_refresh=")][0].lower()
    assert "httponly" in sc and "samesite=lax" in sc and "path=/auth" in sc


def test_a_used_refresh_token_ends_the_whole_login_chain(client):
    signup(client, email="chain-reuse@example.com", shop="Chain Shop")
    old = client.cookies.get("rs_refresh")
    assert client.post("/auth/refresh").status_code == 200       # rotates the token
    client.cookies.set("rs_refresh", old, path="/auth")           # a thief replays the old one
    assert client.post("/auth/refresh").status_code == 401
    client.cookies.delete("rs_access")
    assert client.post("/auth/refresh").status_code == 401        # the genuine chain is revoked too


def test_spoofed_forwarded_header_does_not_bypass_rate_limits(client, monkeypatch):
    from app import ratelimit
    from starlette.requests import Request
    scope = {"type": "http", "headers": [(b"x-forwarded-for", b"6.6.6.6")], "client": ("1.2.3.4", 1)}
    assert ratelimit.client_ip(Request(scope)) == "1.2.3.4"       # ignored unless TRUST_PROXY is on


def test_csrf_header_is_required_for_writes(client):
    from fastapi.testclient import TestClient
    from app.main import app
    bare = TestClient(app)
    assert bare.post("/auth/logout").status_code == 403
    assert bare.post("/auth/login", json={"email": "a@example.com", "password": "x"}).status_code == 403


def test_secrets_and_dev_tools_are_not_exposed(client):
    assert "x-content-type-options" in client.get("/health").headers
    assert client.get("/health").headers["cache-control"] == "no-store"
    assert client.get("/admin/pilots").status_code == 401
