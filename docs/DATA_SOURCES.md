# Data sources, licences and attribution

## Bundled data

| Path | Source | Licence | Notes |
|---|---|---|---|
| `data/raw/*_json.zip` (11 files, ~34 MB) | [Cricsheet](https://cricsheet.org/downloads/), downloaded 29 Oct 2026 | [ODC Attribution License 1.0](https://opendatacommons.org/licenses/by/1-0/) | Unmodified archives. Each zip contains Cricsheet's own `README.txt` and `LICENSE.txt`; keep them when redistributing. |
| `web/data/*.json` | Derived by `pipeline/` from the Cricsheet archives | ODC-By 1.0 (derived database); attribution below | Model outputs, review records and lookup tables. No other data source is mixed in. |

**Required attribution.** This is shown in the app footer and README:

> Contains information from Cricsheet which is made available under the ODC Attribution License.

Cricsheet's licensing page: https://cricsheet.org/licensing/. The licence permits commercial and non-commercial use, adaptation and redistribution, provided the notice is kept. Cricsheet withholds matches involving Afghanistan men's teams and the Afghanistan Premier League. Those matches are therefore absent here too.

### The archives

| File | Competition | Men's matches parsed |
|---|---|---|
| `ipl_json.zip` | Indian Premier League | 1,243 |
| `t20s_male_json.zip` | Men's T20 internationals | 3,635 |
| `ntb_json.zip` | T20 Blast | 1,570 |
| `bbl_json.zip` | Big Bash League | 662 |
| `bpl_json.zip` | Bangladesh Premier League | 469 |
| `cpl_json.zip` | Caribbean Premier League | 445 |
| `psl_json.zip` | Pakistan Super League | 357 |
| `lpl_json.zip` | Lanka Premier League | 143 |
| `ilt_json.zip` | ILT20 | 134 |
| `sat_json.zip` | SA20 | 130 |
| `mlc_json.zip` | Major League Cricket | 109 |

All counts are after the parser's filters: male, T20/IT20, 20 overs scheduled.

**Cricsheet updates these archives continuously.** We commit the exact snapshot so that every number in the app can be reproduced. To refresh, download new zips from https://cricsheet.org/downloads/ into `data/raw/` and rerun the pipeline. Expect small changes in the results.

### Fields used

From `info`: dates, teams, overs, outcome (winner / result / method), event, venue, toss.

From each delivery:
- batter, non-striker, bowler
- runs (total)
- extras (wides and no-balls, to decide whether a ball counts)
- wickets (kind, player_out)
- `review`: by, umpire, batter, decision, umpires_call

From innings: target, super_over.

**What the data does not contain:**
- ball-tracking or line and length;
- appeals that were *not* reviewed;
- the number of reviews remaining, which we reconstruct;
- whether a review was for LBW or caught when it was overturned in the batter's favour.

## Not bundled, not used

These were evaluated during research (see `docs/RESEARCH.md` §7) and rejected for licence, availability or fit:
- StatsBomb Open Data: its user agreement forbids redistribution.
- FastF1 / OpenF1 / Jolpica: F1 copyright and non-commercial terms.
- Sackmann tennis data: CC BY-NC-SA, and the main repositories are offline.
- nba_api and Statcast: restrictive terms of use.

No API is called at runtime. The app makes no network requests apart from loading Google Fonts.

## Third-party code and assets

- **Python dependencies** (`requirements.txt`): numpy, pandas, scikit-learn, scipy, statsmodels (BSD-3-Clause), and pytest (MIT).
- **Web front end:** no JavaScript libraries. Every chart is hand-written SVG in `web/app.js`.
- **Fonts:** Big Shoulders Display, Instrument Sans and JetBrains Mono, loaded from Google Fonts under the SIL Open Font License. Without them the page falls back to system fonts.
- **Colour palette:** the categorical and sequential colours follow a validated colour-vision-deficiency-safe reference palette (blue/orange pair; one-hue blue ramp).
- **No code was copied** from the repositories reviewed during research. chaseline was read as a design reference for win-probability validation only.

## Rules references

- IPL introduced DRS in 2018, with one unsuccessful review per team per innings ([Sportskeeda](https://www.sportskeeda.com/cricket/ipl-2018-drs-introduced-first-time)).
- IPL 2022 increased this to two per innings ([CricTracker](https://www.crictracker.com/ipl-2022-two-drs-reviews-per-innings-bcci-makes-major-changes-to-playing-conditions/)).
- Under ICC playing conditions, a review that ends in umpire's call is retained ([overview](https://en.wikipedia.org/wiki/Decision_Review_System)).

The pipeline does not hard-code these rules. It infers each competition-season's allowance from the review sequences (see METHODOLOGY), and the IPL inferences match the published rules exactly.
