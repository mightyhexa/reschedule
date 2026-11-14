# ReSchedule

**Schedule repair for CNC job shops. When something breaks, fix the plan. Do not rebuild it.**

When a machine fails, an operator is absent or material arrives late, most planning tools regenerate the whole
schedule and reshuffle jobs that were running fine. ReSchedule keeps every unaffected job where it is and moves
only what the disruption forces to move. Nothing reaches the shop floor until a manager approves it.

> Proprietary software. All rights reserved. See [LICENSE](LICENSE).

## How it works

1. **Upload a plan.** CSV, Excel or Word planning files are parsed into jobs, steps, machines and due times.
2. **Report a disruption in plain words.** "M3 is down for 4 hours", "move J-1004 off M4", "J-1002 before J-1001".
   A rule-based parser handles the common cases, with an optional LLM fallback for unusual phrasing.
3. **Get a smallest-change repair.** A constraint solver freezes everything the disruption does not touch and
   re-optimises only the affected jobs, keeping setups and operator assignments intact.
4. **Review and approve.** The manager sees what moved, what stayed and why, then approves or rejects.

Supported disruptions: machine breakdown, power cut, operator absence, material delay, rush order, job hold,
deadline change, duration overrun, machine gap, job reorder, and moving or removing a job from a machine.

## Architecture

| Layer | Stack | Location |
| --- | --- | --- |
| Web app and landing site | React, TypeScript, Vite, Tailwind CSS, Framer Motion | `src/` |
| API | FastAPI, SQLAlchemy, Pydantic | `backend/app/` |
| Repair engine | Google OR-Tools CP-SAT | `backend/app/engine/` |
| Assistant (DuckMama) | Streaming chat that calls the same repair pipeline as the forms | `backend/app/routers/assistant.py` |
| Data | SQLite in development, PostgreSQL in production | `backend/app/models.py` |

Design points:

- **Trust boundary.** Every disruption, whether typed, parsed or produced by the assistant, passes the same server-side
  validation before it can reach the solver.
- **Approval gate.** Repairs are proposals. Only an owner or manager can publish one.
- **Roles.** Owner, manager, planner and operator permissions are enforced on the server for every route.
- **Account security.** Argon2id password hashing, rate limiting, lockout, rotating refresh cookies and per-tenant isolation.

## Run locally

Requires Node 20+ and Python 3.11+.

```bash
# API, http://localhost:8000
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example .env            # optional in development
uvicorn app.main:app --reload --port 8000

# Web app, http://localhost:5173
cd ..
npm install
npm run dev
```

Sample planning files for trying the upload are in `demo_data/`.

## Tests

```bash
cd backend
pytest
```

The suite covers authentication, roles, tenant isolation, upload parsing, every disruption type, solver
invariants, the assistant's chat flow, and a randomised fuzz test that checks each repair against the schedule rules.

## Deployment

See [DEPLOY.md](DEPLOY.md) for the container and reverse-proxy setup.

## Author

Built by **Fahad**.

- GitHub: [mightyhexa](https://github.com/mightyhexa)
- Instagram: [@f1xwd_](https://www.instagram.com/f1xwd_)
- WhatsApp: [+91 91216 13624](https://wa.me/919121613624)
