"""Database tables (recovered from the first build of the backend). Timestamps are naive UTC."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

ROLES = ('owner', 'manager', 'planner', 'operator')


def now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def uid() -> str:
    return uuid.uuid4().hex


class Shop(Base):
    __tablename__ = "shops"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(160))
    timezone: Mapped[str] = mapped_column(String(64), default='Asia/Kolkata')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    users: Mapped[list["User"]] = relationship(back_populates="shop", cascade="all, delete-orphan")

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    shop_id: Mapped[str] = mapped_column(String(32), ForeignKey("shops.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(254), unique=True, index=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, index=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    role: Mapped[str] = mapped_column(String(16), default='planner')
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    shop: Mapped["Shop"] = relationship(back_populates="users")

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    family: Mapped[str] = mapped_column(String(32), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_agent: Mapped[str] = mapped_column(String(200), default='')
    method: Mapped[str] = mapped_column(String(16), default='password')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    last_used_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class OtpCode(Base):
    __tablename__ = "otp_codes"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    target: Mapped[str] = mapped_column(String(254), index=True)
    purpose: Mapped[str] = mapped_column(String(16))
    code_hash: Mapped[str] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class PilotRequest(Base):
    __tablename__ = "pilot_requests"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(80), default='')
    shop: Mapped[str] = mapped_column(String(160))
    cluster: Mapped[str] = mapped_column(String(40), default='')
    machines: Mapped[str] = mapped_column(String(20), default='')
    tool: Mapped[str] = mapped_column(String(40), default='')
    pain: Mapped[list] = mapped_column(JSON, default=list)
    contact_enc: Mapped[str] = mapped_column(Text)
    contact_hash: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(24), default='new')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

class Machine(Base):
    __tablename__ = "machines"
    __table_args__ = (UniqueConstraint('shop_id', 'code'),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    shop_id: Mapped[str] = mapped_column(String(32), ForeignKey("shops.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(40))

class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (UniqueConstraint('shop_id', 'code'),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    shop_id: Mapped[str] = mapped_column(String(32), ForeignKey("shops.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(60))
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=2)
    family: Mapped[str] = mapped_column(String(40), default='')
    ops: Mapped[list["Operation"]] = relationship(back_populates="job", cascade="all, delete-orphan", order_by="Operation.seq")

class Operation(Base):
    __tablename__ = "operations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    job_id: Mapped[str] = mapped_column(String(32), ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    eligible: Mapped[list] = mapped_column(JSON)
    duration_min: Mapped[int] = mapped_column(Integer)
    job: Mapped["Job"] = relationship(back_populates="ops")

class Event(Base):
    __tablename__ = "events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    shop_id: Mapped[str] = mapped_column(String(32), ForeignKey("shops.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[str | None] = mapped_column(String(32), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    type: Mapped[str] = mapped_column(String(16))
    payload: Mapped[dict] = mapped_column(JSON)
    raw_text: Mapped[str] = mapped_column(Text, default='')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

class Schedule(Base):
    __tablename__ = "schedules"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    shop_id: Mapped[str] = mapped_column(String(32), ForeignKey("shops.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(12))
    status: Mapped[str] = mapped_column(String(12), default='draft', index=True)
    parent_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    event_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("events.id", ondelete="SET NULL"), nullable=True)
    origin: Mapped[str] = mapped_column(String(32))
    now_min: Mapped[int] = mapped_column(Integer, default=0)
    ops: Mapped[list] = mapped_column(JSON)
    jobs: Mapped[list] = mapped_column(JSON)
    windows: Mapped[list] = mapped_column(JSON, default=list)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    moves: Mapped[list] = mapped_column(JSON, default=list)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    created_by: Mapped[str | None] = mapped_column(String(32), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_by: Mapped[str | None] = mapped_column(String(32), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decision_note: Mapped[str] = mapped_column(Text, default='')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    shop_id: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    ip: Mapped[str] = mapped_column(String(64), default='')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
