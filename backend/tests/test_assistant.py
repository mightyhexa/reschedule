import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from fastapi.testclient import TestClient

from app import llm_gemini as llm
from app.main import app
from app.routers import assistant as A
from conftest import signup
from test_api import H, upload

CHAT = {"messages": [{"role": "user", "text": "hi"}], "page": "#problem"}


def events(resp):
    return [json.loads(x[6:]) for x in resp.text.split("\n\n") if x.startswith("data: ")]


@pytest.fixture()
def fake_llm(monkeypatch):
    """Script what 'Gemini' says per round. rounds = list of lists of events; seen = contents passed in each round."""
    state = {"rounds": [], "seen": []}

    def stream_round(system, contents, tools=None):
        state["seen"].append((system, json.loads(json.dumps(contents)), tools))
        yield from state["rounds"].pop(0)

    monkeypatch.setattr(llm, "stream_round", stream_round)
    monkeypatch.setattr(llm, "enabled", lambda: True)
    return state


def test_tag_is_stripped_even_when_split_across_chunks(client, fake_llm):
    fake_llm["rounds"] = [[{"text": "<<MOOD:sm"}, {"text": "ug|COSTUME:boss|ACTION:scroll:proof>"}, {"text": ">\nNinety "}, {"text": "percent."}]]
    ev = events(client.post("/assistant/chat", json=CHAT))
    meta = next(e for e in ev if e["t"] == "meta")
    assert meta["mood"] == "smug" and meta["costume"] == "boss" and meta["action"] == {"kind": "scroll", "id": "proof"}
    assert "".join(e["text"] for e in ev if e["t"] == "delta") == "Ninety percent."
    assert ev[-1]["t"] == "done"


def test_model_output_is_whitelisted(client, fake_llm):
    fake_llm["rounds"] = [[{"text": "<<MOOD:evil|COSTUME:../../x|ACTION:go:https://evil.example>>\nok"}]]
    meta = next(e for e in events(client.post("/assistant/chat", json=CHAT)) if e["t"] == "meta")
    assert meta == {"t": "meta", "mood": "calm", "costume": "auto"}


def test_missing_tag_still_speaks(client, fake_llm):
    fake_llm["rounds"] = [[{"text": "Just text."}]]
    ev = events(client.post("/assistant/chat", json=CHAT))
    assert any(e["t"] == "delta" and e["text"] == "Just text." for e in ev)


def test_public_visitor_gets_no_tools_and_no_private_context(client, fake_llm):
    fake_llm["rounds"] = [[{"text": "<<MOOD:calm|COSTUME:auto|ACTION:none>>\nHi"}]]
    client.post("/assistant/chat", json=CHAT)
    system, _, tools = fake_llm["seen"][0]
    assert tools is None and "PUBLIC MODE" in system and "signed_in: no" in system
    assert "11.1" in system  # benchmark numbers come from benchmark.json


def test_unauthenticated_caller_cannot_use_tools(client, fake_llm):
    fake_llm["rounds"] = [[{"call": {"name": "get_shop_overview", "args": {}}}], [{"text": "<<MOOD:calm|COSTUME:auto|ACTION:none>>\nSign in first."}]]
    client.post("/assistant/chat", json=CHAT)
    resp = fake_llm["seen"][1][1][-1]["parts"][0]["functionResponse"]["response"]["result"]
    assert resp == {"error": "Unknown tool"}


def test_signed_in_tool_round_trip_and_disruption_card(fake_llm):
    c = TestClient(app, headers=H)
    signup(c, "duck1@example.com")
    assert upload(c).status_code == 200
    plan = c.post("/plan/baseline", json={"time_limit": 1}).json()
    assert c.post(f"/schedules/{plan['id']}/approve").status_code == 200
    fake_llm["rounds"] = [
        [{"call": {"name": "propose_disruption", "args": {"text": "M2 is down for 2 hours"}}}],
        [{"text": "<<MOOD:surgical|COSTUME:medic|ACTION:none>>\nCard is up."}],
    ]
    ev = events(c.post("/assistant/chat", json={"messages": [{"role": "user", "text": "M2 spindle went bang"}], "page": "#/app/events"}))
    card = next(e for e in ev if e["t"] == "card")
    assert card["event"]["type"] == "breakdown" and card["event"]["machine"] == "M2" and card["event"]["duration_min"] == 120
    system, _, tools = fake_llm["seen"][0]
    assert "PORTAL MODE" in system and "first_name: Owner" in system and tools
    assert "duck1@example.com" not in system          # email is never sent to the model
    # the card is only a proposal: nothing was created
    assert c.get("/schedules/current").json()["drafts"] == []


def test_duckmama_gap_card_from_words_and_from_fields(fake_llm):
    c = TestClient(app, headers=H)
    signup(c, "duckgap@example.com")
    upload(c)
    plan = c.post("/plan/baseline", json={"time_limit": 1}).json()
    assert c.post(f"/schedules/{plan['id']}/approve").status_code == 200
    jobs = [j["code"] for j in c.get("/data/jobs").json()["jobs"]][:2]
    mc = c.get("/data/jobs").json()["machines"][0]
    for args in ({"text": f"{mc} add gap between {jobs[0]} and {jobs[1]}, cause operator late"},
                 {"text": "gap please", "type": "gap", "job_id": jobs[0], "second_job_id": jobs[1], "machine": mc, "duration_min": 180, "reason": "operator late"}):
        fake_llm["rounds"] = [[{"call": {"name": "propose_disruption", "args": args}}], [{"text": "<<MOOD:calm|COSTUME:auto|ACTION:none>>\nCard ready."}]]
        card = next(e for e in events(c.post("/assistant/chat", json={"messages": [{"role": "user", "text": "gap"}], "page": "#/app/plan"})) if e["t"] == "card")
        assert card["event"]["type"] == "gap" and card["event"]["job_id"] == jobs[0] and card["event"]["second_job_id"] == jobs[1], card
    assert c.get("/schedules/current").json()["drafts"] == []     # still only a proposal until Run repair


def test_operator_cannot_propose_and_other_shops_are_invisible(fake_llm):
    out = A.t_propose({"id": "x", "shop_id": "x", "role": "operator", "name": "", "shop_name": "", "tz": "UTC"}, {"text": "M1 down 1 hour"}, lambda e: None)
    assert "cannot" in out["error"]
    a, b = TestClient(app, headers=H), TestClient(app, headers=H)
    signup(a, "duck-a@example.com", "Shop A")
    signup(b, "duck-b@example.com", "Shop B")
    upload(a)
    fake_llm["rounds"] = [[{"call": {"name": "get_shop_overview", "args": {}}}], [{"text": "<<MOOD:calm|COSTUME:auto|ACTION:none>>\nok"}]]
    b.post("/assistant/chat", json=CHAT)
    res = fake_llm["seen"][1][1][-1]["parts"][0]["functionResponse"]["response"]["result"]
    assert res["shop"] == "Shop B" and res["jobs"] == 0


def test_navigate_only_known_pages(fake_llm):
    c = TestClient(app, headers=H)
    signup(c, "duck2@example.com")
    fake_llm["rounds"] = [[{"call": {"name": "navigate_portal", "args": {"page": "javascript:alert(1)"}}}], [{"text": "<<MOOD:calm|COSTUME:auto|ACTION:none>>\nno"}]]
    ev = events(c.post("/assistant/chat", json=CHAT))
    assert not [e for e in ev if e["t"] == "action"]


def test_llm_failure_is_reported_not_crashed(client, monkeypatch):
    def boom(*a, **k):
        raise llm.LLMError("busy")
        yield
    monkeypatch.setattr(llm, "stream_round", boom)
    ev = events(client.post("/assistant/chat", json=CHAT))
    assert ev[-1] == {"t": "error", "code": "busy"}


def test_not_configured_says_offline(client):
    assert llm.enabled() is False
    assert client.get("/assistant/status").json()["enabled"] is False
    assert events(client.post("/assistant/chat", json=CHAT))[-1] == {"t": "error", "code": "offline"}


def test_rules_and_limits(client, fake_llm):
    assert TestClient(app).post("/assistant/chat", json=CHAT).status_code == 403               # CSRF header
    assert client.post("/assistant/chat", json={"messages": [{"role": "model", "text": "x"}]}).status_code == 422
    assert client.post("/assistant/chat", json={"messages": [{"role": "user", "text": "x" * 2000}]}).status_code == 422
    for _ in range(6):
        fake_llm["rounds"].append([{"text": "hi"}])
        assert client.post("/assistant/chat", json=CHAT).status_code == 200
    assert client.post("/assistant/chat", json=CHAT).status_code == 429


# ---- the real HTTP client against a fake Gemini server (parsing, auth header, function calls, key hygiene)
class _Fake(BaseHTTPRequestHandler):
    seen = []

    def do_POST(self):
        n = int(self.headers.get("content-length", 0))
        _Fake.seen.append((self.path, self.headers.get("x-goog-api-key"), json.loads(self.rfile.read(n))))
        if self.headers.get("x-goog-api-key") != "AIzaTESTKEY":
            self.send_response(403); self.end_headers(); self.wfile.write(b"{}"); return
        self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
        for part in ({"text": "<<MOOD:smug|COSTUME:auto|ACTION:none>>\nHel"}, {"text": "lo"}, {"thought": True, "text": "secret thoughts"},
                     {"functionCall": {"name": "get_shop_overview", "args": {}}}):
            self.wfile.write(("data: " + json.dumps({"candidates": [{"content": {"parts": [part]}}]}) + "\n\n").encode())

    def log_message(self, *a):
        pass


def test_real_client_against_fake_gemini(monkeypatch):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _Fake)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        monkeypatch.setattr(llm.S, "gemini_base", f"http://127.0.0.1:{srv.server_port}/v1beta")
        monkeypatch.setattr(llm.S, "llm_provider", "gemini")
        monkeypatch.setattr(llm.S, "llm_api_key", "AIzaTESTKEY")
        monkeypatch.setattr(llm, "_working", None)
        out = list(llm.stream_round("sys", [{"role": "user", "parts": [{"text": "hi"}]}], A.DECLS))
        assert [e for e in out if "text" in e] == [{"text": "<<MOOD:smug|COSTUME:auto|ACTION:none>>\nHel"}, {"text": "lo"}]   # thoughts dropped
        assert out[-1] == {"call": {"name": "get_shop_overview", "args": {}}}
        path, key, body = _Fake.seen[0]
        assert path.startswith("/v1beta/models/") and ":streamGenerateContent" in path and "key=" not in path   # key is in a header, not the URL
        assert body["systemInstruction"]["parts"][0]["text"] == "sys" and body["tools"][0]["functionDeclarations"]
        monkeypatch.setattr(llm.S, "llm_api_key", "AIzaWRONG")
        monkeypatch.setattr(llm, "_working", None)
        with pytest.raises(llm.LLMError) as e:
            list(llm.stream_round("sys", [{"role": "user", "parts": [{"text": "hi"}]}]))
        assert e.value.code == "auth" and "AIzaWRONG" not in repr(e.value)
    finally:
        srv.shutdown()


def test_function_call_replay_has_no_stray_keys():
    """Gemini rejects unknown fields inside functionCall (it once said: Unknown name "_sig"). The signature rides beside it."""
    part = A._call_part({"name": "propose_disruption", "args": {"text": "x"}, "sig": "abc", "_sig": "junk", "extra": 1})
    assert part == {"functionCall": {"name": "propose_disruption", "args": {"text": "x"}}, "thoughtSignature": "abc"}
    assert A._call_part({"name": "n", "args": None}) == {"functionCall": {"name": "n", "args": {}}}


def _plan_shop(email):
    c = TestClient(app, headers=H)
    signup(c, email)
    upload(c)
    plan = c.post("/plan/baseline", json={"time_limit": 1}).json()
    assert c.post(f"/schedules/{plan['id']}/approve").status_code == 200
    return c


def _say(c, text):
    return events(c.post("/assistant/chat", json={"messages": [{"role": "user", "text": text}], "page": "#/app"}))


def test_chat_does_the_whole_loop_without_the_model(fake_llm):
    """A clear sentence gets a card even if the model would have talked nonsense; 'run' makes the draft; 'approve' publishes it."""
    c = _plan_shop("loop@example.com")
    fake_llm["rounds"] = [[{"text": "<<MOOD:calm|COSTUME:auto|ACTION:none>>\nCard's up, boss."}]]     # model claims a card it never made
    ev = _say(c, "M2 is down for 2 hours")
    card = next(e for e in ev if e["t"] == "card")
    assert card["kind"] == "disruption" and card["event"]["machine"] == "M2"
    assert not fake_llm.get("seen")                                   # the server answered; the model was not asked
    assert c.get("/schedules/current").json()["drafts"] == []
    ev = _say(c, "run")
    res = next(e for e in ev if e["t"] == "card")
    assert res["kind"] == "result" and res["version"] >= 2
    assert any(e["t"] == "action" and res["id"] in e["action"]["to"] for e in ev)
    assert len(c.get("/schedules/current").json()["drafts"]) == 1
    ev = _say(c, "approve it")
    assert "live plan" in "".join(e.get("text", "") for e in ev)
    cur = c.get("/schedules/current").json()
    assert cur["published"]["id"] == res["id"] and cur["drafts"] == []
    assert "live plan" not in "".join(e.get("text", "") for e in _say(c, "approve"))      # nothing pending any more: goes to the model


def test_chat_questions_and_vague_text_go_to_the_model(fake_llm):
    c = _plan_shop("vague@example.com")
    fake_llm["rounds"] = [[{"text": "<<MOOD:calm|COSTUME:auto|ACTION:none>>\nA breakdown means a machine stops."}]]
    ev = _say(c, "what happens if a machine is down for 2 hours?")
    assert not [e for e in ev if e["t"] == "card"] and fake_llm["seen"]


def test_control_tag_never_leaks_in_any_round(fake_llm):
    c = _plan_shop("tags@example.com")
    fake_llm["rounds"] = [
        [{"call": {"name": "get_shop_overview", "args": {}}}],
        [{"text": "<<MOOD:calm|COSTUME:foreman|ACTION:go:plan>>\nLook at the plan. <<MOOD:calm|COSTUME:auto|ACTION:none>> Done."}],
    ]
    said = "".join(e.get("text", "") for e in _say(c, "show me my shop"))
    assert "<<" not in said and ">>" not in said and "MOOD" not in said and "Look at the plan." in said
    st = A.TagStripper()
    assert st.feed("hello <") + st.feed("<MOOD:x") + st.feed("|a>> world") + st.flush() == "hello  world"


def test_operator_cannot_run_or_approve_from_chat(fake_llm):
    c = _plan_shop("ownerx@example.com")
    A._remember({"id": "nobody"}, event={"type": "breakdown"}, raw="x", summary="s", sid=None)
    out = list(A._direct({"id": "nobody", "shop_id": "s", "role": "operator", "name": "", "shop_name": "", "tz": "UTC"}, "run", True))
    assert "cannot run" in "".join(out)
