# ReSchedule demo kit

Every file here was imported, planned and repaired through the real engine before shipping (tests in `backend/tests/test_demo_data.py`).
Machines in all files: LATHE-1, LATHE-2, VMC-1, VMC-2, VMC-3, DRILL-1, GRIND-1.

| File | What it shows | Expect |
|---|---|---|
| `01_quick_demo.csv` | The simplest case, 8 jobs. Use it first and for the 30-second pitch. | 8 jobs, 24 operations |
| `02_shop_week.xlsx` | A real planner's Excel. Headers are *Job No, Work Center, Run Time (min), Due Date*, not our template names, and there is an extra Notes sheet. Main demo file. | 30 jobs, 74 operations |
| `03_planner_notes.docx` | Planning notes in a Word table. | 10 jobs, 26 operations |
| `04_messy_with_errors.csv` | Semicolon-separated, with 5 deliberate mistakes. Shows that bad data is caught row by row and nothing is saved. | Rejected: 5 errors listed with row numbers |
| `05_stress_test.xlsx` | Big file for "does it scale". | 95 jobs, 249 operations, plan in about 3 s |

## IMPORTANT: due dates
Due dates are real dates, and the plan starts when you press Build. The files are built for a plan started on **13 Nov 2026 at 06:00**.
On any other day, regenerate them first (from this folder; needs `pip install openpyxl python-docx`):
```
python make_demo_data.py 2026-11-14T06:00
```
Use the demo morning's date. Otherwise every job looks late.

## 3-minute demo flow
1. Sign in, open **Upload**. Drop `04_messy_with_errors.csv` first: "Bad data never gets in. Every problem is shown with its row." (Nothing is saved.)
2. Drop `02_shop_week.xlsx`. "Same Excel the planner already uses. No sensors, no new hardware." It shows 30 jobs, 74 operations, 7 machines.
3. **Build the plan**, then **Approve and publish**. This is the baseline schedule.
4. **Events**: type one of the sentences below. The system shows what it understood and asks to confirm. Nothing runs without confirmation.
5. Run the repair (2 s limit). Show before and after: jobs moved, on-time %, recovery time. Running jobs are frozen. Approve with one click.
6. Mention `05_stress_test.xlsx`: 249 operations planned in about 3 seconds.

## Sentences that work (type them exactly or in your own words)
- `Lathe-2 broke down for 3 hours`
- `Lathe-2 down till 4 PM` (works out the minutes from the current time, shop time zone)
- `VMC-1 spindle overheating, down 90 minutes`
- `Operator absent on VMC-2 for 2 hours`
- `Material for J-105 arrives 2 hours late` (use a job id that exists; check the Plan page)
- `Rush job R-1 needs 45 minutes on GRIND-1`
- `Power cut for 90 minutes` (whole shop) or `VMC-1 and VMC-2 down for 2 hours`
- `Job J-105 is taking 45 minutes longer`, `Customer needs J-105 two hours earlier`, `Hold job J-108 until tomorrow`, `Cancel job J-108`

No typing needed: the Disruptions page also has a hand-built panel with all eight situations.

## Zero-friction option
Press **Live Workspace (1-Click)** on the home page or login screen to get a ready demo shop without any signup.

Not understood on purpose: a sentence with no machine or no duration. The system asks instead of guessing.

## Honest numbers (measured on these files, plan started 06:00, breakdown 60 min in)
- `02_shop_week.xlsx`, Lathe-2 down 3 h: 11 of the open operations move, all 30 jobs still on time.
- `05_stress_test.xlsx`, VMC-1 down 2 h: 22 operations move, 93 of 95 jobs on time (the baseline already had 1 late).
Your numbers will differ a little with start time and solver time. Say what is on screen. Don't quote these as fixed results.
