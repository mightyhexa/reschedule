"""Settings read from environment variables (or backend/.env). See backend/.env.example."""
from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    f = BACKEND_DIR / ".env"
    if not f.exists():
        return
    for line in f.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.split(" #")[0].strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


def _flag(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    return default if v is None or v == "" else v.strip().lower() in {"1", "true", "yes", "on"}


def _list(name: str, default: str = "") -> list[str]:
    return [x.strip() for x in os.environ.get(name, default).split(",") if x.strip()]


def _dev_secret() -> str:
    """Dev only: a random secret kept in backend/.dev_secret so sessions survive restarts."""
    f = BACKEND_DIR / ".dev_secret"
    try:
        if f.exists():
            s = f.read_text().strip()
            if len(s) >= 32:
                return s
        s = secrets.token_hex(32)
        f.write_text(s)
        return s
    except OSError:
        return secrets.token_hex(32)


@dataclass
class Settings:
    env: str = "dev"
    secret_key: str = ""
    database_url: str = ""
    allowed_origins: list = field(default_factory=list)
    public_app_url: str = "http://localhost:5173"
    api_public_url: str = "http://localhost:5173/api"
    cookie_domain: str | None = None
    cookie_secure: bool = False
    access_ttl_min: int = 15
    refresh_ttl_days: int = 14
    admin_emails: list = field(default_factory=list)
    admin_notify_email: str = ""
    admin_notify_phone: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    wa_token: str = ""
    wa_phone_number_id: str = ""
    wa_otp_template: str = "reschedule_otp"
    wa_notify_template: str = "reschedule_approval"
    wa_lang: str = "en"
    brevo_api_key: str = ""
    resend_api_key: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    mail_from: str = "ReSchedule <no-reply@localhost>"
    turnstile_secret: str = ""
    turnstile_site_key: str = ""
    dev_echo_otp: bool = False
    demo_login: bool = False           # one-click judge workspace; on in dev, off in prod unless DEMO_LOGIN=1
    max_upload_mb: int = 5
    max_ops: int = 2000
    solver_max_s: float = 20.0
    default_tz: str = "Asia/Kolkata"
    cookie_path_prefix: str = "/api"   # where the API is mounted on the public site; "" if served at the root
    trust_proxy: bool = False          # believe X-Forwarded-For (only behind your own proxy)
    llm_provider: str = ""             # "gemini" turns DuckMama on
    llm_api_key: str = ""
    gemini_model: str = "gemini-flash-lite-latest"
    gemini_base: str = ""              # override the API host (auto-detected from the key style if empty)
    benchmark_path: str = ""           # defaults to ../public/data/benchmark.json
    assistant_per_min: int = 12        # chat messages per user per minute
    assistant_per_day: int = 300

    @property
    def is_prod(self) -> bool:
        return self.env == "prod"

    @property
    def field_key_source(self) -> str:
        """Key material for encrypting contact details at rest."""
        return "fields|" + self.secret_key


@lru_cache
def get_settings() -> Settings:
    _load_dotenv()
    e = os.environ.get
    env = e("ENV", "dev").lower()
    prod = env == "prod"
    secret = e("SECRET_KEY", "")
    if prod and len(secret) < 32:
        raise RuntimeError("SECRET_KEY must be a random value of 32+ characters when ENV=prod")
    if not secret:
        secret = _dev_secret()
    db_url = e("DATABASE_URL") or f"sqlite:///{BACKEND_DIR / 'reschedule.db'}"
    if prod and db_url.startswith("sqlite"):
        raise RuntimeError("Use PostgreSQL (DATABASE_URL) when ENV=prod")
    origins = _list("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    if prod and any(o.startswith("http://") for o in origins):
        raise RuntimeError("ALLOWED_ORIGINS must be https in prod")
    return Settings(
        env=env, secret_key=secret, database_url=db_url, allowed_origins=origins,
        public_app_url=e("PUBLIC_APP_URL", "http://localhost:5173").rstrip("/"),
        api_public_url=e("API_PUBLIC_URL", "http://localhost:5173/api").rstrip("/"),
        cookie_domain=e("COOKIE_DOMAIN") or None,
        cookie_secure=_flag("COOKIE_SECURE", prod),
        admin_emails=[x.lower() for x in _list("ADMIN_EMAILS")],
        admin_notify_email=e("ADMIN_NOTIFY_EMAIL", ""), admin_notify_phone=e("ADMIN_NOTIFY_PHONE", ""),
        google_client_id=e("GOOGLE_CLIENT_ID", ""), google_client_secret=e("GOOGLE_CLIENT_SECRET", ""),
        wa_token=e("WHATSAPP_TOKEN", ""), wa_phone_number_id=e("WHATSAPP_PHONE_NUMBER_ID", ""),
        wa_otp_template=e("WHATSAPP_OTP_TEMPLATE", "reschedule_otp"),
        wa_notify_template=e("WHATSAPP_NOTIFY_TEMPLATE", "reschedule_approval"),
        wa_lang=e("WHATSAPP_LANG", "en"),
        brevo_api_key=e("BREVO_API_KEY", ""), resend_api_key=e("RESEND_API_KEY", ""),
        smtp_host=e("SMTP_HOST", ""), smtp_port=int(e("SMTP_PORT", "587")),
        smtp_user=e("SMTP_USER", ""), smtp_password=e("SMTP_PASSWORD", ""),
        mail_from=e("MAIL_FROM", "ReSchedule <no-reply@localhost>"),
        turnstile_secret=e("TURNSTILE_SECRET", ""), turnstile_site_key=e("TURNSTILE_SITE_KEY", ""),
        demo_login=_flag("DEMO_LOGIN", not prod),
        dev_echo_otp=_flag("DEV_ECHO_OTP", False) and not prod,   # never echo codes in prod
        max_upload_mb=int(e("MAX_UPLOAD_MB", "5")), max_ops=int(e("MAX_OPS", "2000")),
        solver_max_s=float(e("SOLVER_MAX_S", "20")), default_tz=e("DEFAULT_TZ", "Asia/Kolkata"),
        cookie_path_prefix=e("COOKIE_PATH_PREFIX", "/api").rstrip("/"), trust_proxy=_flag("TRUST_PROXY", False),
        llm_provider=e("LLM_PROVIDER", "").lower(), llm_api_key=e("LLM_API_KEY", ""), gemini_model=e("GEMINI_MODEL", "gemini-flash-lite-latest"),
        gemini_base=e("GEMINI_BASE", "").rstrip("/"), benchmark_path=e("BENCHMARK_PATH", ""),
        assistant_per_min=int(e("ASSISTANT_PER_MIN", "12")), assistant_per_day=int(e("ASSISTANT_PER_DAY", "300")),
    )
