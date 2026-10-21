# 04 — Standings Engine (one implementation, used everywhere)

**Status: DRAFT v3 (2026-10-21).** Per D44: rules are written once in TypeScript, used by the simulator and the browser, and used by SportsCrunch through a PHP wrapper. Rules come from official league publications, versioned by era (D15). Nothing from OLD_playoffodds is used.

## 1. What it does

Given a league, a season, teams with their alignment for that season, and game results, the engine returns:

- records for each team (overall, division, conference, and anything else the rules use);
- ordering within each division and conference;
- division winners, playoff qualifiers and seeds;
- optionally, a trace explaining each tiebreak ("BUF over MIA: step 2, division record 4-1 vs 3-2").

Its entry points all share the same rules:

```ts
// Deterministic: real results (SportsCrunch, site "if season ended" standings, fixtures).
computeStandings(input: StandingsInput, opts?: { trace?: boolean }): StandingsOutput

// Fast path for simulations: precompute once per run, then evaluate many worlds.
const evaluator = createSimEvaluator(input);
const world = evaluator.newWorld();      // starts from the played-games baseline
world.apply(gameId, outcome);            // simulated results
world.resolve(rng): SeedResult;          // division winners + seeds for this world

// Clinch/elimination (D50): clinched / eliminated / alive per team and target, never wrong.
computeClinch(input: StandingsInput, opts?: { targets?: Target[]; screen?: SimScreen }): ClinchOutput
```

The clinch module lives in this package because it reuses the same rules and is needed by both the site and SportsCrunch. See §10 and [features/14](features/14-clinch-magic-elimination.md).

## 2. Package layout

```text
packages/standings/
  src/core/          records, head-to-head, common opponents, SOV/SOS, multi-team reduction/restart, ranking helpers
  src/leagues/nfl/   era modules (e.g. 2020.ts) + index.ts (season → era selection)
  rules/nfl/         2020.md — cited summary of the official procedure: source URL, retrieval date, what changed vs the prior era
  fixtures/nfl/      small hand-built tie scenarios + golden seasons (inputs and official results)
  src/cli.ts         standings CLI (§8)
```

## 3. Rules as code, versioned by era

Each era module is TypeScript composed from shared primitives. It has an ID, a season range, the playoff format and its tiebreak sequences:

```ts
export const nfl2020: RulesModule = {
  id: 'nfl@2020',
  league: 'nfl',
  seasons: { from: 2020, to: null },          // open-ended until the league changes the procedure
  source: 'rules/nfl/2020.md',
  format: { groups: ['AFC', 'NFC'], divisionWinners: 4, wildCards: 3, byes: 1 },
  division: { twoClub: [headToHead, divisionPct, commonGamesPct(), conferencePct, strengthOfVictory, strengthOfSchedule, /* … */ coinToss],
              multiClub: [/* … */], onReduceToTwo: 'restart-two-club' },
  wildCard: { /* … */ },
};
```

- `selectRules(league, season)` returns exactly one module. Zero or more than one match is an error.
- **Adding an era** means a new module, `.md` and fixtures. Changing an era's behavior after snapshots have used it means bumping the package version. Snapshots record both `rules_id` and `engine_version`.
- **Missing data is explicit.** If a step needs data we don't have (for example net touchdowns, which SportsCrunch doesn't record), the step reports itself as unavailable. It is never silently skipped. See §5.

## 4. NFL (first league)

The summary below is from NFL.com's tie-breaking procedures. **Verify it against the current official text and cite it in `rules/nfl/2020.md` before encoding.**

- **Division, two clubs:** head-to-head; division record; common games; conference record; strength of victory; strength of schedule; combined ranking in points scored and allowed (conference, then all teams); net points in common games; net points in all games; net touchdowns; coin toss.
- **Division, three or more clubs:** same sequence using head-to-head among all tied clubs. When the tie is reduced to two clubs, restart at step 1 of the two-club procedure.
- **Wild card:**
  - Clubs tied from the same division are first broken with the division procedure, keeping only the highest-ranked club from each division.
  - Two clubs: head-to-head if applicable; conference record; common games (minimum four); strength of victory; strength of schedule; points-based steps; coin toss.
  - Three or more clubs: head-to-head *sweep* only; then the same sequence; restart when reduced.
  - Repeat the whole procedure to find each subsequent wild card.
- **Seeding:** division winners are seeds 1–4 (ties among them use the wild-card procedure), wild cards are 5–7.
- **Ties count as half a win and half a loss** in percentages.

**Edge cases for fixtures:**

- 2022: the Bills–Bengals game was canceled, so standings are by win percentage with unequal games played.
- Three-team division ties.
- A wild-card tie involving two clubs from the same division.
- Common-games minimum not met.
- Restart after reduction.

## 5. Unresolved ties, draws and missing data

| Situation | Deterministic (`computeStandings`) | Simulation (`resolve(rng)`) |
|---|---|---|
| Tie reaches coin toss | Return the clubs as **tied/unresolved** with a flag; the site shows "tied" | Seeded random draw (this is what the league would do) |
| Step needs simulated scores (points rankings, net points) | Uses real scores | Seeded draw; count it (D47) |
| Step needs data we don't have (net touchdowns) | Flag unresolved | Seeded draw; count it |

Counts are reported in the simulation diagnostics ([01](01-simulation-engine.md) §5). If score-based draws decide playoff spots or seeds often enough to matter, add a score model.

## 6. Validation

Correctness is checked against official results, not against a second implementation (D44):

1. **Scenario fixtures:** small hand-built cases for every primitive and every procedure path (two-club, multi-club, restart, wild-card division pruning, common-games minimum, ties in percentages).
2. **Golden seasons:** NFL 2020–2025 final division winners and seeds 1–7 for both conferences, from official sources, with the source URL recorded. Inputs come from SportsCrunch's historical games, exported once and committed as fixture JSON. The engine must reproduce every season.
3. **Live check:** each snapshot compares "if season ended" seeds with the official standings crawl when available ([03](03-sportscrunch-integration.md) §3). A mismatch is logged as a warning for investigation, not a publish blocker. Either side can be wrong mid-season.
4. **Simulation consistency:** with every game final, `resolve` must equal `computeStandings` with probability 1.

## 7. Performance (simulation path)

- Precompute once per run: division/conference membership, schedule-derived sets (common opponents, each team's opponents for SOS), and baseline records from final games.
- Per world, apply simulated results to compact arrays and only run tiebreakers for clubs actually tied at a boundary that matters.
- Target: standings plus seeding well inside the NFL budget of 100k worlds in about 10 s total ([01](01-simulation-engine.md) §7). Measure in M0.

## 8. CLI (for SportsCrunch and debugging)

`node standings.mjs standings < input.json > output.json`, and `node standings.mjs clinch < input.json > output.json` for clinch statuses.

- **Input `standings-input/1`:** `league`, `season`, teams with alignment, games with status and scores, and optional `as_of` cutoffs (one or many).
- **Output `standings-output/1`:** `engine_version`, `rules_id`, and for each cutoff the per-team records, ranks, seeds, unresolved flags and an optional trace.

The CLI is bundled into one dependency-free file so SportsCrunch can run it with plain `node` (O9 covers how it gets there).

## 9. Other leagues (M5, M6)

Each league gets its own era modules, `.md` sources and golden seasons before launch. Known structural needs:

- **NBA:** play-in for seeds 7–10 (the bracket is in the simulator; the standings engine supplies seeds 1–10). The NBA Cup championship game doesn't count in standings. Point differential is a late tiebreak step.
- **NHL:** points with the loser point, regulation wins (RW) and regulation-plus-OT wins (ROW), and division-based qualification plus two wild cards per conference. Requires REG/OT/SO end types from SportsCrunch. Goal-based steps need real goals (deterministic) or a draw (simulation).
- **MLB:** since 2022 the format is 6 teams per league with byes for the top two division winners, and ties are broken by formula with no tiebreaker games. Uses a 162-game schedule.

## 10. Clinch and elimination

`computeClinch` answers, for each team and target (playoff spot, division, top seed), whether any legal way the remaining games could go would change the outcome. It returns `clinched`, `eliminated` or `alive`, plus "controls its own destiny".

- **Never wrong, sometimes late.** When a record tie would need a tiebreaker the search doesn't evaluate exactly, the check assumes the worst for the team when proving a clinch and the best when proving elimination. If the league announces first, the official marker fills the gap.
- **Screened by simulation.** Teams whose simulated odds include both making and missing a target are alive without a search; only teams at or near 0% or 100% are checked.
- **Full design:** solver choice, validation, scenarios and magic numbers are in [features/14](features/14-clinch-magic-elimination.md).
