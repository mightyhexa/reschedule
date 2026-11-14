"""Turn a plain-language shop-floor note into a structured event. Rule based, so nothing is guessed silently:
the result is always shown back to the person for confirmation before it reaches the solver."""
from __future__ import annotations

import re
from datetime import datetime, timedelta

WORDS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
         "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "half": 0.5,
         "ek": 1, "teen": 3, "char": 4, "paanch": 5, "saat": 7, "aath": 8, "das": 10, "aadha": 0.5, "dedh": 1.5, "dhai": 2.5}
UNIT = r"(hours?|hrs?|h|ghant\w*|minutes?|mins?|mint\w*|m|days?|din)\b"
NUM = r"(\d+(?:\.\d+)?|" + "|".join(WORDS) + r")"
KIND = [
    ("power_cut", r"\b(power\s*(cut|outage|failure|loss|trip)|bijli|light\s*(gayi|gai|gaya|cut|off|chali)|current\s*(gaya|gayi|cut)|blackout|black out|load.?shedding|electricity|no power|grid|shop.?wide|whole shop|all machines|every machine|entire shop)\b"),
    ("unassign", r"\b(remove|take|pull|drop|kick|get|shift|move|push|unassign|exclude|avoid|ban|delete|clear|out)\b.*\b(off|out of|out|from|away from|in|on|of)\b"),
    ("gap", r"\bg\s?a\s?p\b|\b(delay|spacing|break|pause|buffer|idle time)\b.*\b(between|after)\b|\bbetween\b.*\b(delay|break|pause)\b"),
    ("reorder", r"\bprioriti[sz]e\b|\b(do|run|process|start|make)\b.*\bfirst\b|\b(push|move|shift|put)\b.*\b(later|last|back)\b|\bswap\b|\bswitch places\b|\bbefore\b|\bahead of\b|\bafter\b|\b(move|push|bring|shift|put)\b.*\b(up|down)\b|\brun\b.*\bfirst\b"),
    ("move_machine", r"\b(move|shift|transfer|reassign|switch|send|put)\b.*\b(to|onto)\b|\b(run|do|process|make)\b.*\b(on|in)\b.*\binstead\b"),
    ("hold", r"\b(hold|cancel\w*|remove|delete|scrap|postpone|pause|put on hold|drop|kill|abort)\b"),
    ("deadline", r"\b(needed?|needs?|due|deadline)\b.*\b(later|earlier|sooner|forward|back)\b|\b(later|earlier)\b.*\b(due|deadline)\b|\b(earlier|sooner|push(?:ed)?\b.*\bback|moved? back|later than|delay\w* the due|pull(?:ed)? in|prepone|bring forward|push(?:ed)? out|due date|deadline|needs? it by|extend the due)\b"),
    ("overrun", r"\b(\w+\s+more\s+(hours?|hrs?|minutes?|mins?)|(hours?|hrs?|minutes?|mins?)\s+more|longer|overrun\w*|over.?run|running slow|slower|takes? more|taking more|extra time|behind schedule|tough cut|ran over)\b"),
    ("breakdown", r"\b(down|not\s+(working|running|starting)|isn.?t\s+(working|running)|out of order|offline|kharab|kharaab|band|bigad\w*|maintenance|servicing|service|calibrat\w*|repair\w*|broke|broken|breakdown|fault|faulty|overheat\w*|fail\w*|jam\w*|seiz\w*|stopp\w*|crash\w*|leak\w*|spindle|coolant)\b"),
    ("absence", r"\b(nobody|no one|no.one|no (worker|labou?r|staff|man)|short of (staff|workers)|worker|staff|absent|absence|on leave|sick|operator|no operator|not coming|missing)\b"),
    ("material", r"\b(material|stock|bar stock|casting|forging|raw|delivery|supplier|not arrived|hasn.t arrived)\b"),
    ("rush", r"\b(rush|urgent|expedite|hot job|insert|customer wants|priority job|asap|immediately)\b"),
]


CLOCK = re.compile(r"\b(?:till|until|til|upto|up to)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?!\w)")


def _until_clock(text: str, now: datetime | None) -> int | None:
    """'down till 4 PM' -> minutes from now to the next 4 PM (shop-local time)."""
    m = CLOCK.search(text.lower())
    if not m or now is None:
        return None
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), (m.group(3) or "").replace(".", "")
    if mi > 59 or h > 24:
        return None
    if ap:
        if not 1 <= h <= 12:
            return None
        h = h % 12 + (12 if ap == "pm" else 0)
    elif h > 23:
        return None
    target = now.replace(hour=h, minute=mi, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return int((target - now).total_seconds() // 60)


def _minutes(text: str, now: datetime | None = None) -> int | None:
    clock = _until_clock(text, now)
    if clock is not None:
        return clock
    t = text.lower().replace("-", " ")
    if re.search(r"\bhalf an hour\b", t):
        return 30
    m = re.search(rf"{NUM}\s*(?:more\s*|extra\s*)?(?:and a half\s*)?{UNIT}", t)
    if not m:
        return None
    n = m.group(1)
    v = float(n) if n[0].isdigit() else float(WORDS[n])
    if "and a half" in m.group(0):
        v += 0.5
    u = m.group(2)
    return int(round(v * (1440 if u.startswith(("d")) else 60 if u.startswith(("h", "g")) else 1)))


def _find_machines(low: str, machines: list[str]) -> list[str]:
    """Every machine named in the note, in the order written. Exact codes first, then 'machine 3' / 'M3' / 'lathe 2' forms."""
    hits: list[tuple[int, str]] = []
    for c in sorted(machines, key=len, reverse=True):
        for m in re.finditer(rf"(?<![\w-]){re.escape(c.lower())}(?![\w-])", low):
            if not any(a <= m.start() < b for a, b in [(p, p + len(x)) for p, x in hits]):
                hits.append((m.start(), c))
    if not hits:
        for mm in re.finditer(r"\b(?:machine|mc|m|cnc|vmc|lathe)[\s#-]*(\d+)\b", low):
            cand = [c for c in machines if re.fullmatch(rf"[a-z\-_ ]*0*{mm.group(1)}", c.lower())]
            hits.append((mm.start(), cand[0] if cand else f"M{mm.group(1)}"))
    return list(dict.fromkeys(c for _, c in sorted(hits)))


def _until_tomorrow(low: str, now: datetime | None) -> int | None:
    if now is None or not re.search(r"\b(till|until|til)\s+tomorrow\b", low):
        return None
    target = (now + timedelta(days=1)).replace(hour=6, minute=0, second=0, microsecond=0)
    return int((target - now).total_seconds() // 60)


def _strip(low: str, js: list[str], ms: list[str]) -> str:
    for c in js + ms:
        low = low.replace(c.lower(), " ")
    return low


def _find_jobs(low: str, jobs: list[str]) -> list[str]:
    """Every known job named in the note, in the order written."""
    hits: list[tuple[int, int, str]] = []
    for c in sorted(jobs, key=len, reverse=True):
        for m in re.finditer(rf"(?<![\w-]){re.escape(c.lower())}(?![\w-])", low):
            if not any(a <= m.start() < b for a, b, _ in hits):
                hits.append((m.start(), m.end(), c))
    return list(dict.fromkeys(c for _, _, c in sorted(hits)))


def _reason(raw: str) -> str:
    m = re.search(r"\(\s*(?:cause|reason|because)?:?\s*([^)]+)\)", raw, re.I) or \
        re.search(r"\b(?:because(?: of)?|cause|due to|reason)\b[:\s]+(.+)$", raw, re.I)
    if not m and "," in raw:                      # "... on VMC-1, operator late for work"
        tail = raw.rsplit(",", 1)[1].strip(" .")
        return tail[:120] if 2 < len(tail) < 80 else ""
    return m.group(1).strip(" .")[:120] if m else ""


def _options(js: list[str], found: list[str], machines: list[str]) -> list[dict]:
    """When the note fits nothing, offer the likely readings as one-click choices instead of a dead end."""
    out: list[dict] = []
    j, m = (js[0] if js else None), (found[0] if found else None)
    if j and m:
        out += [{"label": f"Take {j} off {m} (runs elsewhere)", "event": {"type": "move_machine", "job_id": j, "machine": None, "avoid_machine": m}},
                {"label": f"Cancel {j} completely", "event": {"type": "hold", "job_id": j, "cancel": True, "duration_min": None}},
                {"label": f"{m} is down for 2 hours", "event": {"type": "breakdown", "machine": m, "machines": [m], "duration_min": 120, "start_in_min": 0}}]
    elif j:
        out += [{"label": f"Cancel {j} completely", "event": {"type": "hold", "job_id": j, "cancel": True, "duration_min": None}},
                {"label": f"Hold {j} for 3 hours", "event": {"type": "hold", "job_id": j, "duration_min": 180, "cancel": False}},
                {"label": f"{j} takes 45 minutes longer", "event": {"type": "overrun", "job_id": j, "extra_min": 45}}]
    elif m:
        out += [{"label": f"{m} is down for 2 hours", "event": {"type": "breakdown", "machine": m, "machines": [m], "duration_min": 120, "start_in_min": 0}},
                {"label": f"No operator on {m} for 2 hours", "event": {"type": "absence", "machine": m, "machines": [m], "duration_min": 120, "start_in_min": 0}}]
    return out


def parse_event(text: str, machines: list[str], jobs: list[str], now: datetime | None = None) -> dict:
    raw = text.strip()
    low = raw.lower()
    found = _find_machines(low, machines)
    machine = found[0] if found else None
    js = _find_jobs(low, jobs)
    if not js:
        jm = re.search(r"\bjob\s+([a-z0-9][\w-]*)\b", low)
        if jm and jm.group(1) not in ("is", "has", "needs", "was", "will", "number", "no"):
            js = [jm.group(1).upper()]

    def applies(k: str) -> bool:      # broad wording only counts when the note names what it needs
        if k == "gap":
            return bool(js)
        if k == "reorder":
            return len(js) >= 2 or (len(js) == 1 and not re.search(r"\d", _strip(low, js, found)) and bool(re.search(r"\b(up|down|earlier|later|first|last|back|prioriti[sz]e)\b", low)))
        if k == "move_machine":
            return bool(js and found and re.search(r"\b(to|onto|instead)\b", low))
        if k == "unassign":
            return bool(js and found and not re.search(r"\b(to|onto|instead)\b", low))
        if k == "hold":
            return bool(js) or bool(re.search(r"\b(hold|cancel\w*|postpone|pause)\b", low))
        return True

    kind = next((k for k, rx in KIND if re.search(rx, low) and applies(k)), None)
    job = js[0] if js else None
    if machine and job and machine.lower() == job.lower():
        job = None
    dur = _until_tomorrow(low, now)
    if dur is None:
        dur = _minutes(raw, now)
    ev: dict = {"type": kind, "machine": machine, "job_id": job, "duration_min": dur}
    missing: list[str] = []
    if kind in ("breakdown", "absence"):
        ev = {"type": kind, "machine": machine, "duration_min": dur, "start_in_min": 0}
        if len(found) > 1:
            ev["machines"] = found
        if not machine:
            missing.append("machine")
        if dur is None:
            missing.append("duration")
    elif kind == "power_cut":
        ev = {"type": kind, "machines": found or None, "duration_min": dur, "start_in_min": 0}
        if dur is None:
            missing.append("duration")
    elif kind == "overrun":
        ev = {"type": kind, "job_id": job, "extra_min": dur}
        if not job:
            missing.append("job")
        if dur is None:
            missing.append("extra time")
    elif kind == "deadline":
        earlier = bool(re.search(r"\b(earlier|sooner|pull(?:ed)? in|prepone|bring forward|before)\b", low))
        ev = {"type": kind, "job_id": job, "shift_min": None if dur is None else (-dur if earlier else dur)}
        if not job:
            missing.append("job")
        if dur is None:
            missing.append("how much earlier or later")
    elif kind == "hold":
        cancel = bool(re.search(r"\b(cancel\w*|remove|delete|scrap|drop|kill|abort)\b", low))
        ev = {"type": kind, "job_id": job, "duration_min": None if cancel else dur, "cancel": cancel}
        if not job:
            missing.append("job")
        if not cancel and dur is None:
            missing.append("how long to hold")
    elif kind == "material":
        ev = {"type": kind, "job_id": job, "delay_min": dur}
        if not job:
            missing.append("job")
        if dur is None:
            missing.append("delay")
    elif kind == "rush":
        ev = {"type": kind, "job_id": job or "RUSH", "machine": machine, "duration_min": dur, "due_in_min": None, "priority": 1}
        if dur is None:
            missing.append("run time")
    elif kind == "gap":
        ev = {"type": kind, "job_id": js[0], "second_job_id": js[1] if len(js) > 1 else None, "machine": machine,
              "duration_min": dur or 60, "reason": _reason(raw)}
    elif kind == "reorder":
        if len(js) >= 2 and re.search(r"\bswap\b|\bswitch places\b", low):
            d, x, y = "swap", js[0], js[1]
        elif len(js) >= 2 and re.search(r"\b(before|ahead of)\b", low):
            d, x, y = "before", js[0], js[1]
        elif len(js) >= 2:
            d, x, y = "after", js[0], js[1]
        else:
            d, x, y = ("down" if re.search(r"\b(down|later|last|back)\b", low) else "up"), js[0], None
        ev = {"type": kind, "job_id": x, "other_job_id": y, "direction": d, "machine": machine}
    elif kind == "move_machine":
        ev = {"type": kind, "job_id": js[0], "machine": found[-1], "from_machine": found[0] if len(found) > 1 else None}
    elif kind == "unassign":
        kind = "move_machine"
        ev = {"type": kind, "job_id": js[0], "machine": None, "avoid_machine": found[0], "from_machine": found[0]}
    else:
        missing.append("event type")
        options = _options(js, found, machines)
    ml = " and ".join(found) if len(found) > 1 else (machine or "A machine")
    try:
        summary = _summary(kind, ev, found, machine, dur)
    except (TypeError, KeyError, ValueError, AttributeError):
        summary = ""
    if missing and kind:
        summary = f"Looks like: {kind.replace('_', ' ')}. Still needed: {', '.join(missing)}."
    out = {"event": ev, "missing": missing, "summary": summary, "confident": not missing, "source": "rules"}
    if not kind:
        out["options"] = _options(js, found, machines)
    return out


def _summary(kind, ev, found, machine, dur) -> str:
    ml = " and ".join(found) if len(found) > 1 else (machine or "A machine")
    return {
        "breakdown": lambda: f"{ml} {'are' if len(found) > 1 else 'is'} down for {ev['duration_min']} min",
        "absence": lambda: f"{ml} has no operator for {ev['duration_min']} min",
        "power_cut": lambda: f"Power cut on {' and '.join(found) if found else 'the whole shop'} for {ev['duration_min']} min",
        "overrun": lambda: f"Job {ev['job_id']} runs {ev['extra_min']} min longer than planned",
        "deadline": lambda: f"Job {ev['job_id']} is due {abs(ev['shift_min'])} min {'earlier' if ev['shift_min'] < 0 else 'later'}",
        "hold": lambda: f"Job {ev['job_id']} is cancelled" if ev["cancel"] else f"Job {ev['job_id']} is on hold for {ev['duration_min']} min",
        "material": lambda: f"Material for {ev['job_id'] or 'a job'} arrives {ev['delay_min']} min late",
        "gap": lambda: f"{ev['duration_min']} min gap " + (f"after {ev['job_id']}" if not ev["second_job_id"] else f"between {ev['job_id']} and {ev['second_job_id']}")
                       + (f" on {ev['machine']}" if ev["machine"] else "") + (f" ({ev['reason']})" if ev["reason"] else "") + ("" if dur else " (60 min assumed, change it on the card)"),
        "reorder": lambda: {"swap": f"Swap {ev['job_id']} and {ev['other_job_id']}", "before": f"Run {ev['job_id']} before {ev['other_job_id']}",
                            "after": f"Run {ev['job_id']} after {ev['other_job_id']}", "up": f"Move {ev['job_id']} up", "down": f"Move {ev['job_id']} down"}[ev["direction"]],
        "move_machine": lambda: f"Take {ev['job_id']} off {ev['avoid_machine']} (runs elsewhere, or is removed if it can run nowhere else)" if ev.get("avoid_machine") else f"Move {ev['job_id']} to {ev['machine']}",
        "rush": lambda: f"Rush job {ev['job_id']} needs {ev['duration_min']} min" + (f" on {ev['machine']}" if ev["machine"] else ""),
    }.get(kind or "", lambda: "I could not tell what happened")()
