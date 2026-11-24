# Understands pin-and-compare; seam still blurred with "code to protect"

Jarrod can explain the review loop: pin current behavior with a test, let the agent change code, compare, roll back if behavior or performance regresses. For a seam he named the transaction-crawling code in claims-app, which is the code to protect, not the place to swap behavior.

**Evidence:** spoken answer after Lesson 4.
**Misconception to correct:** a seam is where the crawler's call to the chain's data source could be swapped for recorded data in tests. Revisit in Lesson 5 or a short follow-up.
**Also noted:** he added performance as a goal; characterization tests check behavior, not speed, so a separate timing check is needed.
**Implications:** Lesson 5 (his own "how do I keep AI code good" story) can use pin-and-compare confidently.
