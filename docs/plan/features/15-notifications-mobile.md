# Features 15 — Mobile and Push Notifications

**Status: DRAFT v3 (2026-10-21).** Mobile-first layout is launch scope. Push is a later feature.

## 1. Mobile (launch)

- Design the core pages for about 360 px first: compact tables with expanders, readable charts, tappable controls.
- A PWA manifest so the site can be added to the home screen is cheap and optional at launch.
- If a service worker caches pages for offline use, cached pages must show their real `as_of` and an "offline" note.
- Native apps are out of scope unless PWA limits become a real problem.

## 2. Push notifications (later)

**Channels**, in rough order of value:

1. Big odds movement for a followed team (for example ±10 points after a slate).
2. High-stakes game starting soon (needs leverage, [features/13](13-leverage-rooting.md)).
3. Clinched or eliminated (from our clinch check or an official marker, [features/14](14-clinch-magic-elimination.md)), and "clinches with a win tonight" scenarios.
4. A weekly digest.

**Must-haves**

- **iOS/iPadOS:** web push works only after the user adds the site to the Home Screen and grants permission from there. Explain the install step; ask only after a user tap; never prompt on page load.
- **No accounts (D25):** subscriptions are per device (endpoint plus followed teams and preferences). Provide clear pause and unsubscribe, and delete the endpoint on unsubscribe.
- **Endpoint cleanup:** retire endpoints immediately on a 404/410 from the push service.
- **Caps:** for example at most 2 per team per day and 3 per device per day, one notification per event, and quiet hours in the user's timezone.
- **Stale-claim checks:** before sending, re-check that the claim is still true against the current snapshot. Drop expired items (a "game starts soon" alert after kickoff) instead of sending them late.
- **Correctness:** never send "clinched" from a probability.
- **Data hygiene:** treat endpoints as personal data. Don't log them in full, and set retention windows before launch (old O5, in the doc 06 backlog).
- **Kill switch:** a global switch to stop sending.
