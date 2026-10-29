# Methodology

## 1. Research question and decision

**Question.** How confident must a T20 captain be that an on-field decision is wrong before reviewing it? And do observed review decisions reflect that price?

**The decision.** At the moment of a review, the reviewing side compares:
- **G**: the win-probability swing of the wicket in question. If the review is upheld, the batting side keeps a wicket (batting review) or the fielding side gains one (fielding review). G is the same quantity in both cases: WP(batting side, no wicket) − WP(batting side, wicket), at the post-delivery state.
- **L**: the option value lost if the review fails outright. A failed review uses up one of the side's *unsuccessful* reviews for the innings, so L = V(k) − V(k−1), where V(k) is the value of holding k reviews.
- **u**: the probability that a failed review ends as **umpire's call**. Under ICC/IPL playing conditions the review is then retained, so it costs nothing.

With belief **p** that the on-field call is wrong, the expected change in win probability from reviewing is

  EV(p) = p·G − (1 − p)·(1 − u)·L,

so the **break-even confidence** is

  **p\* = (1 − u)L / (G + (1 − u)L)**.

Review if p > p\*. When G < 0.2 win-% points the match is effectively decided and p\* is reported as undefined ("low stakes"). There are 440 such reviews, and they are excluded from the behavioural tests.

- **Unit of analysis:** one player review in a full-length (20-over), completed men's T20 match.
- **Sample:** 5,132 reviews from 2,283 matches in 11 competitions, 2017–2026.

## 2. Data pipeline

`pipeline/parse.py` reads the 11 Cricsheet zips directly (no extraction) and keeps male, T20/IT20, 20-over matches. That gives 8,897 matches and 2,043,716 deliveries. It records the state **before** each delivery:
- legal balls bowled (wides and no-balls excluded);
- runs;
- wickets lost ("retired hurt" and "retired not out" are not wickets);
- the target in innings 2;
- the batting order, by first appearance, as batter or non-striker;
- the review fields.

The **reviewing side** is batting if `review.by` equals the batting team, and fielding otherwise.

**Consistency checks on the data:**
- Every failed batting-side review carries a recorded wicket, and every upheld batting-side review carries none. The same holds in reverse for fielding-side reviews, with 8 exceptions out of 3,296, where a second dismissal (e.g. a run-out) happened on the same ball.
- Our 26.6% overturn rate matches Shivakumar (2018), who reports about 26% of challenged calls reversed.

**Excluded:**
- No-results and DLS/reduced-overs matches: their targets aren't comparable.
- Ties: dropped from WP training only.
- Super overs.
- One "technical failure" review.

## 3. Win-probability model (`pipeline/wp.py`)

**Target:** whether the batting side of the current innings wins the match. There is one model per innings.

**Scoring environment.** `env` is the mean first-innings total of the previous 60 completed full-length matches in the same competition. It uses strictly earlier matches only (`shift(1)`), so there is no leakage. The unit test `test_env_uses_only_earlier_matches` checks this.

**Features, all par-relative.** Par is env × balls/120.
- **Innings 1:** balls bowled; wickets lost; runs minus par so far.
- **Innings 2:** balls left; wickets lost; runs needed minus par for the balls left; and the ratio of runs needed to par (capped at 5).

**Model.** scikit-learn `HistGradientBoostingClassifier` with 300 iterations, learning rate 0.1, 31 leaves, at least 500 samples per leaf, L2 = 1, and no early stopping.

**Monotonic constraints.** In both innings, more wickets lost never helps the batting side. In innings 1, more runs never hurts. In innings 2, more runs needed never helps. These constraints guarantee G ≥ 0.

**Terminal states are computed exactly, not by the model:**
- target reached → 1;
- out of balls or wickets → 0;
- level at the end → 0.5;
- end of innings 1 → 1 − WP(chase from the start).

**Baselines:**
1. a constant base rate;
2. logistic regression on the state (runs, balls, wickets, run rate or required rate, env), after Asif & McHale (2016);
3. the same boosted model on *absolute* features.

**Validation.** The split is chronological: train on matches before 1 Jan 2024; test on 2024–2026 (2,813 matches, 654,453 ball states). Differences in log loss come with 95% confidence intervals from a **match-level cluster bootstrap** (500 resamples), because balls within a match are not independent.

**Test-set results** (log loss / Brier; lower is better):

| Model | Inn 1 log loss | Inn 2 log loss | Inn 1 Brier | Inn 2 Brier | IPL-only inn 2 log loss |
|---|---|---|---|---|---|
| Constant | 0.6927 | 0.6928 | 0.2498 | 0.2498 | — |
| Logistic regression | 0.6041 | 0.3721 | 0.2090 | 0.1207 | 0.3989 |
| GBM, absolute features | 0.5965 | 0.3919 | 0.2065 | 0.1279 | 0.5118 |
| **GBM, par-relative (used)** | **0.5941** | **0.3611** | **0.2050** | **0.1171** | **0.3708** |

- **Ours vs logistic:** Δ log loss −0.0100 [−0.0134, −0.0066] in innings 1 and −0.0111 [−0.0157, −0.0067] in innings 2.
- **Ours vs absolute GBM in innings 2:** −0.0309 [−0.0389, −0.0217].
- Calibration (expected calibration error, 10 bins) is in `web/data/wp_validation.json` and plotted in the app.

**Error analysis: why absolute features failed.** The absolute-feature GBM lost to logistic regression in the chase, by +0.113 log loss in IPL alone. The cause is the IPL's 2024–26 scoring environment (first-innings average 183–201), which lies largely beyond the training distribution: 99% of training states sit below about 182. Trees cannot extrapolate. They treated 200-run chases as near-impossible because they had rarely been completed before 2024. Expressing runs relative to the competition's recent par fixed this without hand-tuning, and it is the version we use.

**Deployment.** The final models are refit on all data. For the browser, the model is exported as lookup grids (`web/data/wp_grid.json`, 868 KB) with these dimensions:
- environment: 5 levels (140–200);
- overs completed: 20;
- wickets: 10;
- runs: 0–250;
- plus a ball-by-ball grid for the last 12 balls of a chase.

The values are quantised to 0.5 win-% points. `tests/engine.test.mjs` checks that the browser engine reproduces the Python G across all 5,132 reviews: median absolute error below 0.5 points, 95th percentile below 2 points, and break-even error below 2 points for non-trivial wickets.

## 4. Review allowances and reviews remaining (`pipeline/drs.py`)

Cricsheet does not record how many reviews a side has left, so we reconstruct it:
- Within each (match, innings, reviewing team), we count **outright failures** before each review. Umpire's-call failures and upheld reviews do not count.
- The **allowance** for each competition-season is inferred from the data. It is 2 if a team was seen reviewing again after an outright failure in the same innings at least twice that season; otherwise it is 1.
- The inference matches the published rules: **IPL 2018–21 → 1; IPL 2022+ → 2**, the BCCI change in 2022. T20Is (2020+), PSL, CPL, SA20, MLC, ILT20, BPL and LPL → 2.
- **Reviews remaining** = allowance − outright failures so far, floored at 1 at the moment of a review.

## 5. Option value of a held review

**Which data.** We use "DRS-recorded" competition-seasons: those where at least 60% of matches carry review records, and there are at least 10 matches. There are 51 such seasons, and T20Is are not among them because many T20Is have no DRS.

**The estimate.** For every team-innings, in each role (batting or fielding), and at each over boundary o, we record:
- k, the unsuccessful reviews still held;
- F, the win probability later gained by that team from upheld reviews in the rest of the innings (the sum of their G values).

V(role, innings, k, o) is the mean of F. Isotonic regression enforces that V falls as the innings progresses, and V(2) ≥ V(1) is enforced too. V is 0 at the end of the innings, and values between over boundaries are interpolated linearly.

**Magnitudes:**
- one review held at the start of an innings: 0.5–0.8 win-% points;
- two reviews: 0.7–1.1 points;
- by over 16: about 0.1 points.

The median L across real reviews is 0.08 points, against a median G of 5.5 points.

**u** is the umpire's-call share of failed reviews, by side: batting 25%, fielding 16%.

**Sensitivity**, as the share of live reviews with p\* < 10%:

| Option value | Share with p\* < 10% | Median p\* |
|---|---|---|
| Base | 95.6% | 1.3% |
| Upper bound (only matches that have at least one review record, which removes any bias from missing records) | 95.1% | 1.0% |
| Stress test: L × 3 | 81.1% | 3.8% |

## 6. Review-outcome model and behavioural tests

**Purpose.** This answers two questions: can match context predict an overturn, and do teams respond to the price of a review?

**Model.** Logistic regression on ex-ante features only:
- reviewing side;
- p\*, G, and whether it is the last review;
- phase (powerplay, overs 7–15, overs 16–20);
- batting position (1–3, 4–7, 8–11);
- innings;
- competition group (IPL / T20I / other);
- season (linear);
- fielding side × death overs.

Dismissal kind is deliberately excluded. Cricsheet records it only when the batter is finally out, so including it would leak the outcome.

**Prediction test.** Train on reviews before 2025 (n = 3,599) and test on 2025–26 (n = 1,533):

| Model | Log loss | Brier | AUC |
|---|---|---|---|
| Constant | 0.5666 | 0.1894 | 0.500 |
| Reviewing side only | 0.5603 | 0.1870 | 0.561 |
| Full context | 0.5602 | 0.1871 | 0.588 |

Full model minus side-only: Δ log loss −0.0001, 95% CI [−0.0053, 0.0059], from a match-cluster bootstrap. **No reliable gain.** This is an honest negative result. Without ball-tracking, the information that decides a review is the reviewer's own read of the delivery, so the app asks the user for their confidence rather than predicting it.

**Inference.** On all 5,132 reviews, with match-clustered standard errors (odds ratio, 95% CI):

| Feature | Odds ratio | 95% CI |
|---|---|---|
| Fielding side reviewing | 0.56 | 0.48–0.65 |
| Last review in hand | **1.38** | **1.17–1.61** |
| Overs 7–15 (vs powerplay) | 0.73 | 0.62–0.86 |
| Overs 16–20 (vs powerplay) | 0.68 | 0.52–0.89 |
| Other leagues (vs IPL) | 0.83 | 0.70–0.98 |
| p\* | not significant | — |

**Interpretation.** Teams are pickier with their last review and more speculative late in the innings. That is directionally consistent with responding to the price. But overturn rates (22–32% by phase) exceed the median break-even (0.2–2.4%) by more than ten times in every phase. If captains reviewed only when their belief exceeded p\*, success rates could fall a long way before reviewing stopped paying. In other words, there is room to review more.

**Unreviewed LBWs.** In DRS-recorded seasons, 463 batters were given out LBW, did not review, and their side still held a review, in a live match. The median p\* at those moments was 1.9%.

We cannot observe how many were plumb. As a scenario, if each batter's belief had been 10%, reviewing all of them would have added +2.6 expected wins in total (+1.0 at a 5% belief; about 0 at 2%). This is a bound under stated beliefs, not an estimate of missed overturns.

## 7. Team audit

Per competition and team (teams with at least 15 reviews):
- overturn rate, with a Wilson 95% interval;
- the review model's expected rate for that team's mix of reviews;
- **net value**: Σ G over upheld reviews − Σ L over outright failures, in expected wins.

This is a descriptive ledger. It mixes skill, umpiring luck and opportunity, and it is not a causal ranking.

## 8. Assumptions and limitations

1. **Selection.** We see only reviews that were made, and appeals that were not reviewed are invisible. The behavioural tests are conditional on a team having reviewed.
2. **Option value depends on current behaviour.** V is estimated from how teams review today. If every team reviewed more freely, V would change somewhat (more future overturns, so higher V). The stress test (L × 3) shows the conclusion survives large changes.
3. **No player-specific WP.** Win probability is state-based: score, balls, wickets and environment. It does not know whether the batter at the crease is a set opener or a tail-ender, beyond what wickets in hand imply. G is therefore an average wicket value for that state.
4. **The scoring environment** is a competition-level rolling mean. It ignores venue and team strength, which matters most in T20Is between unequal sides.
5. **Allowance inference** could misclassify small samples. ILT20 2026, with only 7 reviews, is inferred as 1; seasons without evidence default to 1.
6. **Reduced-overs and DLS matches are excluded**, as are female matches. Women's T20 is a natural extension.
7. **No causal claims.** WP swings are model estimates; behavioural results are associations.

## 9. Reproducibility

```bash
pip install -r requirements.txt
python pipeline/parse.py     # zips -> data/processed/*.pkl
python pipeline/wp.py        # WP models, validation, browser grid (slowest step)
python pipeline/drs.py       # reviews, option values, tests, app data
python -m pytest -q tests/   # pipeline logic
node --test tests/           # browser engine parity
```

All randomness is seeded: `random_state=0` for the boosted models, and seed 0 for the bootstraps. A clean rebuild from the committed zips (deleting `data/processed/` and `models/` first) took 10.5 minutes on our laptop. It regenerated the review, scenario, summary and grid files byte-for-byte; the validation report differed only by one field added to the code in that run.
