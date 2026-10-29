"""DRS review economics for men's T20.

For every player review:
  G  = win-probability swing of the wicket in question (gain if the review is upheld)
  L  = option value lost if the review fails outright (a "clean" fail; umpire's call keeps it)
  p* = break-even confidence = (1-s)L / (G + (1-s)L), s = P(umpire's call | review fails)
A captain should review iff their belief that the call is wrong exceeds p*.

Option value V(k) of holding k reviews is estimated empirically: the mean future WP gained from
upheld reviews by teams that held k unsuccessful reviews at that point of the innings.
"""
import json
import os
import sys

import numpy as np
import pandas as pd
import statsmodels.api as sm
from sklearn.isotonic import IsotonicRegression

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wp import PROC, WEB, load_wp  # noqa: E402

REVIEW_SPLIT = "2025-01-01"  # review model: train < 2025, test 2025-2026
COVERAGE_MIN = 0.6  # comp-seasons where >=60% of matches carry review records count as DRS-recorded
DECIDED_G = 0.002  # wicket worth < 0.2 WP points: match effectively decided, break-even undefined


def clean(o):
    """Recursively replace NaN/inf with None and numpy scalars with Python ones (strict JSON)."""
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        return None if not np.isfinite(o) else float(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    return o


def dump(obj, name, **kw):
    with open(os.path.join(WEB, name), "w") as f:
        json.dump(clean(obj), f, allow_nan=False, default=str, **kw)


def wilson(k, n, z=1.96):
    if n == 0:
        return [None, None]
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return [float((c - h) / d), float((c + h) / d)]


def break_even(G, L, s):
    """Minimum belief P(on-field call is wrong) at which reviewing has non-negative expected WP."""
    G, L = np.asarray(G, float), np.asarray(L, float)
    cost = (1 - s) * L
    return np.where(G + cost > 0, cost / np.maximum(G + cost, 1e-12), 0.0)


def reviews_left(df, limit_col="limit"):
    """Unsuccessful reviews remaining *before* each review, per (match, innings, reviewing team).
    Successful and umpire's-call reviews do not consume the allowance."""
    df = df.sort_values("seq")
    fails_before = df.groupby(["match_id", "inning", "rev_by"]).clean_fail.transform(lambda x: x.shift(1, fill_value=0).cumsum())
    return df[limit_col] - fails_before, fails_before


def infer_limits(rev):
    """Allowance per comp-season inferred from data: 2 if teams were seen reviewing after an
    outright failure in that innings at least twice, else 1."""
    _, fb = reviews_left(rev.assign(limit=0))
    rev = rev.assign(fails_before=fb)
    after_fail = rev[rev.fails_before >= 1].groupby(["comp", "season"]).size()
    lim = (after_fail >= 2).map({True: 2, False: 1})
    return lim


def wp_states(wp, d, wkts):
    return wp.batting(d.inning.to_numpy(), d.balls_after.to_numpy(), wkts, d.runs_after.to_numpy(), d.target.fillna(0).to_numpy(), d.env.to_numpy())


def main():
    wp = load_wp()
    matches = pd.read_pickle(os.path.join(PROC, "matches_env.pkl"))
    balls = pd.read_pickle(os.path.join(PROC, "balls.pkl")).reset_index(names="seq")
    ok = matches[(~matches.reduced) & (matches.result != "no result")]
    b = balls.merge(ok[["match_id", "date", "season", "comp", "env", "winner", "team1", "team2", "event"]], on="match_id")
    b = b[(b.inning == 1) | b.target.notna()].copy()
    b["balls_after"] = b.legal_before + b.legal
    b["runs_after"] = b.runs_before + b.runs

    # ---- reviews table
    rev = b[b.rev_decision.isin(["upheld", "struck down"])].copy()
    rev["upheld"] = (rev.rev_decision == "upheld").astype(int)
    rev["uc"] = rev.rev_umpires_call.astype(bool)
    rev["clean_fail"] = ((rev.upheld == 0) & ~rev.uc).astype(int)
    out_final = ((rev.rev_side == "bat") & (rev.upheld == 0)) | ((rev.rev_side == "bowl") & (rev.upheld == 1))
    w_notout = rev.wkts_before + rev.wickets - out_final.astype(int)
    rev["w_notout"] = w_notout
    wp_no = wp_states(wp, rev, w_notout.to_numpy())
    wp_out = wp_states(wp, rev, (w_notout + 1).to_numpy())
    rev["G"] = np.clip(wp_no - wp_out, 0, 1)
    rev["wp_bat_before"] = wp.batting(rev.inning.to_numpy(), rev.legal_before.to_numpy(), rev.wkts_before.to_numpy(),
                                      rev.runs_before.to_numpy(), rev.target.fillna(0).to_numpy(), rev.env.to_numpy())
    limits = infer_limits(rev)
    rev["limit"] = [limits.get((c, s), 1) for c, s in zip(rev.comp, rev.season)]
    rev["k"], _ = reviews_left(rev)
    rev = rev.sort_values("seq")
    rev["k"] = rev["k"].clip(lower=1)

    # ---- DRS-recorded competition-seasons (for option value and unreviewed-LBW audit)
    mrev = rev.groupby("match_id").size()
    cov = ok.assign(has=ok.match_id.isin(mrev.index)).groupby(["comp", "season"]).has.agg(["mean", "size"])
    recorded = cov[(cov["mean"] >= COVERAGE_MIN) & (cov["size"] >= 10)].index
    cs = pd.MultiIndex.from_arrays([b.comp, b.season])
    bR = b[cs.isin(recorded)].copy()
    bR["limit"] = [limits.get((c, s), 1) for c, s in zip(bR.comp, bR.season)]

    # ---- option value V(role, inning, over, k)
    revR = rev[pd.MultiIndex.from_arrays([rev.comp, rev.season]).isin(recorded)]
    inn_len = bR.groupby(["match_id", "inning"]).legal.sum()
    rows = []
    keys = bR.groupby(["match_id", "inning"])[["bat_team", "bowl_team", "limit"]].first()
    rv_by = {k: (g.legal_before.to_numpy(), g.clean_fail.to_numpy(), (g.G * g.upheld).to_numpy())
             for k, g in revR.groupby(["match_id", "inning", "rev_by"])}
    for (mid, inn), r in keys.iterrows():
        n_legal = inn_len.get((mid, inn), 0)
        for role, team in (("bat", r.bat_team), ("bowl", r.bowl_team)):
            g = rv_by.get((mid, inn, team))
            has = mid in mrev.index
            for o in range(20):
                if n_legal <= 6 * o:
                    break
                if g is None:
                    rows.append((role, inn, o, r.limit, 0.0, has))
                    continue
                lb, cf, gain = g
                k = r.limit - cf[lb < 6 * o].sum()
                if k > 0:
                    rows.append((role, inn, o, int(k), float(gain[lb >= 6 * o].sum()), has))
    ov = pd.DataFrame(rows, columns=["role", "inning", "over", "k", "F", "has"])

    def build_V(ov):
        V = {}
        for (role, inn, k), g in ov.groupby(["role", "inning", "k"]):
            agg = g.groupby("over").F.agg(["mean", "size"]).reindex(range(20)).dropna()
            iso = IsotonicRegression(increasing=False).fit(agg.index, agg["mean"], sample_weight=agg["size"])
            V[(role, inn, int(k))] = dict(raw=agg["mean"].tolist(), n=agg["size"].astype(int).tolist(),
                                          smooth=[float(x) for x in iso.predict(np.arange(20))] + [0.0])
        for role in ("bat", "bowl"):  # enforce V(2) >= V(1)
            for inn in (1, 2):
                if (role, inn, 2) in V:
                    V[(role, inn, 2)]["smooth"] = list(np.maximum(V[(role, inn, 2)]["smooth"], V[(role, inn, 1)]["smooth"]))
        return V

    V = build_V(ov)  # all matches in DRS-recorded comp-seasons (a zero-review match counts as zero gain)
    V_up = build_V(ov[ov.has])  # upper bound: only matches with at least one recorded review

    def v_at(role, inn, k, balls, VV=None):
        VV = VV or V
        if k <= 0:
            return 0.0
        curve = VV.get((role, inn, int(min(k, 2))), VV.get((role, inn, 1)))["smooth"]
        x = min(balls, 120) / 6
        i = int(min(x, 19))
        return curve[i] + (curve[i + 1] - curve[i]) * (x - i)

    def lost_value(role, inn, k, balls, VV=None):
        return v_at(role, inn, k, balls, VV) - v_at(role, inn, k - 1, balls, VV)

    s_uc = rev[rev.upheld == 0].groupby("rev_side").uc.mean().to_dict()
    rev["L"] = [lost_value(r.rev_side, r.inning, r.k, r.balls_after) for r in rev.itertuples()]
    rev["L_upper"] = [lost_value(r.rev_side, r.inning, r.k, r.balls_after, V_up) for r in rev.itertuples()]
    rev["p_star"] = [float(break_even(g, l, s_uc[sd])) for g, l, sd in zip(rev.G, rev.L, rev.rev_side)]
    rev["decided"] = (rev.G < DECIDED_G).astype(int)
    rev["realized"] = np.where(rev.upheld == 1, rev.G, np.where(rev.clean_fail == 1, -rev.L, 0.0))
    rev["phase"] = pd.cut(rev.over, [-1, 5, 14, 19], labels=["powerplay", "middle", "death"]).astype(str)
    rev["pos_bucket"] = pd.cut(rev.rev_batter_pos.fillna(6), [0, 3, 7, 11], labels=["1-3", "4-7", "8-11"]).astype(str)
    rev["comp_group"] = np.where(rev.comp == "IPL", "IPL", np.where(rev.comp == "T20I", "T20I", "Other leagues"))
    rev["last_review"] = (rev.k == 1).astype(int)

    # ---- review outcome model: ex-ante features only, chronological validation
    def design(d):
        X = pd.DataFrame(dict(
            bowl=(d.rev_side == "bowl").astype(float),
            p_star=d.p_star, G=d.G,
            last_review=d.last_review.astype(float),
            middle=(d.phase == "middle").astype(float), death=(d.phase == "death").astype(float),
            pos_4_7=(d.pos_bucket == "4-7").astype(float), pos_8_11=(d.pos_bucket == "8-11").astype(float),
            inn2=(d.inning == 2).astype(float),
            t20i=(d.comp_group == "T20I").astype(float), other=(d.comp_group == "Other leagues").astype(float),
            season=(d.season - 2022) / 4.0))
        X["bowl_x_death"] = X.bowl * X.death
        return sm.add_constant(X, has_constant="add")

    tr, te = rev[rev.date < REVIEW_SPLIT], rev[rev.date >= REVIEW_SPLIT]
    full = sm.Logit(tr.upheld, design(tr)).fit(disp=0)
    side_rate = tr.groupby("rev_side").upheld.mean()
    preds = dict(constant=np.full(len(te), tr.upheld.mean()), side_only=te.rev_side.map(side_rate).to_numpy(),
                 logistic=full.predict(design(te)).to_numpy())

    def ll(y, p):
        p = np.clip(p, 1e-6, 1 - 1e-6)
        return float(-(y * np.log(p) + (1 - y) * np.log(1 - p)).mean())

    def auc(y, p):
        r = pd.Series(p).rank().to_numpy()
        n1 = y.sum()
        return float((r[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * (len(y) - n1)))

    yt = te.upheld.to_numpy()
    rng = np.random.default_rng(0)
    mids = te.match_id.to_numpy()
    um = np.unique(mids)
    pos = {m: np.where(mids == m)[0] for m in um}
    lossdiff = []
    for _ in range(500):
        idx = np.concatenate([pos[m] for m in rng.choice(um, len(um))])
        lossdiff.append(ll(yt[idx], preds["logistic"][idx]) - ll(yt[idx], preds["side_only"][idx]))
    review_eval = dict(
        train_n=int(len(tr)), test_n=int(len(te)), train_upheld=float(tr.upheld.mean()), test_upheld=float(te.upheld.mean()),
        models={k: dict(log_loss=ll(yt, p), brier=float(((p - yt) ** 2).mean()), auc=auc(yt, p) if k != "constant" else 0.5)
                for k, p in preds.items()},
        logloss_diff_logistic_minus_side=dict(est=ll(yt, preds["logistic"]) - ll(yt, preds["side_only"]),
                                              ci95=[float(np.percentile(lossdiff, 2.5)), float(np.percentile(lossdiff, 97.5))]),
        calibration=[dict(pred=float(preds["logistic"][q].mean()), obs=float(yt[q].mean()), n=int(q.sum()))
                     for q in [(preds["logistic"] >= lo) & (preds["logistic"] < hi) for lo, hi in
                               [(0, .15), (.15, .2), (.2, .25), (.25, .3), (.3, .35), (.35, .45), (.45, 1)]] if q.sum() > 0])
    print("review model", json.dumps(review_eval["models"]), review_eval["logloss_diff_logistic_minus_side"])

    # Inference model on all reviews (hypothesis tests), match-clustered standard errors.
    allfit = sm.Logit(rev.upheld, design(rev)).fit(disp=0, cov_type="cluster", cov_kwds=dict(groups=pd.factorize(rev.match_id)[0]))
    coefs = [dict(term=t, coef=float(allfit.params[t]), lo=float(allfit.conf_int().loc[t, 0]), hi=float(allfit.conf_int().loc[t, 1]),
                  p=float(allfit.pvalues[t]), odds_ratio=float(np.exp(allfit.params[t]))) for t in allfit.params.index]
    final_model = sm.Logit(rev.upheld, design(rev)).fit(disp=0)
    rev["p_hat"] = final_model.predict(design(rev))
    rev["ev"] = rev.p_hat * rev.G - (1 - rev.p_hat) * (1 - rev.rev_side.map(s_uc)) * rev.L

    # ---- "price of a review" test: observed success vs break-even, by p* bin
    edges = [0, .05, .10, .15, .20, .25, .30, .40, .50, 1.01]
    rev["pbin"] = pd.cut(rev.p_star, edges, right=False)
    price = []
    live = rev[rev.decided == 0]
    for side in ("bat", "bowl", "all"):
        d = live if side == "all" else live[live.rev_side == side]
        for iv, g in d.groupby("pbin", observed=True):
            if len(g) < 15:
                continue
            price.append(dict(side=side, lo=iv.left, hi=iv.right, mean_p_star=float(g.p_star.mean()), n=int(len(g)),
                              success=float(g.upheld.mean()), ci=wilson(g.upheld.sum(), len(g)),
                              share_neg_ev=float((g.ev < 0).mean())))

    # ---- descriptive base rates
    def rate_table(cols):
        out = []
        for key, g in rev.groupby(cols, observed=True):
            key = key if isinstance(key, tuple) else (key,)
            out.append(dict(zip(cols, [str(k) for k in key]), n=int(len(g)), upheld=float(g.upheld.mean()),
                            ci=wilson(g.upheld.sum(), len(g)), uc=float(g.uc.mean())))
        return out

    # ---- unreviewed LBW audit (batting side), DRS-recorded comp-seasons only
    bR = bR.sort_values("seq")
    lbw = bR[(bR.wicket_kind == "lbw") & bR.rev_decision.isna()].copy()
    rv_fail = revR[revR.clean_fail == 1][["match_id", "inning", "rev_by", "seq"]]
    lbw_k = []
    for r in lbw.itertuples():
        f = rv_fail[(rv_fail.match_id == r.match_id) & (rv_fail.inning == r.inning) & (rv_fail.rev_by == r.bat_team) & (rv_fail.seq < r.seq)]
        lbw_k.append(r.limit - len(f))
    lbw["k"] = lbw_k
    w_after = lbw.wkts_before + lbw.wickets
    lbw["G"] = np.clip(wp_states(wp, lbw, (w_after - 1).to_numpy()) - wp_states(wp, lbw, w_after.to_numpy()), 0, 1)
    lbw["L"] = [lost_value("bat", r.inning, r.k, r.balls_after) if r.k > 0 else 0 for r in lbw.itertuples()]
    lbw["p_star"] = [float(break_even(g, l, s_uc["bat"])) if k > 0 else np.nan for g, l, k in zip(lbw.G, lbw.L, lbw.k)]
    bat_rate = float(rev[rev.rev_side == "bat"].upheld.mean())
    lbw_with = lbw[(lbw.k > 0) & (lbw.G >= DECIDED_G)]

    def ev_at(bel):  # total expected WP from reviewing every such LBW, if the batter's belief had been `bel`
        return float((bel * lbw_with.G - (1 - bel) * (1 - s_uc["bat"]) * lbw_with.L).sum())

    unrev = dict(
        lbw_dismissals=int(len(lbw) + len(revR[(revR.rev_side == "bat") & (revR.wicket_kind == "lbw")])),
        unreviewed=int(len(lbw)), unreviewed_with_review_left=int((lbw.k > 0).sum()), live=int(len(lbw_with)),
        cheap_options=int((lbw_with.p_star < 0.10).sum()),
        cheap_options_death=int(((lbw_with.p_star < 0.10) & (lbw_with.over >= 15)).sum()),
        median_p_star=float(lbw_with.p_star.median()), bat_review_success=bat_rate,
        median_G=float(lbw_with.G.median()), median_L=float(lbw_with.L.median()),
        matches=int(lbw_with.match_id.nunique()), ev_if_belief={str(b): ev_at(b) for b in (0.02, 0.05, 0.10, 0.20)})
    print("unreviewed lbw", unrev)

    # ---- team audit
    teams = []
    for (comp, team), g in rev.groupby(["comp", "rev_by"]):
        if len(g) < 15:
            continue
        teams.append(dict(comp=comp, team=team, n=int(len(g)), seasons=f"{g.season.min()}-{g.season.max()}",
                          upheld=float(g.upheld.mean()), ci=wilson(g.upheld.sum(), len(g)),
                          expected=float(g.p_hat.mean()), over_expected=float(g.upheld.mean() - g.p_hat.mean()),
                          net_wp=float(g.realized.sum()), per_review=float(g.realized.mean()),
                          neg_ev_share=float((g.ev < 0).mean()),
                          bat_n=int((g.rev_side == "bat").sum()), bowl_n=int((g.rev_side == "bowl").sum())))

    # ---- threshold map: mean wicket value G by (inning, over, WP bucket) across all ball states
    st = bR[bR.legal_before < 120].copy()
    st["balls_after"] = st.legal_before  # value of a wicket at the start of this ball
    st["runs_after"] = st.runs_before
    wp_now = wp_states(wp, st, st.wkts_before.to_numpy())
    st["G"] = np.clip(wp_now - wp_states(wp, st, (st.wkts_before + 1).to_numpy()), 0, 1)
    st["wpb"] = np.minimum((wp_now * 5).astype(int), 4)
    gmap = st.groupby(["inning", "over", "wpb"]).G.agg(["mean", "size"]).reset_index()
    tmap = []
    for r in gmap.itertuples():
        if r.size < 200:
            continue
        for role in ("bat", "bowl"):
            for k in (1, 2):
                L = lost_value(role, r.inning, k, r.over * 6 + 3)
                tmap.append(dict(inning=int(r.inning), over=int(r.over), wp_bucket=int(r.wpb), role=role, k=k,
                                 G=float(r.mean), L=float(L), p_star=float(break_even(r.mean, L, s_uc[role])), n=int(r.size)))

    # ---- curated scenarios (deterministic rules, 2024+ seasons, live states only) with WP worms
    recent = rev[(rev.season >= 2024) & (rev.decided == 0)]
    rules = [
        ("swing_ipl", "The overturn that swung it", recent[(recent.upheld == 1) & (recent.comp == "IPL")], "G", False),
        ("swing_t20i", "International: biggest overturn", recent[(recent.upheld == 1) & (recent.comp == "T20I")], "G", False),
        ("found_wicket", "The wicket DRS found", recent[(recent.upheld == 1) & (recent.rev_side == "bowl") & (recent.comp != "IPL")], "G", False),
        ("barely_mattered", "When the wicket barely mattered", recent[(recent.clean_fail == 1)], "p_star", False),
        ("free_swing", "A miss that was still right", recent[(recent.clean_fail == 1) & (recent.over >= 16) & (recent.comp == "IPL")], "G", False),
        ("umpires_call", "Saved by umpire's call", recent[recent.uc], "G", False),
    ]
    scen, used = [], set()
    for sid, title, d, key, asc in rules:
        d = d[~d.seq.isin(used)].sort_values(key, ascending=asc)
        if len(d):
            r = d.iloc[0]
            used.add(r.seq)
            scen.append(dict(id=sid, title=title, kind="review", seq=int(r.seq), match_id=r.match_id))
    lw = lbw_with[lbw_with.season >= 2024].sort_values("G", ascending=False)
    if len(lw):
        scen.append(dict(id="never_taken", title="The review never taken", kind="unreviewed", seq=int(lw.iloc[0].seq),
                         match_id=lw.iloc[0].match_id))
    allrows = pd.concat([rev.assign(kind="review"), lbw_with.assign(kind="unreviewed")])
    for sc in scen:
        r = allrows[(allrows.seq == sc["seq"]) & (allrows.kind == sc["kind"])].iloc[0]
        mb = b[b.match_id == sc["match_id"]].sort_values("seq")
        wk_after = (mb.wkts_before + mb.wickets).to_numpy()
        wpb = wp_states(wp, mb, wk_after)
        wp_first = np.where(mb.inning == 1, wpb, 1 - wpb)  # WP of the side batting first, after each ball
        m = matches[matches.match_id == sc["match_id"]].iloc[0]
        first_team = mb[mb.inning == 1].bat_team.iloc[0]
        sc.update(
            comp=r.comp, season=int(r.season), date=r.date, event=r.event, inning=int(r.inning), over=int(r.over),
            ball_in_over=int(((mb.seq < r.seq) & (mb.over == r.over) & (mb.inning == r.inning)).sum()),
            bat_team=r.bat_team, bowl_team=r.bowl_team, side=r.rev_side if sc["kind"] == "review" else "bat",
            by=r.rev_by if sc["kind"] == "review" else r.bat_team, batter=r.rev_batter if sc["kind"] == "review" else r.player_out,
            bowler=r.bowler, umpire=r.rev_umpire if sc["kind"] == "review" else None,
            runs=int(r.runs_before), wkts=int(r.wkts_before), legal=int(r.legal_before), target=int(r.target) if r.inning == 2 else None,
            env=float(r.env), k=int(r.k), limit=int(r.limit), G=float(r.G), L=float(r.L), p_star=float(r.p_star),
            p_hat=float(r.p_hat) if sc["kind"] == "review" else None,
            outcome=("umpires_call" if r.uc else ("upheld" if r.upheld == 1 else "struck_down")) if sc["kind"] == "review" else "not_reviewed",
            winner=m.winner, first_team=first_team,
            worm=[round(float(x), 4) for x in wp_first], worm_inning=mb.inning.tolist(),
            worm_over=[round(o + (i + 1) / 6, 3) for o, i in zip(mb.over, mb.groupby(["inning", "over"]).cumcount())],
            worm_index=int(np.where(mb.seq.to_numpy() == sc["seq"])[0][0]))
    lbw_examples = lbw_with.sort_values("G", ascending=False).head(25)[
        ["comp", "season", "date", "bat_team", "bowl_team", "player_out", "bowler", "inning", "over", "runs_before",
         "wkts_before", "target", "k", "G", "L", "p_star"]].fillna(0).round(4).to_dict("records")
    unrev["examples"] = lbw_examples

    # ---- exports
    cols = ["match_id", "comp", "season", "date", "event", "inning", "over", "bat_team", "bowl_team", "rev_by", "rev_side",
            "rev_batter", "rev_batter_pos", "bowler", "rev_umpire", "upheld", "uc", "clean_fail", "wicket_kind", "legal_before",
            "runs_before", "wkts_before", "target", "env", "k", "limit", "wp_bat_before", "G", "L", "L_upper", "p_star", "p_hat",
            "ev", "realized", "decided", "balls_after", "runs_after", "w_notout"]
    ex = rev[cols].copy()
    ex["target"] = ex.target.fillna(0).astype(int)
    ex["rev_batter_pos"] = ex.rev_batter_pos.fillna(0).astype(int)
    for c in ("G", "L", "L_upper", "p_star", "p_hat", "ev", "realized", "wp_bat_before", "env"):
        ex[c] = ex[c].round(4)
    os.makedirs(WEB, exist_ok=True)
    ex.to_csv(os.path.join(PROC, "reviews_scored.csv"), index=False)
    dump(dict(columns=list(ex.columns), rows=ex.values.tolist()), "reviews.json", separators=(",", ":"))
    summary = dict(
        n_reviews=int(len(rev)), n_matches=int(rev.match_id.nunique()), comps=sorted(rev.comp.unique().tolist()),
        seasons=[int(rev.season.min()), int(rev.season.max())], upheld=float(rev.upheld.mean()), uc_share=float(rev.uc.mean()),
        uc_given_fail=s_uc, limits={f"{c} {s}": int(v) for (c, s), v in limits.items()},
        recorded_comp_seasons=[f"{c} {s}" for c, s in recorded],
        option_value={f"{r}|{i}|{k}": v for (r, i, k), v in V.items()},
        base_rates=dict(side=rate_table(["rev_side"]), side_phase=rate_table(["rev_side", "phase"]),
                        side_pos=rate_table(["rev_side", "pos_bucket"]), side_last=rate_table(["rev_side", "last_review"]),
                        comp=rate_table(["comp_group"]), season=rate_table(["season"])),
        price_test=price, review_model=review_eval, coefficients=coefs, unreviewed_lbw=unrev,
        teams=sorted(teams, key=lambda t: -t["net_wp"]), threshold_map=tmap,
        neg_ev_share=float((rev.ev < 0).mean()), mean_p_star=float(rev.p_star.mean()),
        median_G=float(rev.G.median()), median_L=float(rev.L.median()),
        option_value_upper={f"{r}|{i}|{k}": v for (r, i, k), v in V_up.items()},
        decided_reviews=int(rev.decided.sum()),
        sensitivity={name: dict(share_p_star_below_10=float((pst < 0.10).mean()), median_p_star=float(np.median(pst)))
                     for name, pst in [("base", live.p_star.to_numpy()),
                                       ("upper_option_value", break_even(live.G, live.L_upper, live.rev_side.map(s_uc))),
                                       ("option_value_x3", break_even(live.G, 3 * live.L, live.rev_side.map(s_uc)))]},
        phase_table=[dict(phase=ph, n=int(len(g)), p_star_median=float(g.p_star.median()), G_median=float(g.G.median()),
                          L_median=float(g.L.median()), upheld=float(g.upheld.mean()), ci=wilson(g.upheld.sum(), len(g)))
                     for ph, g in live.groupby("phase")],
    )
    dump(scen, "scenarios.json", separators=(",", ":"))
    dump(summary, "drs_summary.json", indent=1)
    print("reviews", len(rev), "upheld", round(rev.upheld.mean(), 3), "limits", dict(limits))
    print("median G", rev.G.median(), "median L", rev.L.median(), "mean p*", rev.p_star.mean(), "neg EV share", (rev.ev < 0).mean())
    for p in price:
        if p["side"] == "all":
            print("price", p["lo"], p["hi"], p["n"], round(p["success"], 3))
    for c in coefs:
        print(f"{c['term']:>14} OR={c['odds_ratio']:.2f} [{np.exp(c['lo']):.2f},{np.exp(c['hi']):.2f}] p={c['p']:.3g}")


if __name__ == "__main__":
    main()
