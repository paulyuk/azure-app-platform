import sys
from pathlib import Path

WORKFLOW_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKFLOW_DIR))

from orchestrator_logic import resolve_decision


def test_external_event_decisions_are_replay_stable():
    event = {"decision": " APPROVE "}

    assert resolve_decision(event) == "approve"
    assert resolve_decision(event) == "approve"
    assert resolve_decision({"decision": "decline"}) == "decline"


def test_timer_wins_and_escalates():
    assert resolve_decision({"decision": "approve"}, timed_out=True) == "escalate"


def test_unknown_event_safely_escalates():
    assert resolve_decision({"decision": "later"}) == "escalate"
