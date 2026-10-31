# Demo script (about 90 seconds)

**Setup:** open https://ayushgade06.github.io/review-room/ and start at the top. Every number below is what the app shows.

---

### 0:00–0:15 · The hook

> "Cricket has its own version of the NFL challenge flag. A team can challenge the umpire's call with video replay, but challenges are limited. So every challenge is a bet: risk a challenge you might need later, to fix a call that might cost you the game.
> We priced that bet for **5,132 real challenges**. A disputed call is typically worth **5.5 points** of win chance. A failed challenge costs about **0.08**. So a team typically needs only a **1-in-77** belief that the umpire is wrong."

If a judge is new to cricket, click **New to cricket? 60-second primer** (four short cards).

### 0:15–0:30 · The cheat sheet

Scroll to **The cheat sheet**.

> "This is the one-screen policy a coach could pin in the dressing room. Early in the innings, with two challenges left, a batting team should challenge at a **1-in-23** chance. Late in the innings it's **1-in-456**: challenge almost anything. The simple rule: **unless you're about 92% sure the umpire is right, challenge.**"

### 0:30–0:55 · The Review Room

Scroll to **The Review Room**. The first case file is loaded.

> "IPL 2025. Rajasthan are chasing 206, at 112 for 3, when Dhruv Jurel is given out. The orange bracket on the win-chance line is what's riding on the call: **17.4 points**. A failed challenge would cost **0.09**. So Jurel needed only a **1-in-254** belief the umpire was wrong."

Drag the confidence slider. The expected value is shown live, and turns negative only to the left of the orange bar.

Click **Reveal the replay verdict**. A **NOT OUT** stamp appears: "+17.4 pts won back".

Optional contrast: click **When the call barely mattered**. The match is nearly decided, so the bar jumps to about 49%.

### 0:55–1:15 · Do teams challenge enough?

Scroll to **Do teams challenge enough?**

> "Teams win challenges 18–41% of the time, depending on the situation (the dots). They only need to win about 0.2–2.4% of the time (the diamonds). And with their last challenge they're even more cautious. Meanwhile **463** batters walked off 'out' without challenging, with a challenge still unused."

### 1:15–1:30 · Trust and close

Click **Evidence & method →** (top right) and scroll to **Can you trust the numbers?**

> "The model learned from matches before 2024 and was graded on 2,813 later matches it had never seen. When it says 70%, teams win about 70% of the time. And one honest negative: no model can predict which challenges win from the match situation alone. Only the player sees the ball, so the tool asks for their confidence instead of pretending.
> **Bottom line: in T20 cricket a challenge is cheap and a call is expensive. Teams should challenge far more often.**"

---

**Likely questions**
- *"Isn't a saved challenge worth more than you think?"* See **Does the main finding survive tougher assumptions?** Even at 3× our estimate, 81% of decisions needed less than a 1-in-10 belief.
- *"Is this cause and effect?"* No. Win chance is a model estimate, and the behaviour findings are patterns among challenges that were actually made.
- *"Why cricket?"* Clean, openly licensed ball-by-ball data with replay-challenge records, and nobody has priced this decision before. The same method works for NFL or MLB challenges.
