"""Tests for the per-session activity ring buffer + cursor (feature 1c)."""

import queue
import threading

from primordial.sandbox.manager import AgentSession


class _FakeHandle:
    pid = 1

    def wait(self, on_stdout=None, on_stderr=None):
        # Block until the test is done so _drive_events doesn't flip _alive.
        threading.Event().wait(timeout=2)


def _make_session():
    # AgentSession.__init__ only needs sandbox + cmd_handle + messages here;
    # we pass a fake handle so the reader thread is harmless.
    return AgentSession(
        sandbox=object(),
        cmd_handle=_FakeHandle(),
        messages=queue.Queue(),
        manager=object(),
        on_stdout=lambda d: None,
        on_stderr=lambda d: None,
    )


def test_activity_cursor_only_returns_new_events():
    s = _make_session()
    s.record_activity({"type": "activity", "tool": "search", "description": "q1"})
    s.record_activity({"type": "activity", "tool": "fetch", "description": "u1"})

    events, cursor = s.activity_since(0)
    assert [e["tool"] for e in events] == ["search", "fetch"]
    assert cursor == 2

    # No new events → empty, cursor unchanged.
    events, cursor2 = s.activity_since(cursor)
    assert events == []
    assert cursor2 == cursor

    # One more event → only the new one.
    s.record_activity({"type": "activity", "tool": "write", "description": "w1"})
    events, cursor3 = s.activity_since(cursor2)
    assert [e["tool"] for e in events] == ["write"]
    assert cursor3 == 3


def test_activity_buffer_is_bounded():
    s = _make_session()
    for i in range(500):
        s.record_activity({"type": "activity", "tool": str(i)})
    events, cursor = s.activity_since(0)
    # maxlen=200 — older events evicted; cursor still reflects total seq.
    assert len(events) == 200
    assert cursor == 500
    assert events[-1]["tool"] == "499"
