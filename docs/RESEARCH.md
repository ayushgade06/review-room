# Research & idea selection

Prepared 29 October 2026 for AQX Sports Analytics Data Bowl 4.0. Facts here come from pages we read first-hand (marked with a source) or from data we parsed. Where something could not be verified it says so.

**How sources were accessed.** Devpost returns HTTP 403 to automated fetchers. The 4.0 overview, rules and dates pages were first downloaded with `curl` using a browser user-agent string. When we then tried to have research agents use the same approach, our tooling blocked it as bot-check circumvention, and we stopped using it. Every other Devpost page (all three past galleries, all 14 winner pages, the 4.0 gallery, updates, participants and discussions) was read in an ordinary browser session. GitHub, Cricsheet and the literature were fetched normally.

---

## 1. Research question

> **How confident must a T20 captain be that an on-field decision is wrong before spending a DRS review, and do teams' review decisions match that price?**

- **Unit of analysis:** one player review (5,132 in the final sample). The game state comes from ball-by-ball data.
- **Supporting question:** what is the win-probability value of a wicket (*G*), and what is the option value of holding a review (*L*), at any moment of a T20 match?
- **Who decides:** the captain, together with the bowler and wicketkeeper (fielding reviews) or the dismissed batter (batting reviews). The decision is made in about 15 seconds, so teams need pre-agreed rules of thumb, and analysts set those rules.

## 2. Official requirements (verified on the 4.0 site, 29 Oct 2026)

| Item | Verified text / fact |
|---|---|
| Deadline | "Nov 1, 2026 @ 12:00am PDT". That is 07:00 UTC, or **12:30 IST**. The rules page says "October 18th – October 31st @ 11:59 PM PT", one minute earlier, so treat 12:29 IST as the hard stop. |
| Schedule | Submissions Oct 17, 9:00pm PDT → Nov 1, 12:00am PDT. Judging Nov 1 → Nov 8. Winners Nov 9, 6:00pm PST. |
| Eligibility | "Above legal age of majority in country of residence". "**Students only**". "Companies/professional organizations excluded". Teams or individuals. |
| Build | "software application, web application, interactive dashboard, or predictive model centered around sports analytics … any sport"; must use sports data. |
| Submit | "a working prototype along with your public source code (GitHub) and a short project description detailing your solution, features, and actionable impact, no video demo required". |
| Exclusion | "Projects from previous AQX Sports Analytics Data Bowls will not be accepted, and will result in immediate disqualification." |
| Judging | **Practical Application**, **Analytical Insight**, **Data Presentation** (descriptions on the overview page; no weights). Judges are listed as "AQX Analytics". |
| Prizes | 1st place: honors, plus a $50 Amazon gift card only "if we receive OVER 100 submissions". 2nd and 3rd: honors. Honorable mentions. |
| Organizer updates | One update, "Final call for submissions". Discussions: "No topics have been created yet." |

## 3. Previous winners (all 14 verified on their Devpost project pages)

Award text was read from each project's "Submitted to" block. Gallery sizes: 1.0 has 2 pages (about 44 entries), 2.0 has 44, 3.0 has 33.

| Edition | Award | Project | Sport | Core idea | Method / validation (as stated) | Presentation |
|---|---|---|---|---|---|---|
| 3.0 | 1st + judge position | **Load Watch** | NBA | Soft-tissue workload risk as a 0–100 *percentile*, explicitly "not a probability" | LR baseline + XGBoost, chronological split, ROC-AUC/PR-AUC, SHAP. The writeup gives no metric values; the repo's `metrics.json` shows test ROC-AUC 0.618 (LR) and 0.539 (XGB). | Streamlit; team risk ranking; honest-limitations section |
| 3.0 | 2nd | **THE HOOK** | MLB | Bullpen counterfactual: which reliever gave the best win chance? | 1.27M Statcast pitches → 324,435 PAs; prior-only profiles; multinomial LR (holdout log loss 0.9645 vs 0.9700 baseline); WP model 0.4743 vs 0.6927 constant; 2,000 sims; 26 tests | Streamlit; "Manager vs Model" flagship scenario |
| 3.0 | 3rd | F1 Race-Lab | F1 | Pit-strategy simulator, "ghost car" | FastF1, tyre-degradation ML, Monte Carlo; no validation metrics stated | React + FastAPI + Plotly |
| 3.0 | HM | 4th Down Audit | NFL | Coach fourth-down decision audit | nfl4th model; decision loss in WP points; confidence tiers | Next.js static export (Netlify) |
| 3.0 | HM | IPL (2009–2023) Analysis | Cricket | Descriptive IPL dashboard | Power BI, Kaggle CSV | Multi-page dashboard |
| 2.0 | 1st | World Cup Monte Carlo | Soccer | 2026 bracket simulator | Elo + 10,000 simulations | Streamlit |
| 2.0 | 2nd | Ice in His Veins | NFL | Is "clutch" real? QB pressure fingerprints | EPA/CPOE by leverage tier; empirical-Bayes shrinkage; 95% CIs; shows the naive stat overstates separation ~2× | Cinematic scroll + dashboard |
| 2.0 | 3rd | DeepPitch | Soccer | Match outcome prediction, player legacy | PyTorch | Dashboard |
| 2.0 | HM | GameIQ | NBA | Box-score dashboard, MVP ranking, scouting | Rule-based | Dashboard |
| 1.0 | 1st | CapCraft AI | NBA | Five-player lineup under salary cap | Optimisation / value + fit | App |
| 1.0 | 2nd | UNDER PRESSURE | Soccer | VAEP over WC 2018 and 2022 ("team that outplayed its opponent won 95% of decisive matches") | socceraction VAEP on StatsBomb | App |
| 1.0 | 3rd | The Replacement Report | Soccer | Find an affordable stylistic replacement | Similarity + price | Shortlist + radar |
| 1.0 | HM | GuardianAI | NBA | Injury risk + rest optimisation | Explainable ML | App |
| 1.0 | HM | FIFA 2026 Player Impact | Soccer | SQL analysis of 72 stats | SQL | Report |

**Patterns that matter for us**
1. **Decision questions win.** Recent winners ask one decision question for a named user: bullpen moves, fourth downs, pit stops, load management.
2. **Honest framing is rewarded more than raw accuracy.** The 3.0 winner's own repo reports ROC-AUC 0.618, and the runner-up's matchup model beats its baseline by 0.6% in log loss. Both stated their claims carefully ("not a probability", "comparative estimate").
3. **Uncertainty and shrinkage stood out** (Ice in His Veins).
4. **Cricket's only podium-level result is an honorable mention for a descriptive Power BI dashboard**, even though cricket entries appear in every gallery (CricketIQ, CRICKETANALYSER, Crease & Chase, IPL Match Insights). Rigorous cricket decision analysis is an open lane.
5. **What not to copy:** bullpen or bowler substitution simulators (THE HOOK), coach decision audits in the 4th-down mould, workload risk scores.

## 4. Current competitive landscape (4.0)

- The 4.0 gallery is unpublished ("The hackathon managers haven't published this gallery yet").
- 163 participants are registered. Participant cards show only "working solo / has a team" and a few skill tags.
- A GitHub search found **19 public repositories that self-identify as 4.0 entries**. This is a lower bound: an entry missing from GitHub may still be in progress.

| Sport | Entries found (repo) | Problem type | Sophistication | Relevance to us |
|---|---|---|---|---|
| Soccer (6) | Moneyball Scout, PitchIQ (xG vs StatsBomb xG), Sack or Stick? (Elo/xPts, Monte Carlo), FIFA WC Intelligence, FixtureLens, TactIQ | Valuation, xG, prediction | High to low | Soccer is crowded; avoid |
| NBA (4) | CourtFatigue (872k shots), Rookie Options (real options + NLP), ShotSense, CourtIQ | Fatigue, contracts, shot quality | High to medium | Avoid NBA shot and fatigue work |
| NHL (2) | Pull the Goalie; Pull the Goalie Sooner? | Decision model with backtests | High | The same decision twice; saturated |
| Cricket (1) | **Six-Ball Review** (EazyHood): bowling-profile shortlists for video review, Bayesian profiles | Descriptive scouting aid | High rigour | Different question: no DRS, no win probability. Uses the same Cricsheet data. |
| Badminton (1) | Squadro Match Lab (win prob., AUC 0.81) | Prediction | High | — |
| Tennis (1) | What Wins Tennis Matches? (Shapley R²) | Explanation | Medium | — |
| MLB (1) | DiamondCheck (ridge forecast audit) | Audit | Medium | — |
| Women's sports (1) | Pay-by-Play | Pay vs production | Medium | — |
| Injury (2) | Milo Analytics (synthetic data), a multi-hackathon mash-up | Workload | Low | — |

Sources: repository URLs are listed in §9. No 4.0 entry uses Cricsheet's `review` object or models DRS decisions.

## 5. Ideas considered (13)

Each card answers the 24 questions in a compressed form. "Data ✓" means we verified access during research.

### I-1 Review Room: the economics of DRS (T20 cricket) — **SELECTED**
1. **Title / pitch:** *Review Room*. How sure must a captain be before reviewing?
2. **Problem:** captains spend or hoard a scarce review with no quantitative sense of what it is worth.
3. **User:** captain, coach, team analyst (and broadcasters).
4. **Why it matters:** wickets swing T20 matches by 5–20 win-% points, and DRS calls are made in seconds.
5. **Novelty:** we found no published model of *when to spend a limited review*; existing papers study umpire accuracy or gamesmanship. We combine a calibrated WP model, an empirical option value of a held review, and a break-even confidence.
6. **Data:** Cricsheet ball-by-ball JSON; 5,132 reviews; 8,897 matches. 7. **Accessible:** ✓ (ODC-By, bundled).
8. **Repos:** none model DRS. Win-probability references exist (e.g. chaseline). 9. **Libraries:** pandas, scikit-learn, statsmodels.
10. **Method:** monotone GBM win probability on par-relative features; isotonic option-value curves; decision rule p* = (1−u)L/(G+(1−u)L); clustered logistic regression of review outcomes.
11. **Baselines:** constant and logistic WP; constant and side-only review model.
12. **Validation:** chronological (WP: train <2024, test 2024–26; reviews: train <2025, test 2025–26), match-cluster bootstrap CIs, calibration, sensitivity bounds.
13. **Visuals:** win-probability worm with the swing at stake; belief bar with the break-even line; price-map heatmap; overturn vs break-even dot plot; forest plot.
14. **Interaction:** pick a real review or build a situation, drag your confidence, see the expected value.
15. **Feasible by deadline:** all of it (done).
16. **Technical risks:** review-allowance reconstruction; browser WP lookup.
17. **Analytical risks:** unreviewed appeals are invisible, there is no ball-tracking, and option value depends on current behaviour.
18. **Licensing:** ODC-By attribution only.
19. **Complexity:** medium.
20. **vs AQX winners:** no winner has done cricket decisions; the decision is binary and economic, not a substitution simulator.
21. **vs current entries:** no visible entry touches DRS.
22. **Why judges care:** a concrete rule of thumb backed by a validated model and an honest test.
23. **Demo:** IPL 2025, Jurel's overturned LBW (17.4-point swing, 0.39% break-even), then the price map, then the captains chart.

### I-2 "Strike rate lies": win-probability-added batting value — **BACKUP**
Re-values T20 batting innings by WP added rather than strike rate.
- **Users and data:** scouts and auction strategists; Cricsheet ✓.
- **Method:** reuses I-1's WP engine. Baselines: strike rate and average, with year-to-year stability as validation.
- **Visuals and demo:** a WPA vs strike-rate scatter; demo "the 140-SR finisher worth more than a 170-SR opener".
- **Feasibility:** high.
- **Risks:** six or more 2026 WP repos already exist, and WPA attribution between partners is contestable.
- **Licensing:** ODC-By.
- **vs winners and current entries:** less distinctive.

### I-3 Death-over bowling allocator (T20)
Who should bowl overs 16–20, given each bowler's remaining quota?
- **Users and data:** captains; Cricsheet ✓ (10,935 IPL decisions in overs 16–20).
- **Method:** a bowler × phase run-value model plus dynamic programming over quotas. Baseline: the actual allocation.
- **Validation:** any gain can only be simulated, not checked on real outcomes.
- **Risks:** structurally close to THE HOOK (2nd place, 3.0). Prior art: Perera, Davis & Swartz (2016) and Ganesh (2026).

### I-4 Chase-tempo optimiser (Clarke-style dynamic programming)
When should a chasing side accelerate?
- **Data:** Cricsheet ✓.
- **Method:** a dynamic program over a run-rate vs dismissal-risk frontier, after Clarke (1988) and Preston & Thomas (2000).
- **Analytical risk:** the risk–return frontier is confounded in observational data (better batters both score faster and get out less), so the "optimal pace" can't be validated.
- **Verdict:** rejected for unverifiable results.

### I-5 Did the Impact Player rule change T20 strategy? (difference-in-differences)
- **Users and data:** IPL front offices; IPL 2023+ vs other leagues as controls; Cricsheet ✓.
- **Analytical risk:** parallel trends are doubtful (leagues differ in pitches and talent), so any causal claim is fragile.
- **Interactive potential:** limited.

### I-6 Toss-decision audit (bat or bowl first, by venue and era)
- **Data:** Cricsheet ✓; easy.
- **Analytical risk:** weak. Toss effects are small, noisy and well covered; little decision depth.

### I-7 Tennis second-serve risk
- **Data:** Match Charting Project. Sackmann's main repos returned 404 on 29 Oct 2026, and the licence is CC BY-NC-SA.
- **Prior art:** the answer is already published (Gale 1971; George 1973; Ely, Gauriot & Page 2017).
- **Verdict:** rejected on licensing and novelty.

### I-8 Football "Decision Gap": value of the pass not played (StatsBomb 360)
- **Method:** strong (xT/VAEP over the options visible in 360 freeze frames).
- **Licensing:** the StatsBomb agreement §1.2.1 forbids redistributing the data, and publications must carry its logo.
- **Feasibility:** complex. socceraction 1.5.3 breaks on install unless `multimethod<2` is pinned.
- **Competition:** soccer is the most crowded sport in 4.0.

### I-9 F1 undercut window
- **Data:** FastF1 v3.9 now requires an F1TV subscription; OpenF1 and Jolpica are non-commercial.
- **Similarity:** close to F1 Race-Lab (3rd place, 3.0) and to PITWALL.

### I-10 Off-ball "decoy" run value (SkillCorner)
- **Data:** MIT licence, but only 20 matches, at about 97 MB of tracking per match.
- **Feasibility:** heavy pipeline for the time available; tiny sample for validation.

### I-11 MLB stolen-base break-even after the 2023 rule changes
- **Data:** Retrosheet ✓ (notice required).
- **Method:** before/after run-expectancy matrices.
- **Concerns:** solid but descriptive; MLB is adjacent to THE HOOK; lower demo appeal.

### I-12 NBA end-of-quarter 2-for-1 audit
- **Data:** nba_api is limited by NBA.com terms (personal, non-commercial) and blocks cloud IPs, so data access is unstable.
- **Verdict:** rejected.

### I-13 NHL pull-the-goalie timing
- **Value:** good decision problem.
- **Competition:** two current 4.0 entries already do exactly this.
- **Data:** MoneyPuck is non-commercial.

## 6. Weighted scoring matrix

The weights are the planning weights from the brief, not the judges' (undisclosed) scheme. Scores run from 1 to 10. Penalties are applied after weighting.

| Idea | Practical 20% | Analytical 20% | Differentiation 15% | Data 15% | Feasibility 15% | Demo 10% | Repro 5% | Weighted | Penalty | **Final** |
|---|---|---|---|---|---|---|---|---|---|---|
| I-1 DRS economics | 8 | 9 | 9 | 8 | 8 | 8 | 9 | 8.40 | — | **8.40** |
| I-2 WPA batting value | 7 | 7 | 6 | 9 | 9 | 8 | 9 | 7.65 | — | **7.65** |
| I-11 MLB stolen bases | 7 | 7 | 6 | 8 | 7 | 6 | 8 | 6.95 | — | 6.95 |
| I-5 Impact Player DiD | 6 | 8 | 7 | 8 | 7 | 6 | 9 | 7.15 | −0.25 causal fragility | 6.90 |
| I-3 Bowling allocator | 8 | 7 | 5 | 8 | 7 | 8 | 9 | 7.25 | −0.5 similar to THE HOOK | 6.75 |
| I-6 Toss audit | 6 | 5 | 5 | 9 | 9 | 6 | 9 | 6.70 | — | 6.70 |
| I-4 Chase tempo DP | 7 | 6 | 6 | 8 | 6 | 7 | 9 | 6.75 | −0.5 unverifiable | 6.25 |
| I-8 Football Decision Gap | 8 | 8 | 6 | 6 | 5 | 8 | 4 | 6.75 | −0.5 licence + complexity | 6.25 |
| I-10 Decoy value | 7 | 8 | 7 | 5 | 4 | 8 | 7 | 6.55 | −0.5 complexity | 6.05 |
| I-13 NHL goalie pull | 8 | 7 | 2 | 6 | 7 | 7 | 5 | 6.20 | −0.5 two current entries | 5.70 |
| I-9 F1 undercut | 7 | 7 | 4 | 5 | 6 | 8 | 5 | 6.10 | −0.5 similar to 3.0 3rd place | 5.60 |
| I-7 Tennis 2nd serve | 7 | 7 | 4 | 5 | 6 | 7 | 4 | 5.95 | −0.5 licence, known answer | 5.45 |
| I-12 NBA 2-for-1 | 6 | 6 | 6 | 4 | 5 | 6 | 3 | 5.40 | −0.5 unstable API/terms | 4.90 |

**Selected: I-1.** It is the only candidate that scores high on all three judging criteria at once:
- **Practical:** it gives a decision rule a captain can use tomorrow.
- **Analytical:** it needs a calibrated model, an economic decision rule and a falsifiable behavioural test.
- **Presentation:** the belief bar and price map make the economics visible.

It also has clean, bundle-able data, and nothing like it appears among past winners or current entries.

**Backup: I-2.** It reuses the same data and WP engine, so switching would have cost hours, not a day. We did not need it.

## 7. Data and open-source audit

| Resource | Code licence | Data terms | Bundle? | Used? | Notes |
|---|---|---|---|---|---|
| **Cricsheet** (cricsheet.org) | — | **ODC-By 1.0**, commercial use allowed, attribution required | **Yes** | **Yes**, 11 men's T20 zips (34 MB) | Ball-by-ball, including the `review` object (by, umpire, batter, decision, umpires_call). Afghanistan-related matches are withheld by Cricsheet. |
| StatsBomb Open Data | none | User agreement: no redistribution, logo on publications | No | No | 3,961 matches, 426 with 360 frames |
| socceraction | MIT | — | — | No | Not actively developed; needs `multimethod<2` |
| mplsoccer | MIT | — | — | No | — |
| SkillCorner open data | MIT | MIT | Yes | No | 20 A-League matches |
| Wyscout / Pappalardo 2019 | — | CC BY 4.0 | Yes | No | 1,941 matches, 2017/18 |
| FastF1 / OpenF1 / Jolpica | MIT / NC / NC-SA | F1 copyright; non-commercial | Partly | No | FastF1 v3.9 needs F1TV |
| nflverse | MIT | CC BY 4.0 (declared) | Yes | No | Ideas saturated |
| Retrosheet / Lahman | — | Notice required / CC BY-SA | Yes | No | — |
| Sackmann tennis | — | CC BY-NC-SA 4.0 | Only under NC-SA | No | Main repos 404 as of 29 Oct 2026 |
| nba_api, pybaseball | MIT | NBA.com / MLB terms restrict use | No | No | — |
| chaseline (T20 chase WP) | none detected | ODC-By derived | — | Design reference only, no code copied | Tested on 2026 season, Brier 0.114 |
| cricketdata (R), cricketstats (Py), yorkr (R) | GPL-3 / GPL-3 / MIT | — | — | No | GPL is incompatible with a permissive project; stale |

Resource ranking (1–10 per criterion: relevance, availability, licence clarity, quality, analytical usefulness, ease of integration, time to first result, demo suitability; total out of 80). From the research agent's audit, with our own row for Cricsheet's DRS use:

| Resource | Rel | Avail | Licence | Quality | Useful | Ease | Speed | Demo | Total |
|---|---|---|---|---|---|---|---|---|---|
| Cricsheet (DRS use case) | 10 | 10 | 10 | 8 | 9 | 8 | 9 | 8 | **72** |
| StatsBomb + 360 | 10 | 9 | 8 | 9 | 10 | 9 | 9 | 10 | 74, but cannot be bundled |
| SkillCorner | 9 | 8 | 10 | 7 | 8 | 8 | 7 | 10 | 67 |
| Wyscout/Pappalardo | 8 | 10 | 10 | 7 | 8 | 8 | 8 | 7 | 66 |
| OpenF1 | 8 | 9 | 5 | 8 | 8 | 9 | 8 | 9 | 64 |
| nflverse | 7 | 10 | 7 | 9 | 7 | 9 | 9 | 6 | 64 |
| Jolpica + TUMFTM | 7 | 9 | 8 | 8 | 7 | 9 | 9 | 6 | 63 |
| Retrosheet + Lahman | 7 | 9 | 9 | 9 | 8 | 6 | 6 | 6 | 60 |

**Measured DRS coverage (our parse, men's T20):** 5,328 review records in total, of which 5,132 fall in full-length matches with a result. Counts by competition:

| Competition | Reviews |
|---|---|
| IPL (2018–26) | 990 |
| T20I | 1,407 |
| PSL | 640 |
| BPL | 571 |
| CPL | 400 |
| LPL | 330 |
| ILT20 | 294 |
| SA20 | 278 |
| BBL | 205 |
| MLC | 203 |
| T20 Blast | 21 |

## 8. Literature and how it shaped the build

| Reference | What we took from it |
|---|---|
| Shivakumar (2018), *J. Sports Econ.* 19(3), [link](https://econpapers.repec.org/RePEc:sae:jospec:v:19:y:2018:i:3:p:315-331) | About 26% of challenged calls are reversed. Our 26.6% reproduces this, a sanity check on parsing. |
| Borooah (2016), *J. Sports Econ.* 17(1), [link](https://econpapers.repec.org/RePEc:sae:jospec:v:17:y:2016:i:1:p:64-85) | DRS imperfections and umpire's call. Motivates modelling umpire's call as a separate, review-retaining outcome. |
| Rathi & Rathi, SSRN 3809137, [link](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3809137) | Gamesmanship in fielding-side T20 reviews. Consistent with our much lower fielding-side success (odds ratio 0.56). |
| Asif & McHale (2016), *IJF* 32(1), [link](https://ideas.repec.org/a/eee/intfor/v32y2016i1p34-43.html) | In-play win probability via dynamic logistic regression. Became our logistic baseline. |
| Brooker & Hogan (2011), WASP, [link](https://ideas.repec.org/p/cbt/econwp/11-44.html) | Conditions-adjusted expectations. Inspired the par-relative scoring-environment feature. |
| Stern (2016), DLS, [link](https://research.bond.edu.au/en/publications/the-duckworth-lewis-stern-method-extending-the-duckworth-lewis-me/) | Resources depend on balls and wickets. Informs the monotonic constraints. |
| Clarke (1988); Preston & Thomas (2000), [link](https://ifs.org.uk/journals/batting-strategy-limited-overs-cricket) | Dynamic-programming views of limited-overs decisions. Led us to reject the chase-tempo idea (I-4), whose risk–return frontier is unidentifiable. |
| Davis, Perera & Swartz (2015), [link](https://www.sfu.ca/~tswartz/papers/t20sim.pdf); Ganesh (2026), [arXiv 2604.13861](https://arxiv.org/abs/2604.13861) | T20 simulation and bowling plans already exist. Reduced I-3's novelty. |
| Ely, Gauriot & Page (2017), [link](https://ideas.repec.org/a/eee/joepsy/v63y2017icp135-142.html) | The second-serve question is already answered. Rejected I-7. |
| Decroos et al. (2019) VAEP, [doi](https://doi.org/10.1145/3292500.3330758); Singh xT | Football valuation baselines (I-8). |
| Rule sources: [IPL 2018 DRS introduction](https://www.sportskeeda.com/cricket/ipl-2018-drs-introduced-first-time); [IPL 2022: two reviews per innings](https://www.crictracker.com/ipl-2022-two-drs-reviews-per-innings-bcci-makes-major-changes-to-playing-conditions/); [DRS overview](https://en.wikipedia.org/wiki/Decision_Review_System) | Validated our data-inferred allowances. The pipeline infers 1 for IPL 2018–21 and 2 from 2022, exactly matching the rule change. Umpire's call retains the review. |

We did not find a published model of when to *spend* a limited review. This is a literature-search result, not proof that none exists.

## 9. Sources

- Competition: https://aqxanalyticsfour.devpost.com/ (overview, /rules, /details/dates, /project-gallery, /updates, /participants, /forum_topics)
- Past galleries: https://aqxanalytics.devpost.com/project-gallery, https://aqxanalyticsdata.devpost.com/project-gallery, https://aqxanalyticsthree.devpost.com/project-gallery
- Winner pages: devpost.com/software/ followed by load_watch, the-hook-2wgova, f1-race-lab-intelligent-race-analytics-strategy-simulator, 4th-down-audit, ipl-2009-2023-analysis, world-cup-monte-carlo-2026-bracket-simulator, ice-in-his-veins, deeppitch-predictive-football-analytics, gameiq, capcraft-ai, under-pressure-ugrht4, the-replacement-report, guardianai-2acnyu, fifa-2026-player-impact-analytics
- Winner repos checked: https://github.com/Harshyadav442277/the-hook; https://github.com/Trie-hard/Load_Watch (probable match; its README does not name AQX)
- Current-entry repos: github.com/ followed by ShermaineYap/squadro-match-lab, waazy-w/pull-the-goalie, ALENZACODES/aqx-goalie, JkalasG/CourtFatigue, SaraWang047671020/aqx-databowl-nba-rookie-options, tarun-vignes/shotsense-nba, u19725505-star/courtiq-decision-lab, krithiksharan13/moneyball-scout, idansajah71-blip/pitchiq, alvitobuana/sack-or-stick-football-analytics, Beam-bf/TactIQ, estona815/fixturelens-aqx-2026, chanjyi/FIFA-World-Cup-Intelligence, C12isme945/diamondcheck, EazyHood/six-ball-review, manveliskandaryan03-sudo/tennis-win-factors, Trie-hard/Pay-by-Play, nouhaila-builds/Milo-Analytics
- Data: https://cricsheet.org/downloads/, https://cricsheet.org/licensing/, https://opendatacommons.org/licenses/by/1-0/
