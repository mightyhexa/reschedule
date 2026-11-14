"""Regenerates the demo files. Usage: python make_demo_data.py [YYYY-MM-DDTHH:MM]
The optional start time is when the demo plan begins (default: tomorrow 06:00). Due dates are built from it."""
import csv, random, sys
from datetime import datetime, timedelta
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from docx import Document

OUT = Path(__file__).parent
START = datetime.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else (datetime.now() + timedelta(days=1)).replace(hour=6, minute=0, second=0, microsecond=0)

PROC = {  # process -> machines that can do it
    "turn": ["LATHE-1", "LATHE-2"],
    "mill": ["VMC-1", "VMC-2", "VMC-3"],
    "drill": ["DRILL-1", "VMC-3"],
    "grind": ["GRIND-1"],
}
ROUTES = {  # part type -> (routing, (min, max) minutes per op, family)
    "Shaft": (["turn", "mill", "grind"], (35, 110), "steel"),
    "Flange": (["turn", "drill"], (30, 90), "alloy"),
    "Housing": (["mill", "drill", "mill"], (50, 140), "aluminium"),
    "Bush": (["turn", "grind"], (25, 70), "brass"),
    "Gear blank": (["turn", "mill", "drill", "grind"], (30, 95), "steel"),
    "Bracket": (["mill", "drill"], (30, 80), "aluminium"),
}


def make(n_jobs, seed, horizon_h, tight=(1.6, 4.5)):
    rnd = random.Random(seed)
    rows, n = [], 100
    for _ in range(n_jobs):
        n += rnd.randint(1, 4)
        kind = rnd.choice(list(ROUTES))
        route, (lo, hi), fam = ROUTES[kind]
        total = 0
        ops = []
        for seq, p in enumerate(route, 1):
            d = rnd.randrange(lo, hi + 1, 5)
            total += d
            m = PROC[p] if rnd.random() > 0.25 or len(PROC[p]) == 1 else [rnd.choice(PROC[p])]
            ops.append((seq, m, d))
        slack = rnd.uniform(*tight)
        due = START + timedelta(minutes=int(total * slack + rnd.uniform(0, horizon_h * 60)))
        due = due.replace(minute=(due.minute // 15) * 15, second=0, microsecond=0)
        pr = rnd.choices([1, 2, 3], [0.15, 0.55, 0.30])[0]
        for seq, m, d in ops:
            rows.append(dict(job=f"J-{n}", seq=seq, m="|".join(m), d=d, due=due, pr=pr, fam=fam, kind=kind))
    return rows


def style(ws, widths):
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="2B2B2B")
        c.alignment = Alignment(vertical="center")
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[chr(64 + i)].width = w
    ws.freeze_panes = "A2"


# 1 ---- quick csv (template layout)
rows = make(8, 1, 14)
with open(OUT / "01_quick_demo.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["job_id", "op_seq", "eligible_machines", "duration_min", "due_at", "priority", "family"])
    for r in rows:
        w.writerow([r["job"], r["seq"], r["m"], r["d"], r["due"].strftime("%Y-%m-%dT%H:%M"), r["pr"], r["fam"]])

# 2 ---- shop week, Excel with the headers a real planner would use
rows = make(30, 7, 14, (1.0, 1.3))
wb = Workbook()
ws = wb.active
ws.title = "Jobs"
ws.append(["Job No", "Operation", "Work Center", "Run Time (min)", "Due Date", "Priority", "Material", "Part"])
for r in rows:
    ws.append([r["job"], r["seq"], r["m"], r["d"], r["due"], r["pr"], r["fam"], r["kind"]])
for row in ws.iter_rows(min_row=2, min_col=5, max_col=5):
    row[0].number_format = "dd-mmm-yyyy hh:mm"
style(ws, [10, 11, 20, 15, 20, 9, 12, 12])
nt = wb.create_sheet("Notes")
nt.append(["This sheet is ignored. ReSchedule reads the sheet named Jobs."])
nt.append(["Machines: LATHE-1, LATHE-2, VMC-1, VMC-2, VMC-3, DRILL-1, GRIND-1. Several machines in one cell are split with |"])
wb.save(OUT / "02_shop_week.xlsx")

# 3 ---- Word planner notes with a table
rows = make(10, 11, 30)
doc = Document()
doc.add_heading("Planning sheet, CNC shop", level=1)
doc.add_paragraph("Open orders for this week. Machines in one cell are alternatives (use the first free one).")
t = doc.add_table(rows=1, cols=6)
t.style = "Table Grid"
for c, h in zip(t.rows[0].cells, ["Job", "Op", "Machines", "Minutes", "Due", "Priority"]):
    c.text = h
for r in rows:
    cells = t.add_row().cells
    for c, v in zip(cells, [r["job"], r["seq"], r["m"], r["d"], r["due"].strftime("%Y-%m-%d %H:%M"), r["pr"]]):
        c.text = str(v)
doc.add_paragraph("Supervisor note: priority 1 is the most urgent.")
doc.save(OUT / "03_planner_notes.docx")

# 4 ---- deliberately broken, to show the row-by-row checks (semicolon separated, like a European Excel export)
rows = make(6, 3, 20)
with open(OUT / "04_messy_with_errors.csv", "w", newline="") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["job", "op", "machines", "minutes", "due", "prio"])
    for i, r in enumerate(rows):
        w.writerow([r["job"], r["seq"], r["m"], r["d"], r["due"].strftime("%d-%m-%Y %H:%M"), r["pr"]])
    w.writerow(["", 1, "LATHE-1", 40, "14-11-2026 12:00", 2])            # empty job id
    w.writerow(["J-900", 1, "VMC-1", "abc", "14-11-2026 12:00", 2])      # duration not a number
    w.writerow(["J-901", 1, "VMC-2", 55, "whenever you can", 2])              # unreadable date
    w.writerow(["J-902", 1, "", 55, "14-11-2026 12:00", 2])              # no machine
    w.writerow(["J-903", 1, "GRIND-1", 30, "14-11-2026 12:00", 2])
    w.writerow(["J-903", 1, "GRIND-1", 30, "14-11-2026 12:00", 2])      # same operation twice

# 5 ---- stress test
rows = make(95, 21, 40, (1.0, 1.3))
wb = Workbook()
ws = wb.active
ws.title = "Jobs"
ws.append(["job_id", "op_seq", "eligible_machines", "duration_min", "due_at", "priority", "family"])
for r in rows:
    ws.append([r["job"], r["seq"], r["m"], r["d"], r["due"], r["pr"], r["fam"]])
for row in ws.iter_rows(min_row=2, min_col=5, max_col=5):
    row[0].number_format = "yyyy-mm-dd hh:mm"
style(ws, [10, 9, 22, 13, 18, 9, 12])
wb.save(OUT / "05_stress_test.xlsx")
print("start", START, "ok")
