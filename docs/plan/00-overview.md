# 00 — PlayoffOdds Master Plan

**Status: DRAFT v3 (2026-10-21).** Re-planned for a late-2026 NFL launch (D43, D50) with a ship-first scope (D45). Clinch statuses are computed by us at launch (D50), and drift comes from PoolCrunch's measured line movement (D51). The heavier v2 plan from 2026-07-22 is in git history (commit `1df015c`); every decision it made is logged in [99](99-decisions-open-questions.md), with what superseded it.

PlayoffOdds is a playoff-odds site for the NFL, NBA, NHL and MLB. It simulates the rest of each season many times using market-anchored game probabilities and the leagues' real tiebreaker rules, then shows each team's chances of making the playoffs, earning each seed and winning it all. The goal is to get a correct, useful NFL product live this season, then improve and harden it as real usage shows what matters.

## 1. Product

**Core outputs** (every league): make playoffs, win division, each seed, first-round bye, each playoff round reached, championship, and projected final record as a distribution.

**What makes it worth using:**

- **Correct tiebreakers** inside every simulated season, era-specific and checked against official results. Most competitors approximate this; it is our credibility edge.
- **Our own clinch and elimination statuses**, computed by checking every possible remaining result, never inferred from a probability. Then clinching scenarios ("clinches with a win, or a Jaguars loss") and MLB magic numbers.
- **Realistic uncertainty:** each simulated season lets teams improve or decline by amounts measured from 12 seasons of real line movement (D51).
- **History charts** of each team's odds over the season.
- **The picker** (first fast-follow): pick game winners and watch the *probabilities* recalculate, not just a bracket. Almost no one does this.
- **Agent- and search-friendly pages:** every page answers its question in plain server-rendered HTML, with a JSON API and MCP server soon after launch so AI agents can fetch and cite the numbers.
- **Mobile-first** layout.

**Later:** leverage and "who to root for tonight", exact-tiebreak clinch timing, push notifications, draft-lottery odds, a larger API.

The competitive feature catalog is [playoff-projections-feature-and-technical-reference.md](../../playoff-projections-feature-and-technical-reference.md). It is background only; this plan wins where they differ.

## 2. Launch scope (NFL, target ~Dec 16, 2026, before Week 15)

**In:**

- NFL current-season odds, refreshed daily and after game finals.
- League odds table, seed-probability matrix, team pages with a history chart, a methodology page and a home page.
- 2026 history from Week 1, labeled *reconstructed* for dates before the pipeline went live.
- Clinched / eliminated / controls-own-destiny statuses computed by PlayoffOdds (D50), cross-checked against official markers when the SportsCrunch crawl is ready.

**Not until after launch:** clinching scenarios and NFL postseason resume (both early M4), picker, API/MCP, other leagues, leverage, push, draft, accounts.

## 3. Architecture

```text
SportsCrunch API  (teams, games + scores, per-game probabilities, ratings, official standings)
        │  daily schedule + after game finals
        ▼
Laravel app (DB `podds`)
  sync mirror tables → build SimInput JSON → store gzipped input + sha256 → queue job
        │  spawns Node
        ▼
Node CLI: @playoffodds/engine (simulation) + @playoffodds/standings (rules)
        │  results JSON
        ▼
Laravel writes standings + odds rows → moves the league's current pointer
        ▼
Inertia + Vue site · later: JSON API, MCP, browser picker (same engine in a Web Worker)

SportsCrunch (PHP) ── thin wrapper ──► the same @playoffodds/standings CLI   (D44)
```

- **SportsCrunch** is the data source: schedules, scores, sportsbook-anchored win probabilities for every remaining game, team ratings, and crawled official standings. See [03](03-sportscrunch-integration.md).
- **The standings engine** is one TypeScript package used by the simulator, the browser and, through a PHP wrapper, SportsCrunch. It also computes clinch and elimination. See [04](04-standings-tiebreakers.md) and [features/14](features/14-clinch-magic-elimination.md).
- **The simulation engine** is a pure TypeScript package run as a Node CLI by Laravel queue jobs. Its drift parameters come from PoolCrunch's measurement of historical line movement. See [01](01-simulation-engine.md).
- **Laravel** owns sync, snapshots, publishing and the website. See [02](02-simulation-outputs.md).

## 4. Ground rules

These survive the simplification and apply to all work:

1. **One standings implementation.** Tiebreakers live only in `@playoffodds/standings`. Nothing re-implements them; PHP calls the CLI.
2. **Tiebreakers run inside every simulated season** and are checked against official final standings and seeds.
3. **Pages never call SportsCrunch or run simulations.** They read published local data. If a run fails, the last good snapshot stays up with its real timestamp, and a stale banner appears when it gets old.
4. **Every snapshot is reproducible:** stored input file, seed and engine version.
5. **Probabilities are estimates.** A simulated 100% displays as ">99.9%", never "clinched". "Clinched" and "eliminated" come only from our clinch check, which never claims what it can't prove, or from an official source.
6. **History is honest:** backfilled points are labeled *reconstructed*.
7. **The engines are pure:** no network, database, clock or `Math.random` inside them; seeded PRNG only.

## 5. Repository layout (proposed)

```text
playoffodds/
  app/ routes/ database/ resources/js/   Laravel 13 + Inertia + Vue 3 + TS (D37)
  packages/
    standings/   @playoffodds/standings — rules, tiebreakers, seeding, fixtures
    engine/      @playoffodds/engine    — season + playoff simulation
    cli/         Node entry points (simulate, standings), bundled to single files
  docs/plan/
```

JavaScript workspaces (npm or pnpm, chosen at scaffold time) let the Laravel Vite build import `@playoffodds/engine` for the picker later. Tests: Vitest for the TypeScript packages, Pest for Laravel.

## 6. Milestones

| Milestone | Window (target) | Outcome |
|---|---|---|
| M0 Engine spike | Oct 22 – ~Nov 2 | NFL standings engine passing 2020–2025 golden seeds; simulator with measured drift running on live 2026 data |
| M1 Pipeline | ~Nov 2 – ~Nov 16 | Laravel app syncing SportsCrunch, publishing snapshots on a schedule, 2026 history backfilled |
| Clinch track | ~Nov 2 – ~Dec 4 (parallel) | Clinch/elimination check validated against brute force and 2020–2025 history, wired into snapshots |
| M2 Site | ~Nov 16 – ~Dec 11 | Public pages, history chart, clinch badges, methodology, mobile layout |
| M3 Launch | ~Dec 16 (before Week 15) | Launch checklist done, public |
| M4 Late season | Dec – Jan | Clinching scenarios, NFL postseason resume (by Wild Card), result-coupled drift + picker, JSON API + MCP |
| M5 NBA + NHL | Jan – Mar 2027 | Both leagues live before the stretch runs |
| M6 MLB | by Opening Day 2027 | MLB live |

Details and "done when" checks are in [90](90-build-order.md).

## 7. Document map

| Document | Purpose | Status |
|---|---|---|
| 00 (this file) | Product, architecture, ground rules, milestones | DRAFT v3 |
| [01-simulation-engine.md](01-simulation-engine.md) | Simulation algorithm, inputs/outputs, NFL math | DRAFT v3 |
| [02-simulation-outputs.md](02-simulation-outputs.md) | Database tables, snapshot job, publishing, history | DRAFT v3 |
| [03-sportscrunch-integration.md](03-sportscrunch-integration.md) | What we consume from SportsCrunch and what it must add | DRAFT v3 |
| [04-standings-tiebreakers.md](04-standings-tiebreakers.md) | The single standings engine, rules as code, validation, PHP wrapper | DRAFT v3 |
| [05-agent-and-search-discovery.md](05-agent-and-search-discovery.md) | Crawlable pages, crawler policy, API/MCP for agents | DRAFT v3 |
| [06-cross-cutting-requirements.md](06-cross-cutting-requirements.md) | Launch checklist and hardening backlog | DRAFT v3 |
| [features/10-core-odds-displays.md](features/10-core-odds-displays.md) | League table, seeds, team page, methodology (launch) | DRAFT v3 |
| [features/11-history-timeseries.md](features/11-history-timeseries.md) | History chart and movement (launch) | DRAFT v3 |
| [features/12-interactive-picker.md](features/12-interactive-picker.md) | Picker (M4) | DRAFT v3 |
| [features/13-leverage-rooting.md](features/13-leverage-rooting.md) | Leverage and rooting (later) | DRAFT v3 |
| [features/14-clinch-magic-elimination.md](features/14-clinch-magic-elimination.md) | Clinch/elimination statuses (launch), scenarios (M4), magic numbers (MLB) | DRAFT v3 |
| [features/15-notifications-mobile.md](features/15-notifications-mobile.md) | Mobile/PWA and push (later) | DRAFT v3 |
| [features/16-public-api.md](features/16-public-api.md) | JSON API (M4) and expansion | DRAFT v3 |
| [features/17-draft-order.md](features/17-draft-order.md) | Draft and lottery odds (later) | DRAFT v3 |
| [90-build-order.md](90-build-order.md) | Milestones, tasks and done-when checks | DRAFT v3 |
| [99-decisions-open-questions.md](99-decisions-open-questions.md) | Decision log and open questions | LIVE |
| [playoff-projections-feature-and-technical-reference.md](../../playoff-projections-feature-and-technical-reference.md) | Competitive catalog and generic techniques | REFERENCE |
