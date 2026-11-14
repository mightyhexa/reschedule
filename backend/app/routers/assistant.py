"""DuckMama: streaming chat (server-sent events) backed by Gemini, with read-only tools over the caller's own shop."""
from __future__ import annotations

import json
import logging
import re
from collections.abc import Iterator
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from .. import llm_gemini as llm
from .. import services
from ..assistant_knowledge import AUTH_PAGES, COSTUMES, MOODS, PORTAL_PAGES, SECTIONS, system_prompt
from ..config import get_settings
from ..db import SessionLocal
from ..deps import ACCESS_COOKIE, PERMS
from ..engine.nlp import parse_event
from ..models import Event, Job, Machine, Schedule, User
from ..ratelimit import limit
from ..security import read_access_token

S = get_settings()
log = logging.getLogger("reschedule.assistant")
router = APIRouter(prefix="/assistant", tags=["assistant"])

MAX_TOOL_ROUNDS = 4


# ------------------------------------------------------------------ who is asking
def _maybe_user(request: Request) -> dict | None:
    """Signed-in caller as a plain dict (the DB session is closed before streaming starts), or None."""
    token = request.cookies.get(ACCESS_COOKIE)
    p = read_access_token(token) if token else None
    if not p:
        return None
    with SessionLocal() as db:
        u = db.get(User, p["sub"])
        if not u or not u.is_active or u.token_version != p["tv"]:
            return None
        return {"id": u.id, "shop_id": u.shop_id, "role": u.role, "name": (u.name or "").strip().split(" ")[0][:30],
                "shop_name": u.shop.name, "tz": u.shop.timezone}


def _can(u: dict, perm: str) -> bool:
    return perm in PERMS.get(u["role"], set())


# ------------------------------------------------------------------ request model
class Msg(BaseModel):
    role: Literal["user", "model"]
    text: str = Field(min_length=1, max_length=1500)


class ChatIn(BaseModel):
    messages: list[Msg] = Field(min_length=1, max_length=14)
    page: str = Field(default="", max_length=60)


@router.get("/status")
def status(request: Request) -> dict:
    return {"enabled": llm.enabled(), "signed_in": _maybe_user(request) is not None}


# ------------------------------------------------------------------ control tag
TAG_RE = re.compile(r"<<(.*?)>>", re.S)


def _action(raw: str, signed_in: bool) -> dict | None:
    kind, _, val = raw.partition(":")
    kind, val = kind.strip().lower(), val.strip().lower()
    if kind == "scroll" and not signed_in and val in SECTIONS:
        return {"kind": "scroll", "id": val}
    if kind == "go":
        if not signed_in and val in AUTH_PAGES:
            return {"kind": "route", "to": AUTH_PAGES[val]}
        if signed_in and val in PORTAL_PAGES:
            return {"kind": "route", "to": PORTAL_PAGES[val]}
    return None


def parse_tag(inner: str, signed_in: bool) -> dict:
    """Validate everything the model says: only whitelisted values ever reach the browser."""
    fields = {}
    for part in inner.split("|"):
        k, _, v = part.partition(":")
        fields[k.strip().lower()] = v.strip() if k.strip().lower() == "action" else v.strip().lower()
    mood = fields.get("mood", "calm")
    costume = fields.get("costume", "auto")
    meta = {"mood": mood if mood in MOODS else "calm", "costume": costume if costume in COSTUMES else "auto"}
    act = _action(fields.get("action", "none"), signed_in)
    if act:
        meta["action"] = act
    return meta


class TagFilter:
    """Pulls the leading <<...>> tag off the stream (it may arrive split across chunks) and passes the rest through."""

    def __init__(self, signed_in: bool):
        self.signed_in, self.buf, self.done = signed_in, "", False

    def feed(self, chunk: str) -> tuple[dict | None, str]:
        if self.done:
            return None, chunk
        self.buf += chunk
        head = self.buf.lstrip()
        if head.startswith("<<"):
            m = TAG_RE.match(head)
            if m:
                self.done = True
                rest = head[m.end():].lstrip("\r\n ")
                self.buf = ""
                return parse_tag(m.group(1), self.signed_in), rest
            if len(head) < 200:
                return None, ""          # tag still arriving
        elif len(head) < 2 and "<<".startswith(head):
            return None, ""              # could still become a tag
        self.done = True                 # no tag: speak normally
        out, self.buf = self.buf, ""
        return {"mood": "calm", "costume": "auto"}, out

    def flush(self) -> tuple[dict | None, str]:
        if self.done:
            return None, ""
        self.done = True
        out, self.buf = self.buf, ""
        return {"mood": "calm", "costume": "auto"}, out


# ------------------------------------------------------------------ tools (read-only; the user's own shop only)
def _clock(origin: str | None, minute: int | None) -> str | None:
    if origin is None or minute is None:
        return None
    try:
        return (datetime.fromisoformat(origin) + timedelta(minutes=int(minute))).strftime("%a %H:%M")
    except ValueError:
        return None


def _metrics(m: dict) -> dict:
    keys = ("on_time_pct", "moved_ops", "moved_pct", "late_jobs", "changeover_min", "energy_cost", "solver_status", "solve_s")
    return {k: m.get(k) for k in keys if k in m}


def t_overview(u: dict, args: dict, emit) -> dict:
    with SessionLocal() as db:
        jobs = db.scalar(select(func.count()).select_from(Job).where(Job.shop_id == u["shop_id"])) or 0
        machines = db.scalar(select(func.count()).select_from(Machine).where(Machine.shop_id == u["shop_id"])) or 0
        drafts = db.scalar(select(func.count()).select_from(Schedule).where(Schedule.shop_id == u["shop_id"], Schedule.status == "draft")) or 0
        pub = services.current_schedule(db, u["shop_id"])
        return {"shop": u["shop_name"], "your_role": u["role"], "jobs": jobs, "machines": machines, "pending_drafts": drafts,
                "published_plan": None if not pub else {"version": pub.version, "kind": pub.kind, **_metrics(pub.metrics or {})},
                "advice": None if pub else "No approved plan yet: upload job cards, build a baseline, then approve it."}


def t_drafts(u: dict, args: dict, emit) -> dict:
    with SessionLocal() as db:
        rows = db.scalars(select(Schedule).where(Schedule.shop_id == u["shop_id"], Schedule.status == "draft").order_by(Schedule.version.desc()).limit(8)).all()
        out = []
        for s in rows:
            ev = db.get(Event, s.event_id) if s.event_id else None
            out.append({"id": s.id, "version": s.version, "kind": s.kind, "what_happened": ev.raw_text[:120] if ev and ev.raw_text else (ev.type if ev else None),
                        **_metrics(s.metrics or {}), "tradeoffs": (s.metrics or {}).get("tradeoffs", [])[:3]})
        return {"drafts": out, "can_approve": _can(u, "approve")}


def t_explain(u: dict, args: dict, emit) -> dict:
    code = str(args.get("job", "")).strip()
    if not code:
        return {"error": "Which job code?"}
    with SessionLocal() as db:
        s = db.scalar(select(Schedule).where(Schedule.shop_id == u["shop_id"], Schedule.kind == "repair").order_by(
            (Schedule.status == "draft").desc(), Schedule.version.desc()))
        if not s:
            return {"error": "There is no repair plan yet, so nothing has moved."}
        by_code = {j["code"].lower(): j for j in s.jobs}
        row = by_code.get(code.lower())
        if not row:
            return {"error": f"Job {code[:30]} is not in repair v{s.version}.", "known_jobs": sorted(by_code)[:40]}
        parent = db.get(Schedule, s.parent_id) if s.parent_id else None
        pops = {o["op_id"]: o for o in (parent.ops if parent and parent.shop_id == u["shop_id"] else [])}
        moves = {m["op_id"]: m for m in s.moves}
        freeze = int((s.params or {}).get("freeze_min", 60))
        ev = db.get(Event, s.event_id) if s.event_id else None
        out = []
        for o in s.ops:
            if o["job"].lower() != row["code"].lower():
                continue
            mv, po = moves.get(o["op_id"]), pops.get(o["op_id"])
            if mv and mv["kind"] == "added":
                why = "new work added by this event"
            elif mv:
                why = ("forced off the broken machine" if mv["from_machine"] != mv["to_machine"] else "slid to make room and protect other deadlines")
            elif o["start"] < s.now_min:
                why = "already running or done, never touched"
            elif po and po["start"] < s.now_min + freeze:
                why = f"locked by the {freeze}-minute freeze window"
            else:
                why = "stayed where it was"
            out.append({"op": o["op_id"], "result": why, "machine": o["machine"], "start": _clock(s.origin, o["start"]),
                        "was": None if not mv or mv["from_start"] is None else f"{mv['from_machine']} at {_clock(s.origin, mv['from_start'])}"})
        return {"repair_version": s.version, "status": s.status, "event": None if not ev else {"type": ev.type, "text": (ev.raw_text or "")[:120]},
                "job": row["code"], "due": _clock(s.origin, row["due"]), "late_min_now": row["late_min"], "late_min_before": row["prev_late_min"],
                "operations": out}


STRUCT_KEYS = ("type", "machine", "machines", "job_id", "second_job_id", "other_job_id", "direction", "duration_min", "delay_min",
               "extra_min", "shift_min", "cancel", "reason", "from_machine", "avoid_machine")


def t_propose(u: dict, args: dict, emit) -> dict:
    text = str(args.get("text", "")).strip()[:500]
    struct = {k: args[k] for k in STRUCT_KEYS if args.get(k) not in (None, "")}
    if len(text) < 3 and not struct.get("type"):
        return {"error": "Need the change in words, for example 'M3 down for 2 hours'."}
    if not _can(u, "plan"):
        return {"error": f"A {u['role']} cannot report disruptions. A planner, manager or owner can."}
    with SessionLocal() as db:
        shop = db.get(User, u["id"]).shop
        jobs, _, machines, _ = services.load_problem(db, shop, datetime.utcnow())
        codes = [j.id for j in jobs]
        has_plan = services.current_schedule(db, u["shop_id"]) is not None
    parsed = parse_event(text, machines, codes) if text else {"event": {}, "missing": ["event"], "summary": ""}
    if (parsed["missing"] or not parsed["event"].get("type")) and text and not struct.get("type"):
        from .shop import _llm_event                   # the model proposes JSON, validate_event decides
        ev = _llm_event(text, machines, codes)
        if ev:
            parsed = {"event": ev, "missing": [], "summary": services.describe_event(ev)}
    if struct.get("type"):  # the model filled the fields itself: validate them, fall back to the text parser on failure
        try:
            ev = services.validate_event(struct, machines, codes)
            parsed = {"event": ev, "missing": [], "summary": services.describe_event(ev)}
        except HTTPException as e:
            if parsed["missing"] or not parsed["event"].get("type"):
                return {"understood": False, "problem": str(e.detail), "machines_in_shop": machines[:30], "jobs_in_shop": codes[:40]}
    if parsed["missing"] or not parsed["event"].get("type"):
        return {"understood": False, "missing": parsed["missing"], "machines_in_shop": machines[:30], "jobs_in_shop": codes[:40],
                "note": "Do NOT tell the user to copy or paste anything. Fill the structured fields and call this tool again, or ask ONE short question."}
    if not has_plan:
        return {"understood": True, "summary": parsed["summary"], "card_shown": False, "problem": "No approved baseline plan yet, so there is nothing to repair."}
    _remember(u, event=parsed["event"], raw=text or parsed["summary"], summary=parsed["summary"], sid=None)
    emit({"t": "card", "kind": "disruption", "summary": parsed["summary"], "event": parsed["event"], "raw_text": text or parsed["summary"]})
    return {"understood": True, "summary": parsed["summary"], "card_shown": True,
            "note": "The user sees a confirmation card with a Run repair button. Nothing is applied until they click and a manager approves."}


def t_nav(u: dict, args: dict, emit) -> dict:
    page = str(args.get("page", "")).lower()
    if page == "review":
        sid = str(args.get("id", ""))
        if not re.fullmatch(r"[A-Za-z0-9_-]{6,64}", sid):
            return {"error": "Need a plan id to open a review."}
        with SessionLocal() as db:
            s = db.get(Schedule, sid)
            if not s or s.shop_id != u["shop_id"]:
                return {"error": "No such plan in this shop."}
        emit({"t": "action", "action": {"kind": "route", "to": f"#/app/review/{sid}"}})
        return {"opened": f"review of plan {sid}"}
    if page in PORTAL_PAGES:
        emit({"t": "action", "action": {"kind": "route", "to": PORTAL_PAGES[page]}})
        return {"opened": page}
    return {"error": "Pages: " + ", ".join(PORTAL_PAGES) + ", review"}


TOOLS = {"get_shop_overview": t_overview, "get_pending_drafts": t_drafts, "explain_operation_move": t_explain,
         "propose_disruption": t_propose, "navigate_portal": t_nav}

DECLS = [
    {"name": "get_shop_overview", "description": "This shop's name, number of jobs and machines, the published plan's metrics and how many drafts await approval."},
    {"name": "get_pending_drafts", "description": "Open draft plans waiting for approval, with moved-operation counts and who becomes later."},
    {"name": "explain_operation_move", "description": "Why did a job's operations move (or stay) in the latest repair plan? Pass the job code.",
     "parameters": {"type": "OBJECT", "properties": {"job": {"type": "STRING", "description": "Job code, e.g. J-104"}}, "required": ["job"]}},
    {"name": "propose_disruption", "description": "ALWAYS use this for any change to the plan: breakdown, absence, power cut, late material, slow job, due date change, hold/cancel, rush job, a GAP between or after jobs, swapping or moving a job up/down, moving a job to another machine. Shows the user a ready card; does not change the plan until they approve. Pass the user's words in text, and the fields too when you can.",
     "parameters": {"type": "OBJECT", "properties": {
         "text": {"type": "STRING", "description": "The user's own words, e.g. 'VMC-1 add gap between J-113 and J-108, operator late'"},
         "type": {"type": "STRING", "description": "breakdown, absence, power_cut, material, overrun, deadline, hold, rush, gap, reorder or move_machine"},
         "machine": {"type": "STRING", "description": "Machine code (target machine for move_machine)"},
         "job_id": {"type": "STRING", "description": "Job code. gap: the job the gap comes after. reorder/move_machine: the job to move"},
         "second_job_id": {"type": "STRING", "description": "gap: the job that must wait until the gap ends"},
         "other_job_id": {"type": "STRING", "description": "reorder: the other job"},
         "direction": {"type": "STRING", "description": "reorder: before, after, swap, up or down"},
         "duration_min": {"type": "INTEGER", "description": "Minutes (gap length 60 if unstated, breakdown, hold...)"},
         "reason": {"type": "STRING", "description": "gap: why, e.g. operator late for work"},
         "avoid_machine": {"type": "STRING", "description": "move_machine: keep the job OFF this machine ('remove J-5 from M4'); the planner picks another machine"}}, "required": ["text"]}},
    {"name": "navigate_portal", "description": "Open a page of the app for the user.",
     "parameters": {"type": "OBJECT", "properties": {"page": {"type": "STRING", "description": "plan, upload, events, history, team, account or review"},
                                                       "id": {"type": "STRING", "description": "Plan id, only for review"}}, "required": ["page"]}},
]


# ------------------------------------------------------------------ the chat loop
def sse(obj: dict) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


def _context(u: dict | None, page: str) -> dict:
    page = page if re.fullmatch(r"#?/?[a-z0-9/_-]{0,50}", page or "") else ""
    if not u:
        return {"page": page or "#top", "signed_in": "no"}
    now = services.local_now(type("S", (), {"timezone": u["tz"]})())  # only .timezone is read
    return {"page": page, "signed_in": "yes", "first_name": u["name"], "role": u["role"],
            "permissions": ", ".join(sorted(PERMS.get(u["role"], []))), "shop": u["shop_name"], "shop_local_time": now.strftime("%a %d %b %H:%M")}


def _call_part(c: dict) -> dict:
    """The model's own function call, replayed to it: only the keys Gemini knows; the thought signature goes beside it, never inside."""
    part: dict = {"functionCall": {"name": c["name"], "args": c["args"] if isinstance(c.get("args"), dict) else {}}}
    if c.get("sig"):
        part["thoughtSignature"] = c["sig"]
    return part


class TagStripper:
    """Last line of defence: no <<...>> control text ever reaches the chat bubble, in any round, at any position."""

    def __init__(self) -> None:
        self.buf = ""

    def feed(self, chunk: str) -> str:
        self.buf += chunk
        out = ""
        while True:
            i = self.buf.find("<<")
            if i < 0:
                keep = 1 if self.buf.endswith("<") else 0
                out += self.buf[: len(self.buf) - keep]
                self.buf = self.buf[len(self.buf) - keep:]
                return out
            out += self.buf[:i]
            j = self.buf.find(">>", i)
            if j < 0:
                if len(self.buf) - i > 240:       # never closed: it was not a tag, say it
                    out += self.buf[i:]
                    self.buf = ""
                else:
                    self.buf = self.buf[i:]
                return out
            self.buf = self.buf[j + 2:]

    def flush(self) -> str:
        out, self.buf = TAG_RE.sub("", self.buf), ""
        return out


# what this user last asked for and what is waiting, so "run" and "approve" in the chat mean something
PENDING: dict[str, dict] = {}
PENDING_TTL = 1800

AFFIRM_RE = re.compile(r"^\W*(?:ok(?:ay)?\W+|please\W+)?(run(?: it| this| repair| the repair| now)?|yes|yep|yeah|y|haan|ha|han|go ahead|go|do it|kar do|kardo|chalao|chala do|confirm(?: it)?|proceed|sure|apply(?: it)?)\W*$", re.I)
APPROVE_RE = re.compile(r"^\W*(?:ok(?:ay)?\W+|please\W+|yes\W+)?(approve(?: it| this| the plan| plan)?(?: and publish)?|publish(?: it)?|make it live|go live|approved)\W*$", re.I)
REJECT_RE = re.compile(r"^\W*(reject(?: it| this)?|discard(?: it)?|cancel (?:it|this|that)|no|nope|never ?mind)\W*$", re.I)
QUESTION_RE = re.compile(r"^\W*(how|what|why|when|where|who|can you|could you|do you|does|is|are|explain|tell me|show me|which)\b", re.I)


def _pending(u: dict) -> dict:
    p = PENDING.get(u["id"]) or {}
    if p and datetime.utcnow().timestamp() - p.get("ts", 0) > PENDING_TTL:
        PENDING.pop(u["id"], None)
        return {}
    return p


def _remember(u: dict, **kw) -> None:
    p = _pending(u)
    p.update(kw, ts=datetime.utcnow().timestamp())
    PENDING[u["id"]] = p


def _result_card(sch, summary: str) -> dict:
    m = sch["metrics"]
    return {"t": "card", "kind": "result", "id": sch["id"], "version": sch["version"], "summary": summary,
            "moved": m.get("moved_ops", 0), "moved_pct": m.get("moved_pct", 0), "on_time_pct": m.get("on_time_pct"),
            "late_jobs": m.get("late_jobs", 0), "notes": (sch.get("params") or {}).get("notes", [])}


def _direct(u: dict, text: str, signed_in: bool) -> Iterator[str] | None:
    """Things the server can do for sure, without asking the model: show the card for a clear disruption, run it on 'run',
    publish on 'approve'. Returns None when the model should answer instead."""
    if not signed_in:
        return None
    from . import shop as shop_routes          # late import: shop imports nothing from here
    pend = _pending(u)
    low = text.strip()

    def say(msg: str, *events: dict, mood: str = "calm") -> Iterator[str]:
        yield sse({"t": "meta", "mood": mood, "costume": "auto"})
        for e in events:
            yield sse(e)
        yield sse({"t": "delta", "text": msg})
        yield sse({"t": "done"})

    if AFFIRM_RE.match(low) and pend.get("event") and not pend.get("sid"):
        if not _can(u, "plan"):
            return say(f"A {u['role']} cannot run repairs. A planner, manager or owner can.")
        try:
            with SessionLocal() as db:
                user = db.get(User, u["id"])
                sch = shop_routes.do_event(db, user, pend["event"], pend.get("raw", "")[:500], None, freeze_min=60, time_limit=3.0)
                out = shop_routes._sched_out(sch)
        except HTTPException as e:
            PENDING.pop(u["id"], None)
            return say(f"Could not do that: {e.detail}", mood="empathetic")
        except Exception:
            log.exception("chat run failed")
            return say("The planner hit a problem on that one. Try the Disruptions page, or tell me again in other words.", mood="empathetic")
        _remember(u, sid=out["id"], event=None)
        m = out["metrics"]
        txt = (f"Draft v{out['version']} is ready: {m.get('on_time_pct', 0)}% on time, {m.get('moved_ops', 0)} job step(s) would move. "
               + ("Say \"approve\" and I'll publish it, or open the review to look first." if _can(u, "approve") else "A manager has to approve it."))
        return say(txt, _result_card(out, pend.get("summary", "")), {"t": "action", "action": {"kind": "route", "to": f"#/app/review/{out['id']}"}}, mood="surgical")

    if APPROVE_RE.match(low) and pend.get("sid"):
        if not _can(u, "approve"):
            return say(f"A {u['role']} cannot approve plans. A manager or owner can.")
        try:
            with SessionLocal() as db:
                user = db.get(User, u["id"])
                sch = db.get(Schedule, pend["sid"])
                if not sch or sch.shop_id != user.shop_id or sch.status != "draft":
                    PENDING.pop(u["id"], None)
                    return say("That draft is no longer waiting. Tell me the change again and I'll prepare a new one.")
                shop_routes.do_approve(db, user, sch, "Approved in chat", None)
                ver = sch.version
        except Exception:
            log.exception("chat approve failed")
            return say("I could not publish it. Open the review page and press Approve and publish.", mood="empathetic")
        PENDING.pop(u["id"], None)
        return say(f"Done. Version {ver} is now the live plan.", {"t": "action", "action": {"kind": "route", "to": "#/app"}}, mood="approved" if "approved" in MOODS else "calm")

    if REJECT_RE.match(low) and (pend.get("sid") or pend.get("event")):
        sid = pend.get("sid")
        if sid and _can(u, "approve"):
            with SessionLocal() as db:
                sch = db.get(Schedule, sid)
                if sch and sch.shop_id == u["shop_id"] and sch.status == "draft":
                    sch.status, sch.decided_by, sch.decided_at, sch.decision_note = "rejected", u["id"], datetime.utcnow(), "Rejected in chat"
                    db.commit()
        PENDING.pop(u["id"], None)
        return say("Okay, dropped. The live plan is unchanged.")

    if _can(u, "plan") and len(low) >= 6 and not QUESTION_RE.match(low) and not low.endswith("?"):
        with SessionLocal() as db:
            shop = db.get(User, u["id"]).shop
            jobs, _, machines, _ = services.load_problem(db, shop, datetime.utcnow())
            has_plan = services.current_schedule(db, u["shop_id"]) is not None
            local = services.local_now(shop)
        parsed = parse_event(low, machines, [j.id for j in jobs], local)
        if parsed.get("confident") and parsed["event"].get("type"):
            if not has_plan:
                return say("There is no approved plan yet, so there is nothing to repair. Upload job cards, build a baseline and approve it first.")
            _remember(u, event=parsed["event"], raw=low, summary=parsed["summary"], sid=None)
            return say(f"Ready: {parsed['summary']}. Say \"run\" or press the button, then check the result before approving.",
                       {"t": "card", "kind": "disruption", "summary": parsed["summary"], "event": parsed["event"], "raw_text": low}, mood="surgical")
    return None


def run_chat(u: dict | None, body: ChatIn) -> Iterator[str]:
    signed_in = u is not None
    system = system_prompt(signed_in=signed_in, ctx=_context(u, body.page))
    contents = [{"role": m.role, "parts": [{"text": m.text}]} for m in body.messages]
    decls = DECLS if signed_in else None
    spoke = False
    strip = TagStripper()
    pending: list[dict] = []
    if u is not None and body.messages[-1].role == "user":
        try:
            direct = _direct(u, body.messages[-1].text, signed_in)
        except Exception:
            log.exception("direct chat path failed")
            direct = None
        if direct is not None:
            yield from direct
            return

    def emit(ev: dict) -> None:
        pending.append(ev)

    try:
        for _ in range(MAX_TOOL_ROUNDS):
            text_buf, calls = "", []
            tag = TagFilter(signed_in)           # every round starts with its own control tag
            for ev in llm.stream_round(system, contents, decls):
                if "text" in ev:
                    text_buf += ev["text"]
                    meta, out = tag.feed(ev["text"])
                    if meta:
                        yield sse({"t": "meta", **meta})
                    out = strip.feed(out) if out else out
                    if out:
                        spoke = True
                        yield sse({"t": "delta", "text": out})
                elif "call" in ev:
                    calls.append({"name": ev["call"].get("name", ""), "args": ev["call"].get("args") or {}, "sig": ev.get("sig")})
            if not calls:
                break
            parts = ([{"text": text_buf}] if text_buf else []) + [_call_part(c) for c in calls]
            contents.append({"role": "model", "parts": parts})
            results = []
            for c in calls:
                fn = TOOLS.get(c["name"]) if signed_in else None
                try:
                    res = fn(u, c["args"] if isinstance(c["args"], dict) else {}, emit) if fn else {"error": "Unknown tool"}
                except Exception:
                    log.exception("assistant tool failed: %s", c.get("name"))
                    res = {"error": "That lookup failed. Say so briefly and offer another way."}
                results.append({"functionResponse": {"name": c["name"], "response": {"result": res}}})
            for ev in pending:
                yield sse(ev)
            pending.clear()
            contents.append({"role": "user", "parts": results})
            yield sse({"t": "meta", "mood": "surgical", "costume": "auto"})  # looking things up
        meta, out = tag.flush()
        if meta:
            yield sse({"t": "meta", **meta})
        out = strip.feed(out) + strip.flush() if out else strip.flush()
        if out:
            spoke = True
            yield sse({"t": "delta", "text": out})
        if not spoke:
            yield sse({"t": "error", "code": "empty"})
        else:
            yield sse({"t": "done"})
    except llm.LLMError as e:
        yield sse({"t": "error", "code": e.code, **({} if S.is_prod or not e.detail else {"detail": e.detail})})
    except Exception:
        log.exception("assistant stream failed")
        yield sse({"t": "error", "code": "failed"})


@router.post("/chat")
def chat(body: ChatIn, request: Request):
    if body.messages[-1].role != "user":
        raise HTTPException(422, "Last message must be from the user")
    u = _maybe_user(request)
    if u:
        limit(request, "chat_min", S.assistant_per_min, 60, u["id"])
        limit(request, "chat_day", S.assistant_per_day, 86400, u["id"])
    else:
        limit(request, "chat_anon_min", 6, 60)
        limit(request, "chat_anon_day", 80, 86400)
    return StreamingResponse(run_chat(u, body), media_type="text/event-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no", "Connection": "keep-alive"})
