# 06 — Launch Checklist and Hardening Backlog

**Status: DRAFT v3 (2026-10-21).** Replaces the v2 cross-cutting requirements (D45). The checklist is the bar for M3. The backlog collects the v2 hardening work to pull in when a feature, traffic level or incident makes it worth doing.

## 1. Launch checklist (M3)

**Data and pipeline**

- [ ] Scheduled and game-final snapshots ran unattended for at least several days of real NFL games.
- [ ] A forced failure (bad input, SportsCrunch down, engine crash) leaves the current snapshot in place and logs or alerts.
- [ ] Stale banner appears when the current snapshot is too old (tested by pausing the scheduler).
- [ ] Golden-season standings fixtures pass in CI.
- [ ] Clinch check: zero disagreements with brute force, zero false clinches or eliminations across the 2020–2025 replay, and live statuses compared with official markers (when the crawl exists).

**Operations**

- [ ] Deployed on Forge on the dedicated server (D28), with queue workers and scheduler supervised.
- [ ] Rollback means redeploying the previous release; this has been tried once.
- [ ] Daily database backups, and snapshot input files on S3 with versioning. One restore has been tested.
- [ ] Error reporting (Flare, Sentry or similar) and an uptime check on the site.
- [ ] Alert when no snapshot has been published for longer than the league threshold during the season.

**Web**

- [ ] Rate limiting on public routes, and HTTP/CDN caching keyed by snapshot.
- [ ] Core answer and tables present with JavaScript disabled (O8 decided).
- [ ] Usable at phone width (about 360 px).
- [ ] Basic accessibility: real tables with headers, keyboard navigation, visible focus, sufficient contrast, status never conveyed by color alone, and an automated axe check of the main pages.
- [ ] Titles, canonical URLs, sitemap and `robots.txt`; Cloudflare or CDN bot settings match doc 05 (O2 decided).

**Legal and pages**

- [ ] Methodology page, a short privacy page (what analytics, if any), and terms with attribution guidance.
- [ ] Team names as text; no team logos unless licensed.
- [ ] No raw sportsbook lines republished; we show our own outputs.

## 2. Hardening backlog

Pull an item in when it becomes useful. Each item notes when it is likely to matter.

| Item | Likely trigger |
|---|---|
| **Calibration check:** backtest season odds (Brier, log loss, calibration curves), check the drift curve and tie rate against 2026, consider per-sim talent uncertainty early in a season (D10), publish results on the methodology page | Soon after launch; reuse SportsCrunch's `benchmark:win-probabilities` and PoolCrunch's drift measurement tooling |
| Score model for NFL/NBA, goal model for NHL | Tiebreak draw counter shows score-based steps deciding spots |
| Per-sim outcome storage (compact binary) | Server-side picker refinement (leverage is computed during the run, features/13) |
| Stricter reproducibility: canonical input encoding, scheduled replay checks | Disputes about past numbers, or engine upgrades that need proof of no change |
| Load testing and capacity planning | Traffic spikes, picker or API usage |
| Security review and threat model; webhook replay protection review | Before API keys, push or any accounts |
| Formal RPO/RTO targets and disaster-recovery drills (old O4) | When downtime would be costly |
| Privacy retention windows for push endpoints and logs (old O5) | Before push notifications |
| API deprecation policy and keyed limits (old O6) | Before API keys or v2 API |
| Product metrics and error budgets (old O7) | After a few weeks of real traffic |
| Full WCAG 2.2 AA audit with screen-reader testing | Before marketing pushes, or on any accessibility report |
| Data-quality anomaly checks (suspicious probabilities, missing games) | First time bad upstream data reaches the site |
| Correction UX (visible "corrected" notes on charts) | First material correction |
| License and attribution instrument (O3) | Before announcing the public API |
