# Demo script (about 90 seconds)

**Setup:** open the app at its URL, or run `python -m http.server 8000` inside `web/` and open http://localhost:8000. Start at the top of the page. All numbers below are what the app shows.

---

### 0:00–0:15 · The question (hero)

> "Every DRS review is a bet. You risk a review to win back a wicket. We priced both sides of that bet for **5,132 real reviews** across 11 men's T20 competitions.
> A wicket in question typically swings **5.5 win-percentage points**. A review held in reserve is worth about **0.08**. So the bar for reviewing is tiny: a median break-even confidence of **1.3%**."

Point at the HUD on the ball-tracking graphic: wicket swing, review at risk, break-even, overturned.

### 0:15–0:45 · The Review Room (the core interaction)

Click **Enter the Review Room**. The first case file loads: *The overturn that swung it*.

> "IPL 2025. Rajasthan are chasing 206 and are 112 for 3 in the tenth over when Dhruv Jurel is given out LBW.
> On the win-probability curve, the orange bracket is what's at stake: **17.4 points**. Losing a review would cost **0.09**. Umpire's call keeps the review a quarter of the time.
> So Jurel should review if he is even **0.39% sure** the umpire is wrong."

Drag the confidence slider down towards 1%. The expected value stays positive, and turns negative just left of the orange break-even line.

> "History says reviews like this are overturned 32% of the time, more than ten times the bar."

Click **Reveal the decision**. The **NOT OUT** stamp appears with "+17.4 pts won back".

Optionally, click *When the wicket barely mattered* (SA v SL, T20I 2024). The wicket is worth only 0.3 points, so the bar jumps to about 49%: "the review isn't free when the wicket doesn't matter."

### 0:45–1:05 · The price map

Scroll to **02 The price of a review**.

> "This is the same calculation across every game state, here for a chasing side's *last* review. Light cells are where a review is relatively expensive: early in the innings, in lopsided games. Even then the bar tops out around 13%. In three quarters of states you need less than 5% confidence."

Hover a light cell, then a dark cell.

### 1:05–1:20 · Do captains get it right?

Scroll to **03**.

> "Overturn rates (the blue and orange dots, with 95% intervals) sit far to the right of the break-even diamonds in every phase. Captains could review much more freely.
> They do behave rationally in one way: on their last review they're pickier, with odds of an overturn 1.38× higher. But 463 batters walked off LBW without reviewing while their side still had a review in hand, at a median break-even of 1.9%."

### 1:20–1:30 · Evidence and close

Scroll to **05 Evidence**.

> "It's all tested on matches the models never saw (2024–26). The win-probability model beats a logistic baseline in both innings, and it's well calibrated.
> One honest negative: match context can't predict which reviews succeed beyond which side is reviewing. That's exactly why the tool asks for the captain's confidence instead of pretending to predict it.
> **Takeaway: in T20, a review is cheap and a wicket is expensive. Unless you're nearly certain the umpire is right, review.**"

---

**If asked:**
- *"Isn't the option value underestimated?"* See the Robustness table. Even with option value tripled, 81% of real review decisions had a break-even below 10%.
- *"Is this causal?"* No. The win-probability swing is a model estimate. The behavioural results are associations conditional on a team having chosen to review.
