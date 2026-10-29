"""pytest tests/ — the logic that every number in the app depends on."""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pipeline"))
from parse import match_rows  # noqa: E402
from wp import WinProb, add_env  # noqa: E402
from drs import break_even, reviews_left, infer_limits  # noqa: E402


def d(bat, bowl, runs=0, extras=None, wicket=None, review=None, non="NS"):
    x = {"batter": bat, "bowler": bowl, "non_striker": non, "runs": {"batter": runs, "extras": 0, "total": runs}}
    if extras:
        x["extras"] = extras
        x["runs"]["total"] += sum(extras.values())
    if wicket:
        x["wickets"] = [wicket]
    if review:
        x["review"] = review
    return x


def match(innings, winner="A", **info):
    base = {"gender": "male", "match_type": "T20", "overs": 20, "teams": ["A", "B"], "dates": ["2024-04-01"],
            "outcome": {"winner": winner}}
    base.update(info)
    return {"info": base, "innings": innings}


def test_state_reconstruction():
    inn1 = {"team": "A", "overs": [{"over": 0, "deliveries": [
        d("a1", "b1", 4),
        d("a1", "b1", 0, extras={"wides": 1}),                       # not a legal ball
        d("a1", "b1", 0, wicket={"player_out": "a1", "kind": "retired hurt"}),  # not a wicket
        d("a2", "b1", 0, wicket={"player_out": "a2", "kind": "lbw"},
          review={"by": "A", "umpire": "U", "batter": "a2", "decision": "struck down"}),
        d("a3", "b1", 1),
    ]}]}
    inn2 = {"team": "B", "target": {"overs": 20, "runs": 7}, "overs": [{"over": 0, "deliveries": [
        d("x1", "y1", 0, review={"by": "A", "umpire": "U", "batter": "x1", "decision": "upheld"}, non="x2"),
    ]}]}
    m, balls = match_rows("t:1", "T", match([inn1, inn2]))
    b = pd.DataFrame(balls)
    assert m["first_innings_total"] == 6 and not m["reduced"]
    assert b.legal_before.tolist() == [0, 1, 1, 2, 3, 0]
    assert b.wkts_before.tolist() == [0, 0, 0, 0, 1, 0]  # retired hurt does not count
    assert b.runs_before.tolist() == [0, 4, 5, 5, 5, 0]
    r = b[b.rev_decision.notna()]
    assert r.rev_side.tolist() == ["bat", "bowl"]
    assert r.rev_batter_pos.tolist() == [3, 1]  # a2 is third to appear after a1 and the non-striker
    assert b[b.inning == 2].target.iloc[0] == 7


def test_unusable_matches_filtered():
    inn = {"team": "A", "overs": [{"over": 0, "deliveries": [d("a", "b")]}]}
    assert match_rows("x", "T", match([inn], gender="female")) is None
    assert match_rows("x", "T", match([inn], overs=10)) is None
    m, _ = match_rows("x", "T", match([inn], outcome={"winner": "A", "method": "D/L"}))
    assert m["reduced"]


def test_break_even():
    assert np.isclose(break_even(0.06, 0.0, 0.2), 0.0)  # free review: always review
    p = float(break_even(0.05, 0.01, 0.2))
    assert np.isclose(p * 0.05, (1 - p) * 0.8 * 0.01)  # expected value is zero at p*
    assert float(break_even(0.10, 0.01, 0.2)) < p  # a bigger wicket lowers the bar


def test_reviews_left_umpires_call_retains():
    rev = pd.DataFrame(dict(
        seq=[1, 2, 3, 4], match_id="m", inning=1, rev_by="A", limit=2,
        clean_fail=[1, 0, 0, 1],  # fail, umpire's call (kept), upheld (kept), fail
    ))
    k, fails = reviews_left(rev)
    assert k.tolist() == [2, 1, 1, 1]
    assert fails.tolist() == [0, 1, 1, 1]


def test_infer_limits():
    rows = []
    for i in range(3):  # three team-innings that review again after an outright failure -> allowance of 2
        rows += [dict(seq=10 * i + 1, match_id=f"m{i}", inning=1, rev_by="A", clean_fail=1, comp="X", season=2024),
                 dict(seq=10 * i + 2, match_id=f"m{i}", inning=1, rev_by="A", clean_fail=0, comp="X", season=2024)]
    rows += [dict(seq=99, match_id="z", inning=1, rev_by="A", clean_fail=1, comp="Y", season=2019)]
    lim = infer_limits(pd.DataFrame(rows))
    assert lim.get(("X", 2024)) == 2 and ("Y", 2019) not in lim.index  # Y falls back to 1


class Half:
    def predict_proba(self, X):
        return np.c_[np.full(len(X), 0.5), np.full(len(X), 0.5)]


def test_winprob_terminal_states():
    wp = WinProb(Half(), Half())
    out = wp.chase([10, 0, 6, 0, 30], [3, 3, 10, 4, 2], [0, 5, 5, 1, 20], [170] * 5)
    assert out.tolist() == [1.0, 0.0, 0.0, 0.5, 0.5]
    assert wp.first([120], [5], [150], [170]).tolist() == [0.5]  # innings over -> 1 - chase(start)


def test_env_uses_only_earlier_matches():
    m = pd.DataFrame(dict(match_id=[f"m{i}" for i in range(15)], comp="C", date=[f"2024-01-{i + 1:02d}" for i in range(15)],
                          reduced=False, result=None, first_innings_total=[100.0] * 14 + [999.0]))
    e = add_env(m).set_index("match_id").env
    assert e["m14"] == 100.0  # the 999 total of this match must not leak into its own environment
    assert e["m0"] == 160.0  # no history -> default
