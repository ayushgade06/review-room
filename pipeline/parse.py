"""Parse Cricsheet men's T20 JSON zips into ball-level and review-level tables.

Output (data/processed/):
  balls.pkl    one row per delivery, with the match state *before* the delivery
  matches.pkl  one row per match
"""
import glob
import json
import os
import zipfile

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "processed")

# Cricsheet zip stem -> competition label
COMPS = {
    "ipl_json": "IPL", "t20s_male_json": "T20I", "bbl_json": "BBL", "psl_json": "PSL",
    "cpl_json": "CPL", "sat_json": "SA20", "ilt_json": "ILT20", "mlc_json": "MLC",
    "ntb_json": "T20 Blast", "bpl_json": "BPL", "lpl_json": "LPL",
}
# Dismissals that do not cost the batting side a wicket
NOT_A_WICKET = {"retired hurt", "retired not out"}


def match_rows(mid, comp, m):
    """Yield (match_record, [ball_records]) for one Cricsheet match dict, or None if unusable."""
    info = m["info"]
    if info.get("gender") != "male" or info.get("match_type") not in ("T20", "IT20"):
        return None
    if info.get("overs") != 20:
        return None
    outcome = info.get("outcome", {})
    innings = [i for i in m.get("innings", []) if not i.get("super_over")]
    if len(innings) == 0:
        return None
    teams = info["teams"]
    winner = outcome.get("winner")
    result = outcome.get("result")  # 'tie', 'no result', 'draw' or None
    reduced = bool(outcome.get("method")) or any(
        i.get("target", {}).get("overs", 20) != 20 for i in innings)
    match = dict(
        match_id=mid, comp=comp, date=info["dates"][0], season=int(info["dates"][0][:4]),
        team1=teams[0], team2=teams[1], winner=winner, result=result, reduced=reduced,
        venue=info.get("venue"), event=info.get("event", {}).get("name"),
        toss_winner=info.get("toss", {}).get("winner"), toss_decision=info.get("toss", {}).get("decision"),
    )
    balls = []
    first_total = None
    for inn_no, inn in enumerate(innings[:2], start=1):
        bat = inn["team"]
        bowl = teams[1] if bat == teams[0] else teams[0]
        target = None
        if inn_no == 2:
            target = inn.get("target", {}).get("runs") or (first_total + 1 if first_total is not None else None)
        runs = wkts = legal = 0
        order = []  # batting order by first appearance
        for ov in inn.get("overs", []):
            for d in ov["deliveries"]:
                for p in (d["batter"], d["non_striker"]):
                    if p not in order:
                        order.append(p)
                ex = d.get("extras", {})
                is_legal = "wides" not in ex and "noballs" not in ex
                wk = [w for w in d.get("wickets", []) if w.get("kind") not in NOT_A_WICKET]
                rv = d.get("review")
                row = dict(
                    match_id=mid, inning=inn_no, bat_team=bat, bowl_team=bowl, over=ov["over"],
                    legal_before=legal, runs_before=runs, wkts_before=wkts, target=target,
                    runs=d["runs"]["total"], legal=is_legal, wickets=len(wk),
                    wicket_kind=wk[0]["kind"] if wk else None, player_out=wk[0]["player_out"] if wk else None,
                    batter=d["batter"], bowler=d["bowler"],
                )
                if rv:
                    rb = rv.get("batter", d["batter"])
                    row.update(
                        rev_by=rv.get("by"), rev_side="bat" if rv.get("by") == bat else "bowl",
                        rev_decision=rv.get("decision"), rev_umpires_call=bool(rv.get("umpires_call")),
                        rev_umpire=rv.get("umpire"), rev_batter=rb,
                        rev_batter_pos=(order.index(rb) + 1) if rb in order else None,
                    )
                balls.append(row)
                runs += d["runs"]["total"]
                wkts += len(wk)
                legal += is_legal
        # penalty runs awarded outside deliveries are ignored (rare)
        if inn_no == 1:
            first_total = runs
    match["first_innings_total"] = first_total
    return match, balls


def parse_all(raw_dir=RAW):
    matches, balls = [], []
    for z in sorted(glob.glob(os.path.join(raw_dir, "*_json.zip"))):
        comp = COMPS.get(os.path.basename(z)[:-4], os.path.basename(z))
        with zipfile.ZipFile(z) as zf:
            for nm in zf.namelist():
                if not nm.endswith(".json"):
                    continue
                r = match_rows(f"{comp}:{nm[:-5]}", comp, json.loads(zf.read(nm)))
                if r:
                    matches.append(r[0])
                    balls.extend(r[1])
    return pd.DataFrame(matches), pd.DataFrame(balls)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    m, b = parse_all()
    m.to_pickle(os.path.join(OUT, "matches.pkl"))
    b.to_pickle(os.path.join(OUT, "balls.pkl"))
    print(f"{len(m)} matches, {len(b)} deliveries, {b['rev_decision'].notna().sum()} reviews")
    print(m.groupby("comp").size().to_string())
