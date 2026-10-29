"""Ball-by-ball T20 win-probability model with chronological validation.

Model: one gradient-boosted classifier per innings with monotonic constraints
(more runs / fewer wickets lost never lowers the batting side's win probability), on
*par-relative* features: runs are expressed against the competition's recent scoring
environment, so the model transfers to higher-scoring eras (e.g. IPL's Impact Player era)
that trees cannot extrapolate to from absolute run totals.
Baselines: constant base rate, a logistic regression, and the same GBM on absolute features.
Train: matches before 2024-01-01. Test: 2024-01-01 onwards (untouched until final report).
"""
import json
import os
import pickle

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(ROOT, "data", "processed")
MODELS = os.path.join(ROOT, "models")
WEB = os.path.join(ROOT, "web", "data")
SPLIT = "2024-01-01"
ENV_DEFAULT = 160.0
ABS_FEATURES = {1: ["balls_used", "wkts", "runs", "env"], 2: ["balls_rem", "wkts", "need", "env"]}
ABS_MONO = {1: [-1, -1, 1, -1], 2: [1, -1, -1, 0]}
REL_MONO = {1: [0, -1, 1], 2: [0, -1, -1, -1]}


def rel_X(inn, a, wkts, r, env):
    """Par-relative features. inn 1: a=legal balls bowled, r=runs; inn 2: a=balls remaining, r=runs needed."""
    a, wkts, r, env = (np.asarray(x, float) for x in (a, wkts, r, env))
    par = env * a / 120  # inn 1: par score so far; inn 2: par runs in the balls left
    if inn == 1:
        return np.c_[a, wkts, r - par]
    return np.c_[a, wkts, r - par, np.minimum(r / np.maximum(par, 1e-9), 5)]


def rel_frame(d, inn):
    return rel_X(inn, d.balls_used if inn == 1 else d.balls_rem, d.wkts, d.runs if inn == 1 else d.need, d.env)


def add_env(matches):
    """Scoring environment: mean first-innings total of the previous 60 completed full-length
    matches in the same competition (strictly earlier matches only - no leakage)."""
    m = matches.sort_values(["date", "match_id"]).copy()
    ok = (~m.reduced) & (m.result != "no result") & m.first_innings_total.notna()
    s = m.first_innings_total.where(ok)
    m["env"] = s.groupby(m.comp).transform(lambda x: x.shift(1).rolling(60, min_periods=10).mean())
    m["env"] = m["env"].fillna(ENV_DEFAULT)
    return m


def state_frame(balls, matches):
    b = balls.merge(matches[["match_id", "date", "season", "comp", "winner", "result", "reduced", "env"]], on="match_id")
    b["balls_used"] = b.legal_before
    b["balls_rem"] = 120 - b.legal_before
    b["wkts"] = b.wkts_before
    b["runs"] = b.runs_before
    b["need"] = b.target - b.runs_before
    b["y"] = (b.bat_team == b.winner).astype(int)
    return b


def make_model(mono):
    return HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.1, max_leaf_nodes=31, min_samples_leaf=500,
        l2_regularization=1.0, monotonic_cst=mono, early_stopping=False, random_state=0)


def lr_features(d, inn):
    if inn == 1:
        return np.c_[d.runs, d.balls_used, d.wkts, d.runs / np.maximum(d.balls_used, 1) * 6, d.env]
    return np.c_[d.need, d.balls_rem, d.wkts, np.minimum(d.need / d.balls_rem * 6, 36), d.env]


def make_lr():
    return make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))


def metrics(y, p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    ll = -(y * np.log(p) + (1 - y) * np.log(1 - p))
    bins = np.minimum((p * 10).astype(int), 9)
    ece = sum(abs(p[bins == k].mean() - y[bins == k].mean()) * (bins == k).mean() for k in range(10) if (bins == k).any())
    return dict(log_loss=float(ll.mean()), brier=float(((p - y) ** 2).mean()), ece=float(ece), n=int(len(y)))


def calibration(y, p, k=10):
    bins = np.minimum((p * k).astype(int), k - 1)
    return [dict(pred=float(p[bins == i].mean()), obs=float(y[bins == i].mean()), n=int((bins == i).sum()))
            for i in range(k) if (bins == i).sum() > 0]


def cluster_bootstrap_diff(match_ids, loss_a, loss_b, reps=500, seed=0):
    """95% CI of mean(loss_a - loss_b), resampling whole matches (balls within a match are dependent)."""
    df = pd.DataFrame(dict(m=match_ids, d=loss_a - loss_b))
    g = df.groupby("m").d.agg(["sum", "count"])
    s, c = g["sum"].to_numpy(), g["count"].to_numpy()
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(s), size=(reps, len(s)))
    est = s[idx].sum(1) / c[idx].sum(1)
    return float((s.sum() / c.sum())), [float(np.percentile(est, 2.5)), float(np.percentile(est, 97.5))]


def logloss_vec(y, p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


class WinProb:
    """Win probability of the side batting in `inn`, handling terminal states exactly."""

    def __init__(self, m1, m2):
        self.m = {1: m1, 2: m2}

    def chase(self, balls_rem, wkts, need, env):
        balls_rem, wkts, need, env = (np.asarray(a, float) for a in (balls_rem, wkts, need, env))
        out = np.full(balls_rem.shape, np.nan)
        won = need <= 0
        tie = (need == 1) & ((balls_rem <= 0) | (wkts >= 10))
        lost = ~won & ~tie & ((balls_rem <= 0) | (wkts >= 10))
        out[won], out[tie], out[lost] = 1.0, 0.5, 0.0
        live = np.isnan(out)
        if live.any():
            out[live] = self.m[2].predict_proba(rel_X(2, balls_rem[live], wkts[live], need[live], env[live]))[:, 1]
        return out

    def first(self, balls_used, wkts, runs, env):
        balls_used, wkts, runs, env = (np.asarray(a, float) for a in (balls_used, wkts, runs, env))
        out = np.full(balls_used.shape, np.nan)
        done = (balls_used >= 120) | (wkts >= 10)
        if done.any():  # innings over: batting-first side wins unless the chase succeeds
            out[done] = 1 - self.chase(np.full(done.sum(), 120.0), np.zeros(done.sum()), runs[done] + 1, env[done])
        live = ~done
        if live.any():
            out[live] = self.m[1].predict_proba(rel_X(1, balls_used[live], wkts[live], runs[live], env[live]))[:, 1]
        return out

    def batting(self, inn, balls_used, wkts, runs, target, env):
        """WP for the batting side of innings `inn` (vectorised; inn may be an array)."""
        inn = np.asarray(inn)
        balls_used, wkts, runs, env = (np.asarray(a, float) for a in (balls_used, wkts, runs, env))
        target = np.asarray(target, float)
        out = np.empty(inn.shape)
        a = inn == 1
        if a.any():
            out[a] = self.first(balls_used[a], wkts[a], runs[a], env[a])
        if (~a).any():
            out[~a] = self.chase(120 - balls_used[~a], wkts[~a], target[~a] - runs[~a], env[~a])
        return out


def load_wp():
    with open(os.path.join(MODELS, "wp.pkl"), "rb") as f:
        m = pickle.load(f)
    return WinProb(m[1], m[2])


ENV_GRID = [140, 155, 170, 185, 200]


def export_grid(wp):
    """WP lookup tables for the browser, at over boundaries; values are round(WP*200) bytes."""
    import base64
    runs = np.arange(0, 251)
    need = np.arange(1, 251)
    t1, t2 = [], []
    for env in ENV_GRID:
        for o in range(20):
            for w in range(10):
                t1.append(np.round(wp.first(np.full(251, o * 6.0), np.full(251, w), runs, np.full(251, env)) * 200))
                t2.append(np.round(wp.chase(np.full(250, 120.0 - o * 6), np.full(250, w), need, np.full(250, env)) * 200))
    enc = lambda t: base64.b64encode(np.concatenate(t).astype(np.uint8).tobytes()).decode()
    return dict(env=ENV_GRID, overs=20, wkts=10, inn1=dict(runs_max=250, data=enc(t1)),
                inn2=dict(need_max=250, data=enc(t2)), scale=200,
                note="inn1 index: ((env*20+over)*10+wkts)*251+runs; inn2: ((env*20+over)*10+wkts)*250+(need-1); over = overs completed")


def main():
    os.makedirs(MODELS, exist_ok=True)
    os.makedirs(WEB, exist_ok=True)
    matches = add_env(pd.read_pickle(os.path.join(PROC, "matches.pkl")))
    matches.to_pickle(os.path.join(PROC, "matches_env.pkl"))
    b = state_frame(pd.read_pickle(os.path.join(PROC, "balls.pkl")), matches)
    usable = (~b.reduced) & b.winner.notna() & (b.result.isna())
    b = b[usable & ((b.inning == 1) | b.target.notna())]
    report = dict(split=SPLIT, innings={})
    for inn in (1, 2):
        d = b[b.inning == inn]
        tr, te = d[d.date < SPLIT], d[d.date >= SPLIT]
        y, yt = tr.y.to_numpy(), te.y.to_numpy()
        gb = make_model(REL_MONO[inn]).fit(rel_frame(tr, inn), y)
        ab = make_model(ABS_MONO[inn]).fit(tr[ABS_FEATURES[inn]].to_numpy(float), y)
        lr = make_lr().fit(lr_features(tr, inn), y)
        p_gb, p_lr = gb.predict_proba(rel_frame(te, inn))[:, 1], lr.predict_proba(lr_features(te, inn))[:, 1]
        p_ab, p_c = ab.predict_proba(te[ABS_FEATURES[inn]].to_numpy(float))[:, 1], np.full(len(yt), y.mean())
        mid = te.match_id.to_numpy()
        diff_lr = cluster_bootstrap_diff(mid, logloss_vec(yt, p_gb), logloss_vec(yt, p_lr))
        diff_ab = cluster_bootstrap_diff(mid, logloss_vec(yt, p_gb), logloss_vec(yt, p_ab))
        ipl = (te.comp == "IPL").to_numpy()
        phase = pd.cut(te.balls_used if inn == 1 else 120 - te.balls_rem, [-1, 35, 89, 120], labels=["powerplay", "middle", "death"])
        by_phase = {str(k): dict(gbm=metrics(yt[phase == k], p_gb[phase == k]), lr=metrics(yt[phase == k], p_lr[phase == k]))
                    for k in phase.cat.categories}
        report["innings"][inn] = dict(
            train_rows=int(len(tr)), test_rows=int(len(te)),
            train_matches=int(tr.match_id.nunique()), test_matches=int(te.match_id.nunique()),
            env_train_range=[float(tr.env.min()), float(tr.env.max())],
            env_test_ipl_range=[float(te.env[ipl].min()), float(te.env[ipl].max())],
            constant=metrics(yt, p_c), logistic=metrics(yt, p_lr), gbm=metrics(yt, p_gb), gbm_absolute=metrics(yt, p_ab),
            ipl_only=dict(logistic=metrics(yt[ipl], p_lr[ipl]), gbm=metrics(yt[ipl], p_gb[ipl]), gbm_absolute=metrics(yt[ipl], p_ab[ipl])),
            logloss_diff_gbm_minus_lr=dict(est=diff_lr[0], ci95=diff_lr[1]),
            logloss_diff_gbm_minus_absolute=dict(est=diff_ab[0], ci95=diff_ab[1]),
            by_phase=by_phase, calibration_gbm=calibration(yt, p_gb), calibration_lr=calibration(yt, p_lr))
        print(inn, {k: round(report["innings"][inn][k]["log_loss"], 4) for k in ("constant", "logistic", "gbm", "gbm_absolute")})
        print("  gbm-lr", diff_lr, " gbm-absolute", diff_ab)
    # Final models refit on all data for downstream use and the app.
    final = {}
    for inn in (1, 2):
        d = b[b.inning == inn]
        final[inn] = make_model(REL_MONO[inn]).fit(rel_frame(d, inn), d.y.to_numpy())
    wp = WinProb(final[1], final[2])
    with open(os.path.join(MODELS, "wp.pkl"), "wb") as f:
        pickle.dump(final, f)
    with open(os.path.join(WEB, "wp_grid.json"), "w") as f:
        json.dump(export_grid(wp), f)
    with open(os.path.join(WEB, "wp_validation.json"), "w") as f:
        json.dump(report, f, indent=1)


if __name__ == "__main__":
    main()
