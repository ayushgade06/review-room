# Review Room: the economics of DRS in T20 cricket

**How sure does a captain need to be before reviewing?** Review Room prices both sides of every DRS decision. One side is the win-probability swing of the wicket in question. The other is the option value of the review you might lose. Together they give the **break-even confidence** a captain needs before reviewing.

Built for **AQX Sports Analytics Data Bowl 4.0**, using 5,132 real reviews from 11 men's T20 competitions (Cricsheet ball-by-ball data, 2017–2026).

- **Live app:** _(link added once deployed)_
- **Code:** this repository
- **Docs:** [Methodology](docs/METHODOLOGY.md) · [Research & idea selection](docs/RESEARCH.md) · [Data sources & licences](docs/DATA_SOURCES.md) · [Demo script](docs/DEMO_SCRIPT.md) · [Submission text](docs/SUBMISSION.md)


## What we found

All numbers are model estimates from the committed data. "Points" are percentage points of win probability.

| | |
|---|---|
| Median win-probability swing of a reviewed wicket | **5.5 pts** |
| Median option value lost on a failed review | **0.08 pts** |
| Median break-even confidence (live decisions) | **1.3%** |
| Live review decisions where break-even was below 10% | **95.6%** (81% even if option value is tripled) |
| Reviews overturned | **26.6%** (batting side 34%, fielding side 22%) |
| Odds of an overturn on a side's last review | **1.38×** higher (95% CI 1.17–1.61): teams are pickier when the review is scarce |
| LBWs walked off with a review still in hand | **463**, at a median break-even of 1.9% |

**What this means in practice.** In T20, a review is cheap and a wicket is expensive. Unless a player is nearly certain the umpire is right, the review should be used. The exceptions are early in an innings, or when the wicket barely matters, and the app shows exactly where those are.

## Who it is for and how it changes a decision

- **Captains and coaches.** Set a team review rule, such as "review unless 95% sure it's out". Use the price map to see when the rule should be stricter: early overs, lopsided games, the last review.
- **Analysts.** The team audit shows each side's net win probability gained from DRS. Each review can be replayed in the Review Room.
- **Broadcasters.** Get an instant "should they review?" number.

## Using the app

1. **Review Room.** Choose one of seven rule-selected case files, browse all 5,132 reviews, or build your own situation. You see:
   - the match state and its ball-by-ball win-probability curve, with the swing at stake;
   - G, L and the umpire's-call share;
   - the break-even confidence.

   Drag the confidence slider to see the expected value of reviewing, then reveal what actually happened.
2. **Price map.** Break-even confidence across every over and game state, by innings, reviewing side and reviews left.
3. **Captains.** Overturn rates vs break-even by phase, the last-review effect, and the unreviewed LBWs.
4. **Team audit.** Net value of each team's reviews, overturn rate with 95% intervals, and the rate expected given its review mix.
5. **Evidence.** Win-probability calibration on 2024–26 holdout matches, baselines, the review-outcome model (including a negative result), odds ratios, and the sensitivity analysis.

## Run it locally

The app is static: HTML, CSS and vanilla JS, with no build step and no runtime APIs. The model runs in the browser from precomputed lookup tables.

```bash
cd web
python -m http.server 8000
# open http://localhost:8000
```

## Reproduce the analysis

Requires Python 3.12 and, for the JS tests, Node 20+.

```bash
pip install -r requirements.txt
python pipeline/parse.py     # Cricsheet zips -> ball-level tables
python pipeline/wp.py        # win-probability models + validation + browser grid
python pipeline/drs.py       # review economics, tests, app data  (whole pipeline ~10 min on a laptop)
python -m pytest -q tests/   # 7 tests: parsing, review accounting, break-even, leakage
node --test tests/           # 4 tests: browser engine reproduces the Python numbers
```

The exact Cricsheet snapshot used (29 Oct 2026) is committed in `data/raw/`, so a clean rebuild regenerates every file in `web/data/`.

## How it works (short version)

- **Win probability.** Gradient-boosted trees with monotonic constraints, one model per innings, on *par-relative* features: runs measured against the competition's recent scoring environment.
  - Trained on matches before 2024; tested on 2,813 matches from 2024–26.
  - Beats logistic regression in both innings (Δ log loss −0.010 and −0.011, with match-bootstrap 95% CIs excluding 0).
  - An absolute-runs version failed on IPL 2024–26 because that scoring era lies outside the training data. Fixing that failure is documented in the methodology.
- **Reviews remaining.** Reconstructed from the order of reviews in each innings. Umpire's call keeps the review. Allowances are inferred from the data and match the IPL's 2022 change from one to two unsuccessful reviews per innings.
- **Option value.** The mean future win probability gained from overturns by teams still holding k reviews at that point of the innings, isotonic-smoothed.
- **Decision rule.** Review if p > p\* = (1 − u)L / (G + (1 − u)L).

Full details, error analysis and limitations: [docs/METHODOLOGY.md](docs/METHODOLOGY.md).

## Limitations

- We never see appeals that weren't reviewed, and there is no ball-tracking data.
- The captain's belief is supplied by the user, not predicted. Our test shows match context can't predict review outcomes beyond the reviewing side.
- Option values reflect current reviewing behaviour.
- Win probability is state-based, not player-specific.
- Nothing here is a causal claim.

## Repository layout

```
pipeline/   parse.py (Cricsheet -> tables), wp.py (win probability), drs.py (review economics)
web/        index.html, styles.css, app.js (UI + SVG charts), engine.js (pure decision engine), data/ (generated)
tests/      test_pipeline.py (pytest), engine.test.mjs (node --test)
data/raw/   Cricsheet zips (ODC-By 1.0)
docs/       RESEARCH, METHODOLOGY, DATA_SOURCES, DEMO_SCRIPT, SUBMISSION
```

## Licence and attribution

- **Code:** MIT ([LICENSE](LICENSE)).
- **Data:** contains information from [Cricsheet](https://cricsheet.org/), made available under the [ODC Attribution License 1.0](https://opendatacommons.org/licenses/by/1-0/) ([LICENSE-DATA.md](LICENSE-DATA.md)).
- Not affiliated with or endorsed by Cricsheet, the ICC or any league.
- No third-party code was copied. The charts are hand-written SVG. Fonts come from Google Fonts under the OFL.
