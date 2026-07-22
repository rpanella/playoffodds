# Features 15 — Notifications & Mobile

**Status: DRAFT v1 (2026-07-16) — detail pass complete, pending owner review.** Covers reference-doc features #23, #24. Zero incumbents notify on odds movement; every strong incumbent is desktop-first. These are the retention mechanics.

---

## 1. Mobile-first (#24) — a discipline, not a feature

- **Every component is designed at 390px first** (already binding on docs 10–14); desktop is the progressive enhancement. Tables collapse to cards, grids scroll within their own containers, charts are tap-scrubbed — no hover-dependent information anywhere.
- **PWA baseline at launch:** installable (manifest + icons), service worker caching the app shell and the **last snapshot per followed league** — the site opens instantly and shows real (timestamped) odds offline; a stale banner appears if >24h old.
- **Performance budgets (CI-enforced from Phase 3):** LCP < 2.5s on throttled 4G for league hub and team pages; per-page JS budgets with Inertia code-splitting (the picker's engine worker loads only on picker routes); images = team marks only, SVG where possible.
- **Native apps: not v1.** PWA + Web Push covers the retention loop; revisit native (and iOS push nuances that remain) only if PWA engagement data argues for it. Tankathon-level responsive quality is the bar to beat — with the reference doc's judgment that mobile-first beats model quality as a differentiator taken seriously.

## 2. Push notifications (#23)

**Transport:** Web Push (VAPID) from the PWA, v1. Triggers evaluated by the pipeline immediately after each snapshot write (spine and intraday — movement alerts are exactly the D16 intraday moment).

**Channels (per followed team, individually toggleable):**

| Channel | Trigger | Example |
|---|---|---|
| Odds movement | `\|Δ p_playoffs\|` vs. this morning's spine ≥ threshold (default 5%, user-tunable 2/5/10) | "Vikings playoff odds +7.6% tonight → 52.9%" |
| High-leverage game | T−2h before a game whose leverage for your team is top-decile (features/13 tiers) | "Tonight matters: PHI@WSH swings your odds ±6.2%" |
| Clinch/elimination | Deterministic flag fires, or tonight-scenario exists (features/14) | "CLE clinches tonight with a win + SEA loss" |
| Weekly digest | Spine snapshot, one per week per league | "Your week: 52% → 61%, magic number 6" |

**Anti-spam discipline (hard rules):** max 2 pushes/team/day; clinch supersedes movement (never both for the same night); quiet hours 23:00–08:00 local (queued to morning, movement alerts merged into one); no notification for movement that reverses within the same evening (evaluate at slate end — the debounced intraday snapshot, not per-final). Every push deep-links to the team page with the relevant module scrolled into view.

**Content rule:** the number is the notification — value + delta in the title, no "check the app" teasers.

## 3. Subscriptions without accounts (PROPOSED resolution to Q13, v1 scope)

**Device-local subscriptions, no user accounts in v1:** a push subscription row keyed by endpoint, holding followed teams + channel prefs + thresholds + timezone, created from a "follow" button on any team page (also the entry point for the My Team picker defaults, features/12). No login, no email, no sync across devices — a second device is a second follow, which matches how casual fans actually behave.

**Account triggers, deferred:** cross-device sync and the public API's keys (features/16) both want identity — features/16 proposes **accounts-lite** (email + API key, no profile). Full accounts happen only if/when a premium tier (Q14) demands them. Q13 stays open in 99 with this as the standing proposal.

## 4. Launch scope (PROPOSED)

PWA + budgets + offline shell: **Phase 3** (it's how the site is built, not an add-on). Follow buttons + device subscriptions + clinch and movement channels: **Phase 6 per build order** — but the notification *evaluation hooks* (trigger scan after snapshot write) are stubbed in Phase 2's pipeline so adding channels later touches no pipeline code. Digest + leverage channels follow once features/13's tiers have a few weeks of live data to calibrate "top-decile."
