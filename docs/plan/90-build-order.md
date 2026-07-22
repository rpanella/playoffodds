# 90 — Build Order & Phases

**Status: DRAFT v1 (2026-07-16).** Dates assume solo + LLM-agent development; treat as targets, not commitments. Rule inherited from the reference doc: **snapshot persistence before anything user-facing** (softened by our backfill ability, but still cheap insurance).

## Phase 0 — Pre-work & planning (now → late July)

**SportsCrunch side** (new additions only — SportsCrunch's own data completeness/backfill is out of scope per D9; specs in doc 03 §4, priority order):
- [ ] Ratings & params endpoint incl. `?at=` (doc 03 §4.1) — blocks Phase 1 playoff pricing + backfill
- [ ] `all_star_break_date` on MLB seasons (doc 03 §4.3) — blocks MLB tiebreakers (schedule-gap fallback exists)
- [ ] Expose `is_projected` on the live games endpoint (doc 03 §4.2)
- [ ] Expose NHL `end_type` (REG/OT/SO) on games (doc 03 §4.5) — blocks Phase 5 NHL only
- [x] ~~Postseason anchor approach~~ resolved: ratings-side, no upstream work (doc 03 §4.4)
- [x] ~~Bulk-backfill path~~ resolved: per-day API assembly fits the throttle (doc 02 §7)

**Planning side:**
- [ ] Detail pass + owner review: docs 01–04 (engine, outputs, integration, tiebreakers) — these gate Phase 1
- [ ] Feature docs 10–17 detail passes can trail (gate their own phases)

**Exit criteria:** docs 01–04 reviewed; SportsCrunch asks either done or scheduled; PlayoffOdds repo scaffolding decisions recorded (monorepo layout, engine package).

## Phase 1 — Engine core on live MLB (Jul → Aug)

- TS engine package: schedule/standings modules for **MLB + NFL**; current-era tiebreaker rule sets authored from official league publications (doc 04 §2) + **historical verification green (5+ seasons/league)**
- Anchored + dynamic Monte Carlo (Node worker), vectorized; 100k MLB sims within runtime budget
- Calibration harness: η measured from historical rating drift; coverage tests pass on ≥3 past MLB seasons
- Jitter test green (fixed seeds)

**Exit criteria:** daily MLB run produces stable, calibrated odds; NFL sim runs against 2025 season data with verified seeding.

## Phase 2 — Snapshot pipeline (Aug)

- PlayoffOdds DB + snapshot store (Layer 1 aggregates + Layer 2 outcome matrices, doc 02)
- Scheduled daily MLB snapshots, webhook-triggered post-slate re-sims, unattended for 2+ weeks
- Backfill: current MLB season to opening day; NFL 2025 season as chart proof-of-concept

**Exit criteria:** two weeks of unattended correct MLB snapshots; backfilled season renders a correct time-series.

## Phase 3 — Website core (Aug → early Sep)

- Laravel 12 + Inertia app: league odds tables, seeding matrix, win distributions, team pages, time-series charts (features/10, 11)
- Model-transparency page (ratings published)
- NFL onboarding: 2026 schedule flowing, preseason snapshots running
- Mobile-first from the first component (features/15 discipline, not a retrofit)
- **Agent-discovery build constraints (doc 05 §1):** SSR with odds as real HTML, answer-first page composition, canonical URLs + visible timestamps, robots.txt/sitemap/JSON-LD components, AI-user-agent logging

**Exit criteria:** MLB fully browsable in staging; NFL tables live on preseason data.

## Phase 4 — NFL launch (early Sep, kickoff ~Sep 10)

- Public launch: NFL + MLB (MLB pennant races are live content at launch)
- Launch content: backfilled history charts, seeding heatmaps, daily movers
- Ops: monitoring, snapshot alerting, error budgets
- **Agent/SEO launch checklist (doc 05 §6):** Search Console + Bing WMT + IndexNow live (pinged on spine writes), CDN/WAF audit (AI crawlers allowed, IP ranges whitelisted), `/llms.txt` + `.md` doc mirrors, citation guidelines on `/model`, Bing AI Performance baseline

**Exit criteria:** launched; snapshots never miss a day in week 1.

## Phase 5 — The wedge + daily hooks (Sep → Oct)

- Interactive picker with client-side sims + shareable scenarios (features/12)
- Leverage feed + rooting guide + clinch/magic (features/13, 14)
- NBA/NHL onboarding: play-in + OT/points models, tiebreakers verified, live by season starts (Oct)

## Phase 6 — Expansion (Nov+)

- Push notifications (features/15), public API + downloads (features/16) **with anonymous GET tier + OpenAPI + single-file agent docs + attribution objects, and the MCP server + registry/directory listings (doc 05 §2–3 — MCP is an early-ship candidate)**, draft order/lottery (features/17)
- Then: live in-game approximation (#11), injury awareness (#30), college sports — reassess after launch learnings.

## Dependency notes
- Docs 01+04 gate Phase 1; doc 02 gates Phase 2; doc 03 asks gate Phases 1–2 (anchors + ratings feed)
- Features 12–14 all depend on Layer-2 outcome matrices — get that schema right in Phase 2, changing it later is expensive
- NBA/NHL join at Phase 5 but their standings modules can be built/verified any time after Phase 1
