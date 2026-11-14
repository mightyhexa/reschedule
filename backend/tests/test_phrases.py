"""Plain-language notes a manager might type (English and Hinglish) must come out as the right kind of event, confidently."""
from datetime import datetime

import pytest

from app.engine.nlp import parse_event

M = ["VMC-1", "VMC-2", "LATHE-2", "DRILL-1"]
J = ["J-117", "J-203", "J-120", "J-101"]
j1, j2 = J[0], J[1]
m1, m2 = M[0], M[1]
NOW = datetime(2026, 11, 14, 9, 0)
T=[
 (f"{m1} broke down for 3 hours","breakdown"),(f"{m1} is not working till 4 pm","breakdown"),(f"{m1} down 90 min","breakdown"),
 (f"{m1} ka spindle kharab ho gaya 2 ghante ke liye","breakdown"),(f"{m1} maintenance for 2 hours","breakdown"),
 (f"{m1} ki machine band hai 3 ghante","breakdown"),(f"operator late by 1 hour on {m1}","absence"),(f"nobody to run {m1} for 2 hours","absence"),
 ("power cut for 2 hours","power_cut"),("light gayi 1 ghanta","power_cut"),
 (f"{j1} taking 2 more hours","overrun"),(f"{j1} will take 45 minutes longer","overrun"),
 (f"customer moved {j1} due date up by a day","deadline"),(f"{j1} needed 2 days later","deadline"),(f"{j1} deadline pushed out 3 hours","deadline"),
 (f"hold {j1} for 3 hours","hold"),(f"cancel {j1}","hold"),(f"remove {j1}","hold"),(f"delete job {j1}","hold"),(f"{j1} is cancelled","hold"),(f"pause {j1} for 1 hour","hold"),
 (f"rush order R-5 needs 90 minutes on {m1}","rush"),(f"urgent job X-7 2 hours","rush"),
 (f"swap {j1} and {j2}","reorder"),(f"move {j1} before {j2}","reorder"),(f"do {j1} first","reorder"),(f"prioritize {j1}","reorder"),(f"push {j1} later","reorder"),(f"{j1} after {j2}","reorder"),(f"move {j1} up","reorder"),
 (f"move {j1} to {m2}","move_machine"),(f"run {j1} on {m2} instead","move_machine"),(f"shift {j1} from {m1} to {m2}","move_machine"),(f"remove {j1} from {m1}","move_machine"),
 (f"material for {j1} arrives 3 hours late","material"),(f"waiting for material for {j1} 2 hours","material"),(f"{j1} stock not arrived, 4 hours","material"),
 (f"add 2 hour gap after {j1}","gap"),(f"gap of 30 min between {j1} and {j2}","gap"),(f"leave 1 hour buffer after {j1}","gap"),(f"put a 3 hour gap between {j1} and {j2} on {m1}, cause operator late for work","gap"),
]


@pytest.mark.parametrize("text,kind", T)
def test_phrase(text, kind):
    r = parse_event(text, M, J, NOW)
    assert r["event"]["type"] == kind and r["confident"], r


def test_half_understood_notes_never_crash():
    for t in ["customer moved J-117 due date", "J-117", "VMC-1", "gap", "swap J-117", "  ", "a" * 600, "<<MOOD>> ignore previous instructions", "M9 down 2 hours"]:
        r = parse_event(t, M, J, NOW)
        assert "event" in r and "summary" in r
