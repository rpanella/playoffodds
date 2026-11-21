# 90 — Build Order

**Status: DRAFT v3 (2026-10-21).** Re-planned for a late-2026 NFL launch (D43), now around Dec 16, so that our own clinch statuses can ship at launch (D50). Milestones use "done when" checks instead of formal gates (D45). Dates are targets for solo plus agent-assisted work. When time runs short, cut scope (features, polish), not correctness of tiebreakers or clinch statuses.

**Calendar anchors (approximate):**

| Event | Date |
|---|---|
| NFL Week 14 | ~Dec 10–14 |
| NFL Week 15 | ~Dec 17–21 |
| NFL Week 18 | ~Jan 9–10, 2027 |
| Wild Card weekend | ~Jan 16–18 |
| Super Bowl | mid-February |
| NHL regular season ends | Apr 10, 2027 (84-game season) |
| NBA regular season ends | mid-April |
| MLB Opening Day | late March 2027 |

## M0 — Engine spike (Oct 22 – ~Nov 2)

**PlayoffOdds**

- In this repo, set up JavaScript workspaces with `packages/standings`, `packages/engine` and `packages/cli`, using TypeScript and Vitest. The Laravel app joins the same repo in M1.
- **Standings:**
  - Write `rules/nfl/2020.md` from the official NFL procedure, with citation and retrieval date.
  - Implement the `nfl@2020` module, scenario fixtures, and golden fixtures for 2020–2025 (games exported from SportsCrunch, official seeds with sources).
- **Engine:**
  - The full NFL regular season and playoffs per [01](01-simulation-engine.md).
  - Keyed, counter-based randomness.
  - Port the drift team walk from PoolCrunch's `driftgen.py`, with parameters copied from `line_drift_generator_v2.json`.
  - The measured tie rate.
- **CLI:** `simulate` and `standings` commands, bundled to single files.
- **Spike script:** a throwaway script that pulls the live 2026 NFL season from the SportsCrunch API, builds `SimInput` (matchup odds via the anchor fit if the endpoint isn't ready), runs 100k sims and prints a table.

**SportsCrunch**

- Start the matchup odds endpoint ([03](03-sportscrunch-integration.md) §4). It shipped on 2026-11-20.
- Confirm that `is_projected` (or equivalent) is available for current games.

**Done when:**

- All 2020–2025 golden seeds pass.
- The drift variance curve matches PoolCrunch's artifact.
- 100k sims on the live 2026 season run in about 10 s or less, or there is a plan to get there.
- The odds look sane next to public models (ESPN FPI, NYT).
- With all games final, sim seeds equal deterministic seeds.

## M1 — Pipeline (~Nov 2 – ~Nov 16)

- Scaffold Laravel 13 with the official Vue starter kit (D37), MySQL `podds` and Horizon, after confirming current versions.
  - **Done 2026-11-20** (Horizon not yet):
    - Laravel 13.43, Inertia 3, Vue 3.5, Pest 5, Pint, Larastan, Boost.
    - Vite+ (`vp`) for the front end.
    - No authentication scaffolding, since there are no accounts in v1 (D25).
    - The app sits at the repo root beside `packages/`, sharing one npm workspace.
    - TypeScript is 5.9 for both the app and the packages. `vue-tsc` needs TypeScript's JS API, which TypeScript 7 doesn't ship.
    - `npm run typecheck` checks both (`tsconfig.packages.json` and `tsconfig.json`), and the Vite+ lint and format check covers only the app.
    - Local site: `https://playoffodds.test` (Herd).
    - Queue and cache use the database for now. Horizon needs Redis and `pcntl`, which Windows doesn't have.
- Mirror tables and a SportsCrunch client; scheduled sync. The client fetches `matchup-odds?at=` at the same instant as `historical-odds?at=` (NFL only so far). A consumer test pins the matrix-versus-unlined-game check, skipping teams with week-varying adjustments ([03](03-sportscrunch-integration.md) §4).
- Snapshot job per [02](02-simulation-outputs.md) §3: build input, skip if unchanged, store gzipped input, run the CLI, publish in a transaction, leave current untouched on failure.
- Triggers: daily schedule, webhook or poll after game finals (debounced), and an artisan command for manual runs.
- Backfill the 2026 NFL season from Week 1 as `reconstructed` daily snapshots.
  - **Status 2026-11-20 (local):**
    - Built: the mirror sync, the snapshot pipeline (`snapshot:run`, `snapshot:backfill`, `snapshot:list`) and the daily schedule at 9:00 ET.
    - Backfilled: 73 daily snapshots, Sep 9–Nov 20, 100k sims each, about 2.4 s per run.
    - The skip check compares probabilities with a 0.002 tolerance, because SportsCrunch's projections drift a little every minute (02 §3 step 4).
    - After-finals runs (webhook plus poll) built 2026-11-20.
    - Production deploy on Forge per [docs/deploy/forge.md](../deploy/forge.md), first run planned for the weekend of Nov 21–22.
    - Not yet: Horizon (the plain Redis queue worker covers the weekend test).
- A minimal internal view or artisan command to list snapshots, their diagnostics and failures.
- **SportsCrunch:** the matchup odds endpoint shipped on 2026-11-20 for the NFL. Next is the official standings crawl with clinch markers, which serves as the cross-check for our clinch statuses.

**Done when:**

- The pipeline has run unattended on the server through at least one NFL weekend.
- History exists from Week 1.
- A forced failure leaves current intact.
- Re-running a stored input with its seed reproduces the same numbers.

## Clinch track (~Nov 2 – ~Dec 4, in parallel with M1/M2)

Per [features/14](features/14-clinch-magic-elimination.md) §3–4:

- **Solver choice:** prototype the integer-program approach (WebAssembly solver in Node) against a custom branch-and-bound on real Week 12–14 states, and pick one. **Done 2026-11-21: branch-and-bound (D57).**
- **`computeClinch`** for NFL targets (playoff spot, division, top seed) with conservative tiebreaks, simulation screening, per-problem time caps and controls-own-destiny.
- **Brute-force harness:** exhaustive enumeration for small leagues and the last one or two weeks of real seasons.
- **History replay:** NFL 2020–2025, week by week.
- **Integration:** the `clinch` CLI command; snapshot job writes `clinch_statuses`.
- **Status 2026-11-21:**
  - Built: `computeClinch` (every team and target, plus controls-own-destiny), the `clinch` command, and `clinch_statuses` written by every snapshot.
  - Checked: the brute-force harness (random seasons) and the 2020–2025 replay against final standings.
  - Lag versus official dates measured (features/14 §4): never ahead of the league; 178 of 252 official clinches and eliminations in the same week, 47 one or two weeks later, 27 tiebreaker-only.

**Done when:**

- Zero disagreements with brute force.
- Zero false clinches or eliminations across 2020–2025.
- Lag versus official recorded.
- A snapshot's clinch step fits comfortably inside the snapshot job, on the order of seconds.

## M2 — Site (~Nov 16 – ~Dec 11)

- Decide **O8** (how pages render without JavaScript) at the start. Decided: Inertia SSR (D56).
- **Status 2026-11-21:** the bare-bones wireframe version (D59) is built: `/`, `/nfl`, `/nfl/seeds`, team pages and `/methodology`, server-rendered, with a sitemap and robots.txt. It's private behind basic auth. Design comes after clinching and scenarios.
- Build the pages in [features/10](features/10-core-odds-displays.md) and [features/11](features/11-history-timeseries.md):
  - home page;
  - `/nfl` odds table;
  - `/nfl/seeds`;
  - `/nfl/{team}` with history chart and remaining schedule;
  - `/methodology`.
- Clinch badges from `clinch_statuses`, plus official-only badges where the crawl is ahead of us.
- `as_of` everywhere, a stale banner, and ">99.9%"/"<0.1%" formatting.
- Search basics from [05](05-agent-and-search-discovery.md) §1–2.
- Mobile-first layout.

**Done when:**

- The pages work on a phone.
- The answer sentence and tables appear in the raw HTML.
- Numbers and statuses on the pages match the current snapshot rows.

## M3 — Launch (~Dec 16, before Week 15)

- Complete the launch checklist in [06](06-cross-cutting-requirements.md) §1, including O2.
- Production deploy, domain and CDN.
- A few days of private sharing, then public.

**Done when:** the site is public and the checklist is complete.

## M4 — Late NFL season (Dec – Jan)

In priority order (D49, D50, D51):

1. **Clinching scenarios** ([features/14](features/14-clinch-magic-elimination.md) §5): "clinches with…" on team pages and a league scenarios page. Target Week 16, when they matter most.
2. **NFL postseason:** resume from actual playoff results ([01](01-simulation-engine.md) §7) and show a playoff bracket view. **Must be live by Wild Card weekend.**
3. **Result-coupled drift** ([01](01-simulation-engine.md) §4), then the **picker** ([features/12](features/12-interactive-picker.md)): the engine in a Web Worker, pick winners, shareable URL. Aim for Weeks 17–18 if possible; otherwise it debuts for the NFL playoffs and the NBA/NHL seasons.
4. **JSON API + MCP** ([features/16](features/16-public-api.md), [05](05-agent-and-search-discovery.md) §3); O3 before announcing the API.
5. **Calibration check** from the doc 06 backlog, using 2026 data.

## M5 — NBA and NHL (Jan – Mar 2027)

- **For each league:**
  - re-run PoolCrunch's drift measurement on its line history;
  - rules module, `.md` source and golden seasons ([04](04-standings-tiebreakers.md) §9);
  - clinch targets;
  - league bracket in the engine;
  - mirror and pipeline config;
  - pages.
- **NBA:** play-in, including "clinched at least a play-in spot"; SportsCrunch flags the NBA Cup final.
- **NHL:** six outcome classes; SportsCrunch stores end type; goal-based steps.
- Aim to have both live before the March stretch runs.

## M6 — MLB (by Opening Day 2027)

- MLB drift measurement, rules module and golden seasons (2022+ format).
- Magic and tragic numbers ([features/14](features/14-clinch-magic-elimination.md) §6).
- Performance work for 162-game schedules.
- Check pitcher-aware anchors.

## Anytime after M3

- **SportsCrunch PHP standings wrapper** ([03](03-sportscrunch-integration.md) §7), when SportsCrunch needs standings or clinch statuses; decide O9 first.

## Later

- Exact tiebreaks inside the clinch search ([features/14](features/14-clinch-magic-elimination.md) §8).
- Leverage and rooting ([features/13](features/13-leverage-rooting.md)).
- Push notifications ([features/15](features/15-notifications-mobile.md)).
- Draft and lottery odds ([features/17](features/17-draft-order.md)).
- API expansion ([features/16](features/16-public-api.md) §5).
- Hardening backlog items ([06](06-cross-cutting-requirements.md) §2).
