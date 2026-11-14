"""Read job cards from CSV or XLSX and validate them row by row."""
from __future__ import annotations

import csv
import io
import re
import zipfile
from datetime import datetime, timedelta

from openpyxl import load_workbook

ALIASES = {
    "job_id": {"job_id", "job", "jobid", "job_no", "job_number", "jobcode", "job_code", "order", "order_id", "order_no", "part", "part_no",
               "part_number", "part_id", "item", "item_no", "item_code", "work_order", "wo", "wo_no", "task", "client_order", "customer_order",
               "po", "po_no", "description", "product", "article", "batch", "lot"},
    "op_seq": {"op_seq", "op", "operation", "seq", "sequence", "op_no", "operation_no", "step", "op_number", "opn", "stage", "operation_seq"},
    "eligible_machines": {"eligible_machines", "machines", "machine", "eligible", "machine_ids", "machine_id", "work_center", "work_centre",
                          "station", "cnc", "lathe", "equipment", "resource", "center", "centre", "assigned_to", "line", "mc", "mc_no",
                          "machine_no", "cell", "workstation", "work_station", "asset"},
    "duration_min": {"duration_min", "duration", "minutes", "mins", "time_min", "run_time", "processing_time", "cycle_time", "run_time_min",
                     "runtime", "run_time_minutes", "duration_minutes", "duration_mins", "minutes_per_op", "time_minutes", "cycle_time_min",
                     "hours", "hrs", "hr", "time_hr", "time_hrs", "est_time", "std_time", "standard_time", "est_hours", "est_hrs", "std_hours",
                     "duration_hours", "duration_hrs", "run_hours", "time", "processing_hours", "labour_hours", "labor_hours"},
    "due_at": {"due_at", "due", "due_date", "duedate", "deadline", "delivery", "due_datetime", "delivery_date", "ship_date", "need_by",
               "promise_date", "promised", "required_date", "due_by", "dispatch_date", "target_date"},
    "priority": {"priority", "prio", "pri", "priority_level", "urgency", "rank"},
    "family": {"family", "product_family", "part_family", "material", "group", "category", "alloy", "type", "material_type"},
}
# looser, word-based hints used only for columns the exact names above did not catch
TOKENS = [
    ("duration_min", {"duration", "time", "minutes", "mins", "min", "hours", "hrs", "hr", "cycle", "runtime", "run", "processing", "std", "est"}),
    ("due_at", {"due", "deadline", "delivery", "ship", "promise", "promised", "required", "date"}),
    ("priority", {"prio", "priority", "urgency", "rank"}),
    ("eligible_machines", {"machine", "machines", "station", "cnc", "lathe", "vmc", "equipment", "resource", "center", "centre", "assigned", "mc", "cell", "workstation"}),
    ("op_seq", {"seq", "sequence", "step", "op", "opn", "operation", "stage"}),
    ("family", {"family", "material", "group", "category", "alloy"}),
    ("job_id", {"job", "part", "item", "order", "wo", "task", "product", "article", "batch", "lot", "no", "id", "code", "number"}),
]
LABELS = {"job_id": "Job / part / order", "op_seq": "Operation number", "eligible_machines": "Machine(s)", "duration_min": "Time per operation",
          "due_at": "Due date", "priority": "Priority", "family": "Material / family"}
REQUIRED = ("job_id", "eligible_machines", "duration_min")
DATE_FORMATS = ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M",
                "%d/%m/%Y %H:%M", "%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%y", "%d/%m/%y")
HOUR_WORDS = {"h", "hr", "hrs", "hour", "hours"}
MIN_WORDS = {"m", "min", "mins", "minute", "minutes"}


def template_csv(now: datetime | None = None) -> str:
    d = (now or datetime.now()).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    f = lambda days, h: (d + timedelta(days=days, hours=h)).strftime("%Y-%m-%dT%H:%M")  # noqa: E731
    return (
        "job_id,op_seq,eligible_machines,duration_min,due_at,priority,family\n"
        f"J-014,1,M2|M4,95,{f(0, 16)},2,steel\n"
        f"J-014,2,M1,60,{f(0, 16)},2,steel\n"
        f"J-021,1,M3,120,{f(1, 10)},1,alloy\n"
        f"J-021,2,M1|M2,45,{f(1, 10)},1,alloy\n"
        f"J-033,1,M4,80,{f(1, 18)},3,steel\n"
    )


TEMPLATE = template_csv()


class ImportProblem(Exception):
    pass


class NeedsMapping(ImportProblem):
    """The file is readable but some required columns could not be guessed. Carries what the screen needs to ask the person."""

    def __init__(self, message: str, info: dict):
        super().__init__(message)
        self.info = info


def _norm(h: object) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(h or "").strip().lower()).strip("_")


def _read_rows(filename: str, data: bytes, max_rows: int) -> list[list]:
    name = filename.lower()
    if name.endswith(".xlsx"):
        if data[:2] != b"PK":
            raise ImportProblem("That file is not a real .xlsx workbook.")
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                if sum(i.file_size for i in z.infolist()) > 60 * 1024 * 1024:
                    raise ImportProblem("The workbook is too large when unpacked.")
        except zipfile.BadZipFile:
            raise ImportProblem("That file is not a real .xlsx workbook.")
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)  # formulas are never evaluated
        ws = next((wb[n] for n in wb.sheetnames if n.strip().lower() in ("jobs", "job cards", "jobcards", "job_cards")), wb[wb.sheetnames[0]])
        rows = []
        for r in ws.iter_rows(values_only=True):
            if all(c is None or str(c).strip() == "" for c in r):
                continue
            rows.append(list(r))
            if len(rows) > max_rows + 1:
                raise ImportProblem(f"Too many rows. The limit is {max_rows} operations.")
        return rows
    if name.endswith(".csv") or name.endswith(".txt"):
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = data.decode("latin-1")
        sample = text[:2048]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        rows = [r for r in csv.reader(io.StringIO(text), dialect) if any(c.strip() for c in r)]
        if len(rows) > max_rows + 1:
            raise ImportProblem(f"Too many rows. The limit is {max_rows} operations.")
        return rows
    if name.endswith(".docx"):
        return _read_docx_table(data, max_rows)
    raise ImportProblem("Upload a .xlsx, .csv or .docx (with a table) file. (.xlsm and .xls are not accepted.)")


def _read_docx_table(data: bytes, max_rows: int) -> list[list]:
    """Planning notes kept in a Word document: read the first table that has a job_id-like header."""
    from defusedxml import ElementTree as ET  # safe against entity-expansion attacks

    if data[:2] != b"PK":
        raise ImportProblem("That file is not a real .docx document.")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            if sum(i.file_size for i in z.infolist()) > 60 * 1024 * 1024:
                raise ImportProblem("The document is too large when unpacked.")
            xml = z.read("word/document.xml")
        root = ET.fromstring(xml)
    except (zipfile.BadZipFile, KeyError, ET.ParseError):
        raise ImportProblem("That file is not a real .docx document.")
    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    best: list[list] = []
    for tbl in root.iter(ns + "tbl"):
        rows = []
        for tr in tbl.iter(ns + "tr"):
            cells = ["".join(t.text or "" for t in tc.iter(ns + "t")).strip() for tc in tr.iter(ns + "tc")]
            if any(cells):
                rows.append(cells)
            if len(rows) > max_rows + 1:
                raise ImportProblem(f"Too many rows. The limit is {max_rows} operations.")
        if rows and any(_norm(h) in ALIASES["job_id"] for h in rows[0]):
            return rows
        if len(rows) > len(best):
            best = rows
    if not best:
        raise ImportProblem("No table found in that document. Put the job cards in a Word table with a header row.")
    return best



MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
WEEKDAYS = {d: i for i, d in enumerate(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])}
_TIME_RX = re.compile(r"(?:\bat\s+)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?!\w)|\b(\d{1,2}):(\d{2})\b")


def _clock(t: str) -> tuple[int, int] | None:
    if re.search(r"\bnoon\b", t):
        return 12, 0
    if re.search(r"\bmidnight\b", t):
        return 23, 59
    if re.search(r"\b(eod|end of day|close of business|cob)\b", t):
        return 18, 0
    m = _TIME_RX.search(t)
    if not m:
        return None
    if m.group(1):
        h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3).replace(".", "")
        if not 1 <= h <= 12 or mi > 59:
            return None
        return h % 12 + (12 if ap == "pm" else 0), mi
    h, mi = int(m.group(4)), int(m.group(5))
    return (h, mi) if h < 24 and mi < 60 else None


def _casual_due(s: str, now: datetime) -> datetime | None:
    """'tomorrow 5pm', '14 Nov', 'Nov 14 3pm', '2 days', '+8h', 'friday', 'in 90 min'. Date only means 18:00."""
    t = s.strip().lower().replace(",", " ")
    t = re.sub(r"\s+", " ", t)
    rel = re.fullmatch(r"(?:in )?\+?\s*(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|mins?|minutes?|d|days?|w|weeks?)", t)
    if rel:
        n, u = float(rel.group(1)), rel.group(2)
        mins = n * (60 if u[0] == "h" else 1 if u[0] == "m" else 1440 if u[0] == "d" else 10080)
        return (now + timedelta(minutes=mins)).replace(second=0, microsecond=0)
    clock = _clock(t)
    t_nodate = _TIME_RX.sub(" ", t)
    day: datetime | None = None
    if "day after tomorrow" in t:
        day = now + timedelta(days=2)
    elif "tomorrow" in t:
        day = now + timedelta(days=1)
    elif re.search(r"\b(today|tonight|this evening|this morning)\b", t):
        day = now
    else:
        wd = re.search(r"\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b", t_nodate)
        if wd:
            ahead = (WEEKDAYS[wd.group(1)] - now.weekday()) % 7
            if ahead == 0 and "next" in t:
                ahead = 7
            day = now + timedelta(days=ahead)
    if day is None:
        m = re.search(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?", t_nodate) or \
            re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?\b", t_nodate)
        if m:
            g = m.groups()
            d, mo = (int(g[0]), MONTHS[g[1]]) if g[0].isdigit() else (int(g[1]), MONTHS[g[0]])
            yr = int(g[2]) if g[2] else now.year
            try:
                day = datetime(yr, mo, d)
            except ValueError:
                return None
            if not g[2] and day.date() < (now - timedelta(days=30)).date():
                day = day.replace(year=yr + 1)
    if day is None:
        if clock:  # just a time: today, or tomorrow if that time has passed
            c = now.replace(hour=clock[0], minute=clock[1], second=0, microsecond=0)
            return c if c > now else c + timedelta(days=1)
        return None
    h, mi = clock if clock else (18, 0)
    return day.replace(hour=h, minute=mi, second=0, microsecond=0)


def _parse_due(v, now: datetime | None = None) -> datetime | None:
    if v is None or str(v).strip() == "":
        return None
    if isinstance(v, datetime):
        return v.replace(tzinfo=None, microsecond=0)
    if hasattr(v, "year") and hasattr(v, "month") and not isinstance(v, str):  # a plain date
        return datetime(v.year, v.month, v.day, 18, 0)
    s = str(v).strip()
    for f in DATE_FORMATS:
        try:
            d = datetime.strptime(s, f)
            return d.replace(hour=18) if f in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%y", "%d/%m/%y") else d
        except ValueError:
            pass
    try:  # Excel serial number
        n = float(s)
        if 30000 < n < 80000:
            return datetime(1899, 12, 30) + timedelta(days=n)
    except ValueError:
        pass
    c = _casual_due(s, (now or datetime.now()).replace(second=0, microsecond=0))
    if c:
        return c
    raise ValueError(f"Unreadable due date '{s}'. Try 2026-11-12 16:00, '14 Nov', 'tomorrow 5pm' or '+8h'")


def _dur_cell(v, hours: bool) -> int:
    """One time-per-operation cell to whole minutes. Accepts 95, 1.5, '1h 30m', '90 min', '1:30', Excel times."""
    if v is None or str(v).strip() == "":
        raise ValueError
    if isinstance(v, timedelta):
        x = v.total_seconds() / 60
    elif hasattr(v, "hour") and hasattr(v, "minute") and not hasattr(v, "year"):  # an Excel time cell such as 1:30
        x = v.hour * 60 + v.minute
    elif isinstance(v, (int, float)):
        x = float(v) * (60 if hours else 1)
    else:
        s = str(v).strip().lower().replace(",", ".")
        m = re.fullmatch(r"(\d+):(\d{2})(?::\d{2})?", s)
        if m:
            x = int(m.group(1)) * 60 + int(m.group(2))
        else:
            m = re.fullmatch(r"(?:(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?))?\s*(?:(\d+(?:\.\d+)?)\s*(m|mins?|minutes?))?", s)
            if m and (m.group(1) or m.group(3)):
                x = float(m.group(1) or 0) * 60 + float(m.group(3) or 0)
            else:
                x = float(re.sub(r"[^0-9.]", "", s) if re.fullmatch(r"[0-9.]+\s*[a-z]*", s) else s) * (60 if hours else 1)
    r = int(round(x))
    if not 1 <= r <= 10080:
        raise ValueError
    return r


def _tokens(h: str) -> set[str]:
    return {t for t in h.split("_") if t}


def _guess_columns(header: list[str]) -> dict[str, int]:
    col: dict[str, int] = {}
    used: set[int] = set()
    for key, names in ALIASES.items():      # pass 1: exact names
        for i, h in enumerate(header):
            if h in names and key not in col and i not in used:
                col[key] = i
                used.add(i)
    for key, words in TOKENS:               # pass 2: a recognisable word inside the header
        if key in col:
            continue
        for i, h in enumerate(header):
            if i not in used and h and _tokens(h) & words:
                if key == "job_id" and not (_tokens(h) & {"job", "part", "item", "order", "wo", "task", "product", "article", "batch", "lot"}):
                    continue                # "no", "id", "code" alone are too vague: only with a job-like word
                col[key] = i
                used.add(i)
                break
    return col


def _pick_header(rows: list[list]) -> int:
    """Real sheets often have a title line above the headers. Use the first row (of the top 8) that matches the most columns."""
    best, best_n = 0, -1
    for i, r in enumerate(rows[:8]):
        h = [_norm(c) for c in r]
        n = len(_guess_columns(h))
        if n > best_n:
            best, best_n = i, n
    return best


def _unit(header: str, values: list, forced: str | None) -> tuple[bool, str]:
    """(values are hours?, how we decided)."""
    if forced in ("hours", "minutes"):
        return forced == "hours", "chosen"
    toks = _tokens(header)
    if toks & HOUR_WORDS or "hour" in header or "hrs" in header:
        return True, "header"
    if toks & MIN_WORDS or "minute" in header:
        return False, "header"
    nums: list[float] = []
    for v in values:
        if isinstance(v, bool):
            continue
        if isinstance(v, (int, float)):
            nums.append(float(v))
        elif isinstance(v, str) and re.fullmatch(r"\s*\d+(?:[.,]\d+)?\s*", v):
            nums.append(float(v.replace(",", ".")))
    if nums and max(nums) <= 12 and (any(abs(n - round(n)) > 1e-9 for n in nums) or max(nums) <= 8):
        return True, "guess"
    return False, "guess"


def _read_table(filename: str, data: bytes, max_ops: int) -> list[list]:
    rows = _read_rows(filename, data, max_ops)
    if len(rows) < 2:
        raise ImportProblem("The file has no job rows.")
    return rows


def parse_upload(filename: str, data: bytes, max_ops: int = 3000, *, mapping: dict | None = None, now: datetime | None = None) -> dict:
    return parse_table(_read_table(filename, data, max_ops), max_ops, mapping=mapping, now=now)


def parse_table(rows: list[list], max_ops: int = 3000, *, mapping: dict | None = None, now: datetime | None = None) -> dict:
    mapping = mapping or {}
    hi = _pick_header(rows)
    raw_header = ["" if c is None else str(c).strip() for c in rows[hi]]
    header = [_norm(h) for h in raw_header]
    body = rows[hi + 1:]
    col = _guess_columns(header)
    for key in ALIASES:                      # columns the person picked by hand win over guesses
        pick = mapping.get(key)
        if pick in (None, ""):
            continue
        if pick == "__none__":
            col.pop(key, None)
            continue
        j = next((i for i, h in enumerate(raw_header) if h == pick), None)
        if j is not None:
            col[key] = j
    default_machines = [m.strip() for m in re.split(r"[|;,/]+", str(mapping.get("default_machines") or "")) if m.strip()]
    missing = [k for k in REQUIRED if k not in col and not (k == "eligible_machines" and default_machines)]
    if missing:
        sample = [["" if c is None else str(c)[:40] for c in r[:12]] for r in body[:5]]
        raise NeedsMapping(
            "We could not tell which column is: " + ", ".join(LABELS[k].lower() for k in missing) + ". Pick them below.",
            {"needs_mapping": True, "columns": [h or f"(column {i + 1})" for i, h in enumerate(raw_header)], "raw_columns": raw_header,
             "guess": {k: raw_header[i] for k, i in col.items()}, "missing": missing, "labels": LABELS, "sample": sample},
        )
    if len(body) > max_ops:
        raise ImportProblem(f"Too many rows. The limit is {max_ops} operations.")
    now = (now or datetime.now()).replace(second=0, microsecond=0)

    di = col["duration_min"]
    hours, how = _unit(raw_header[di], [r[di] if di < len(r) else None for r in body], mapping.get("duration_unit"))
    errors: list[dict] = []
    warnings: list[str] = []
    if hours and how != "header":
        warnings.append(f"Times in '{raw_header[di]}' looked like hours, so they were multiplied by 60. Wrong? Choose 'minutes' under Map columns.")
    elif hours and not str(raw_header[di]).strip().lower().startswith("duration_min"):
        warnings.append(f"'{raw_header[di]}' is in hours, converted to minutes.")
    jobs: dict[str, dict] = {}
    seen: set[tuple[str, int]] = set()

    def cell(r: list, key: str):
        i = col.get(key)
        return r[i] if i is not None and i < len(r) else None

    for n, r in enumerate(body, start=hi + 2):
        if all(c is None or str(c).strip() == "" for c in r):
            continue

        def err(msg: str) -> None:
            errors.append({"row": n, "message": msg})

        code = str(cell(r, "job_id") or "").strip()
        if code.endswith(".0") and code[:-2].isdigit():
            code = code[:-2]                 # Excel turns 1042 into 1042.0
        if not code:
            err("job_id is empty")
            continue
        if len(code) > 60:
            err("job_id is too long")
            continue
        raw_m = str(cell(r, "eligible_machines") or "") if "eligible_machines" in col else ""
        machines = list(dict.fromkeys(m.strip() for m in re.split(r"[|;,/]+", raw_m) if m.strip())) or default_machines
        if not machines:
            err("eligible_machines is empty")
        if any(len(m) > 40 for m in machines):
            err("a machine name is too long")
        try:
            dur = _dur_cell(cell(r, "duration_min"), hours)
        except (ValueError, TypeError, OverflowError):
            err("duration_min must be a number between 1 minute and 7 days (10080)")
            dur = 0
        raw_seq = cell(r, "op_seq")
        job = jobs.setdefault(code, {"due": None, "priority": 2, "family": "", "ops": [], "_due_set": False})
        try:
            seq = int(float(str(raw_seq).strip())) if raw_seq not in (None, "") else len(job["ops"]) + 1
            if seq < 1:
                raise ValueError
        except ValueError:
            err("op_seq must be a whole number starting at 1")
            continue
        if (code, seq) in seen:
            err(f"job {code} has operation {seq} twice")
            continue
        seen.add((code, seq))
        try:
            due = _parse_due(cell(r, "due_at"), now)
        except ValueError as e:
            err(str(e))
            due = None
        if due is not None:
            if job["_due_set"] and job["due"] != due:
                warnings.append(f"Row {n}: job {code} has different due dates; the earliest is used.")
                job["due"] = min(job["due"], due)
            else:
                job["due"], job["_due_set"] = due, True
        pr = cell(r, "priority")
        if pr not in (None, ""):
            try:
                job["priority"] = min(9, max(1, int(float(str(pr)))))
            except ValueError:
                low = str(pr).strip().lower()
                words = {"urgent": 1, "high": 1, "critical": 1, "hot": 1, "rush": 1, "medium": 2, "normal": 2, "low": 3, "routine": 3}
                if low in words:
                    job["priority"] = words[low]
                else:
                    err("priority must be a whole number (1 = most urgent) or high / medium / low")
        fam = str(cell(r, "family") or "").strip()[:40]
        if fam:
            job["family"] = fam
        if machines and dur:
            job["ops"].append({"seq": seq, "eligible": machines, "duration_min": dur})

    for code, j in jobs.items():
        j["ops"].sort(key=lambda o: o["seq"])
        seqs = [o["seq"] for o in j["ops"]]
        if seqs and seqs != list(range(1, len(seqs) + 1)):
            warnings.append(f"Job {code}: operation numbers are not 1,2,3… They are run in the order of op_seq.")
        for i, o in enumerate(j["ops"], 1):
            o["seq"] = i
        j.pop("_due_set", None)
    nodue = [c for c, j in jobs.items() if j["due"] is None]
    if nodue and len(nodue) == len(jobs):
        warnings.append("No due dates found, so no job is ever counted as late. Add a due date column for a meaningful plan.")
    elif nodue:
        warnings.append(f"{len(nodue)} job(s) have no due date and are never counted as late (e.g. {', '.join(nodue[:3])}).")
    jobs = {c: j for c, j in jobs.items() if j["ops"]}
    total_ops = sum(len(j["ops"]) for j in jobs.values())
    if total_ops > max_ops:
        errors.append({"row": 0, "message": f"Too many operations ({total_ops}). The limit is {max_ops}."})
    machines = sorted({m for j in jobs.values() for o in j["ops"] for m in o["eligible"]})
    used = {k: raw_header[i] for k, i in col.items()}
    if default_machines and "eligible_machines" not in col:
        used["eligible_machines"] = "(you typed: " + ", ".join(default_machines) + ")"
    return {
        "jobs": jobs, "machines": machines, "errors": errors[:50], "error_count": len(errors),
        "warnings": warnings[:30], "summary": {"jobs": len(jobs), "operations": total_ops, "machines": len(machines)},
        "read_as": used, "duration_unit": "hours" if hours else "minutes", "labels": LABELS,
    }


def parse_manual(items: list[dict], max_ops: int = 3000, *, now: datetime | None = None) -> dict:
    """Jobs typed into the browser table. One item = one operation; repeat a job id for more operations."""
    rows: list[list] = [["job_id", "op_seq", "eligible_machines", "duration_min", "due_at", "priority", "family"]]
    for it in items:
        rows.append([it.get("job_id"), it.get("op_seq"), it.get("eligible_machines"), it.get("duration_min"), it.get("due_at"),
                     it.get("priority"), it.get("family")])
    if len(rows) < 2:
        raise ImportProblem("Add at least one job.")
    return parse_table(rows, max_ops, now=now)
