import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["ENV"] = "dev"
os.environ["COOKIE_PATH_PREFIX"] = ""
os.environ["DEV_ECHO_OTP"] = "1"
os.environ["ADMIN_EMAILS"] = "admin@example.com"
# Tests must never use real services even when backend/.env holds real keys
for k in ("LLM_PROVIDER", "LLM_API_KEY", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID",
          "ADMIN_NOTIFY_EMAIL", "ADMIN_NOTIFY_PHONE", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TURNSTILE_SECRET", "TURNSTILE_SITE_KEY", "GEMINI_BASE"):
    os.environ[k] = ""
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173"

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app import ratelimit


@pytest.fixture(autouse=True)
def _reset_limits():
    ratelimit.reset()


@pytest.fixture()
def client():
    c = TestClient(app, headers={"X-Requested-With": "reschedule"})
    return c


def signup(client, email="owner@example.com", shop="Shop A", phone=None):
    body = {"name": "Owner One", "email": email, "password": "correct-horse-9", "shop_name": shop}
    if phone:
        body["phone"] = phone
    r = client.post("/auth/register", json=body)
    assert r.status_code == 200, r.text
    r = client.post("/auth/verify-email", json={"email": email, "code": r.json()["dev_code"]})
    assert r.status_code == 200, r.text
    return r.json()["user"]
