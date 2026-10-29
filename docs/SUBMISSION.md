# Devpost submission text

**Project title:** Review Room: the economics of DRS in T20 cricket

**Tagline (≤ 200 chars):** How sure does a captain need to be before reviewing? A win-probability model prices 5,132 real DRS reviews and gives the break-even confidence for any T20 situation.

**Links**
- Public GitHub repository: https://github.com/ayushgade06/review-room
- Working prototype: https://ayushgade06.github.io/review-room/ (static site; it also runs locally with `python -m http.server` inside `web/`).

---

## Inspiration

Every DRS review is a bet made in about 15 seconds. You risk a review to win back a wicket. Commentators judge reviews by their outcome, and players are taught not to "waste" them. But nobody puts a price on either side of the bet. We wanted to answer one practical question for captains: **how confident do you need to be that the umpire is wrong before reviewing?**

## What it does

Review Room prices every review with two numbers:
- **G**, the win-probability swing of the wicket in question;
- **L**, the option value of the review you would lose if it failed.

Umpire's call keeps the review, so a failed review only costs L when it fails outright. The decision rule is: **review if your confidence exceeds p\* = (1 − u)L / (G + (1 − u)L)**, where u is the share of failed reviews that end as umpire's call.

**Features**
- **Review Room.** Seven rule-selected case files, a searchable table of all 5,132 reviews, and a situation builder. For each one you see:
  - the match's ball-by-ball win-probability curve, with the swing at stake;
  - G, L and the break-even confidence;
  - a confidence slider showing the expected value of reviewing;
  - a reveal of what actually happened.
- **Price map.** Break-even confidence for every over and game state, by innings, reviewing side and reviews left.
- **Do captains respond to the price?** Overturn rates with 95% intervals vs break-even, by phase; the last-review effect; and 463 LBWs walked off with a review still in hand.
- **Team audit.** Net win probability each team has gained from its own reviews.
- **Evidence.** Holdout calibration, baselines, odds ratios and sensitivity analysis.

## Key findings

All numbers are from the app, on Cricsheet men's T20 data, 2017–2026.

- **A review is cheap; a wicket is expensive.** The median reviewed wicket swings **5.5 points** of win probability. The median failed review costs **0.08 points** of option value.
- **The bar is low.** The median break-even confidence is **1.3%**. In **95.6%** of live review decisions it was below 10%. That holds at 81% even if option value is tripled.
- **Teams partly respond to the price.** They are pickier with their last review: odds of an overturn are **1.38×** higher (95% CI 1.17–1.61). They also get more speculative late in the innings: overturn rate falls from 32% in the powerplay to 22% at the death. But overturn rates beat break-even by more than ten times in every phase, so there is room to review more.
- **Batters leave value on the table.** **463** LBW dismissals went unreviewed while the side still had a review, at a median break-even of 1.9%.
- **An honest negative result.** Match context cannot predict which reviews succeed beyond which side is reviewing (Δ log loss −0.0001, 95% CI −0.005 to +0.006, on 2025–26 reviews). The captain's own read is what matters, so the tool asks for it instead of pretending to predict it.

## Actionable impact

- **Team rule of thumb.** "Unless you're nearly certain it's out, review." The price map shows when to be stricter: early overs, lopsided matches, the last review in a first innings.
- **Coaching.** Show players their own review history against break-even, rather than judging reviews by outcome.
- **Broadcast.** An instant, explainable "should they review?" number for any delivery.

## How we built it

1. **Data.** We parsed 11 Cricsheet archives (8,897 matches, 2.04M deliveries) into ball-level states, including Cricsheet's `review` records.
2. **Win-probability model.** Monotonic gradient-boosted trees, one per innings, on *par-relative* features: runs measured against the competition's recent scoring environment, using only earlier matches.
   - Trained on games before 2024 and tested on 2,813 matches from 2024–26.
   - It beats logistic regression in both innings (Δ log loss −0.010 [−0.013, −0.007] and −0.011 [−0.016, −0.007], match-cluster bootstrap) and is well calibrated.
3. **Reviews remaining.** Reconstructed from the order of reviews. Allowances are inferred from the data, and the inference matches the IPL's 2022 change from one to two unsuccessful reviews per innings.
4. **Option value.** Estimated empirically: the future win probability gained from overturns by teams still holding k reviews, with isotonic smoothing.
5. **Review-outcome model.** A logistic regression with match-clustered standard errors, used for the behavioural tests.
6. **App.** A static web app (vanilla JS, hand-built SVG charts). The model runs in the browser from exported lookup tables, and 11 automated tests check the pipeline logic and that the browser engine reproduces the Python numbers.

## Challenges

- **Distribution shift.** Our first boosted model lost to logistic regression in the chase, by +0.11 log loss on IPL. The IPL's 2024–26 scoring environment (first-innings averages of 183–201) lies largely beyond anything in training, and trees cannot extrapolate. Re-expressing runs relative to par fixed it, and the fix is documented with before-and-after numbers.
- **Missing state.** Cricsheet doesn't record reviews remaining, so we reconstructed them and validated the reconstruction against the published rule changes.
- **Selection.** Appeals that weren't reviewed are invisible. We say so, and we frame the unreviewed-LBW figures as scenarios, not estimates.

## Limitations

- No ball-tracking data.
- The captain's belief is supplied by the user.
- Option values reflect current reviewing behaviour.
- Win probability is state-based, not player-specific.
- These are associations, not causal effects.

## Built with

Python · pandas · scikit-learn · statsmodels · vanilla JavaScript · SVG · Cricsheet (ODC-By 1.0)

_Contains information from Cricsheet, made available under the ODC Attribution License 1.0._
