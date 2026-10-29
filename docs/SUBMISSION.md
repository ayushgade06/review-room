# Devpost submission text

**Project title:** Review Room: when should a cricket team challenge the umpire?

**Tagline (≤ 200 chars):** Cricket's version of the NFL challenge flag, priced with data. 5,132 real challenges show how sure a team must be before challenging, and that teams challenge far too rarely.

**Links**
- Working prototype: https://ayushgade06.github.io/review-room/ (it also runs locally with `python -m http.server` inside `web/`)
- Public GitHub repository: https://github.com/ayushgade06/review-room

**Suggested image gallery** (in `docs/img/`, in this order, with captions):
1. `1-hero.png`: "Cricket's challenge system, priced: what a call is worth vs what a failed challenge costs."
2. `2-primer.png`: "New to cricket? The four ideas you need."
3. `3-cheat-sheet.png`: "The cheat sheet: how sure a player needs to be, by stage of the match."
4. `4-review-room.png`: "Replay any real challenge: the win-chance line, the stakes, the bar, the verdict."
5. `5-price-map.png`: "Every moment of a match: light = be fairly sure, dark = challenging is nearly free."
6. `6-captains.png`: "Teams win challenges far more often than they need to: they should challenge more."
7. `7-evidence.png`: "Tested on 2,813 matches the model had never seen."

---

## Inspiration

Cricket has its own version of the **NFL coach's red flag**. A team can challenge an umpire's "out" or "not out" call with video replay. The system is called DRS (Decision Review System). Each team can only lose a couple of challenges per innings, so players hesitate. Commentators say "don't waste it", and challenges are judged by whether they worked.

But nobody puts numbers on the bet. You risk a challenge you might need later, to fix a call that might cost you the game. **How sure do you actually need to be?**

## What it does

Review Room prices both sides of every challenge, in **win chance**: the percentage chance a team wins, updated after every ball, like a TV win-probability line.

- **What the call is worth:** how much a team's win chance changes if the call is overturned.
- **What a failed challenge costs:** how much win chance a team typically gains later from a challenge it still holds.
- Together they give **how sure you need to be** before challenging.

**Features**
- **New-to-cricket primer:** four ideas, with NFL, MLB and tennis comparisons.
- **The cheat sheet:** a one-screen challenge policy by stage of the match and challenges left. Example: early in the innings with two challenges left, a batting team should challenge if they see a 1-in-23 chance the umpire is wrong.
- **The Review Room:** replay real challenges (or browse all 5,132, or build your own situation). For each one:
  - the match's win-chance line;
  - what was riding on the call;
  - a slider for your own confidence;
  - a reveal of the real replay verdict.
- **Price map:** how sure you need to be, for every over and match situation.
- **Do teams challenge enough?** Success rates vs the bar; the last-challenge effect; batters who walked off without challenging.
- **Team audit and evidence:** win chance gained per team, and how the model was tested.

## Key findings

All from Cricsheet data on 5,132 men's T20 challenges, 2017–2026.

- **A challenge is cheap; a call is expensive.** A disputed call is typically worth **5.5 points** of win chance. A failed challenge typically costs **0.08 points**.
- **The bar is low.** Typically a team needs only **1.3%** confidence that the umpire is wrong, about a 1-in-77 chance. In **96%** of real decisions they needed less than 1-in-10. This holds at 81% even if a saved challenge were worth three times our estimate.
- **Teams are too cautious.** They win **27%** of challenges, far above the bar everywhere in the match. They get even pickier with their last challenge: odds of success **1.38×** higher. And **463** batters walked off "out" without challenging while their team still had one.
- **Simple team rule:** unless you're about 92% sure the umpire is right, challenge.
- **An honest negative result:** match situation can't predict which challenges succeed. That depends on the ball, which only the player sees. So the tool asks for the player's confidence instead of guessing.

## Actionable impact

- **Coaches:** set a pre-agreed challenge policy using the cheat sheet, instead of deciding on gut feel in 15 seconds.
- **Analysts:** review each player's challenges against the bar, not just against the outcome.
- **Broadcasters:** an instant, explainable "should they challenge?" number for any delivery.

## How we built it

1. **Data:** 8,897 professional T20 matches (2.04 million balls) from Cricsheet's open ball-by-ball data, including its replay-challenge records.
2. **Win-chance model:** trained on matches before 2024 and tested on **2,813 later matches it had never seen**.
   - It beats a standard textbook model (logistic regression) in both innings, with the improvement holding under re-sampling.
   - It is well calibrated: when it says 70%, teams win about 70% of the time.
3. **Challenges left:** rebuilt from the order of challenges in each match. Our reconstruction matches the IPL's real 2022 rule change from one to two challenges per innings.
4. **Cost of a lost challenge:** measured from how much win chance teams gain later from the challenges they still hold.
5. **App:** a static web app with no servers and no API keys. The maths runs in the browser, and 11 automated tests check the data processing and that the browser matches the Python results.

## Challenges we ran into

- **Record-breaking scoring.** The IPL now scores far more runs than in any earlier season, and our first model broke on those matches. Measuring runs against each league's recent "par" fixed it, like judging an NBA team's points against that season's pace.
- **Missing information.** The data doesn't say how many challenges a team has left, so we rebuilt it and checked the result against the published rules.
- **Invisible calls.** Calls nobody challenged don't appear in the data. We say so, and treat those numbers as scenarios rather than facts.

## Limitations

- No ball-tracking data.
- The player's confidence is supplied by the user.
- Challenge values reflect how teams challenge today.
- Win chance depends on the match situation, not on which player is batting.
- These are patterns, not proof of cause and effect.

## Built with

Python · pandas · scikit-learn · statsmodels · JavaScript · SVG · Cricsheet open data (ODC-By 1.0)

_Contains information from Cricsheet, made available under the ODC Attribution License 1.0._
