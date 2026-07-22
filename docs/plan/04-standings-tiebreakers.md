# 04 — Standings & Tiebreakers

**Status: DRAFT v2.1 (2026-07-16) — rewritten per D15 (no legacy code; era-versioned official rules), then updated with verified findings from all four leagues' official published procedures (Appendix A). Pending owner review.**

Per-league standings computation and tiebreaker resolution. Runs in two modes from **one code path**:

- **In-sim mode:** called at the end of every simulated season world (and mid-world by clinch screening) — must be fast (§7).
- **Deterministic mode:** called on real results only — powers clinch/magic-number/scenario enumeration (features/14) and live standings displays, with human-readable explanation traces.

This is the credibility moat (reference doc §5): tiebreakers run **inside** each simulation, never post-hoc, and they are **verified by replaying history** (§6). Two governing decisions:

- **D15: the legacy OLD_playoffodds implementation is not used** — not as code, not as a reference. It is a decade old and the leagues have changed steps throughout the ladders since. Every rule is sourced fresh from official league publications.
- **Rules are era-versioned data, not code** (§2). Each league gets a set of rule definitions with applicability year ranges, in paired text + machine-encoded form. Ladders change over time; our backfilled seasons must be judged by the rules *of their era*.

---

## 1. Interface (consumed by engine, doc 01 §9)

```ts
interface StandingsModule<A extends SeasonAccumulators> {
  emptyAccumulators(teams: TeamInput[], schedule: GameInput[], rules: RuleSet): A;
  applyResult(acc: A, g: GameResult): void;          // incremental — same call for real and simulated games
  seed(acc: A, opts?: { trace?: boolean }): SeedResult;
}

interface SeedResult {
  conferences: ConferenceSeeding[];    // ordered seeds incl. non-playoff order (draft features need the bottom too)
  divisionWinners: TeamId[];
  trace?: TieTrace[];                  // deterministic mode: which rule broke each tie, between whom
}
```

- `SeasonAccumulators` is league-specific, flat, and copyable (each sim world clones the played-games baseline and extends it — never recompute from the game list inside a sim).
- `trace` is only populated in deterministic mode (allocation-free hot path in-sim). Traces cite the rule-set step that resolved each tie ("common games, per NFL 2024 procedure §…") — feeding the UI and debugging.

## 2. Rules-as-data architecture (the core of this doc)

### 2.1 Shape

```
packages/engine/rules/
  nfl/
    2021-present.md      ← text version: the official procedure, quoted/paraphrased,
    2021-present.json        with source URL + retrieval date + change notes vs prior era
    2010-2020.md/.json   ← historical eras as far back as backfill requires
  mlb/  2022-present.*   ← post-tiebreaker-game era
        2012-2021.*      ← tie → game-163 era (see §2.4)
  nba/  ...
  nhl/  2019-present.*   ← RW-first era
        2010-2018.*      ← pre-RW era
```

- **Text version (`.md`)** — human-readable, faithful to the official publication, citing source URL and retrieval date. Rendered on the transparency page (features/10): "here are the exact rules we apply, per season." Also the review artifact: the owner (or an agent) can diff a `.md` against the league's page without reading code.
- **Encoded version (`.json`)** — the same ladder as data: an ordered list of **step primitive** references with parameters. Loaded by `getRuleSet(league, seasonYear)`; every part of the module that could plausibly change (ladders, multi-club variants, primary metric, points system) lives here, not in code.

```jsonc
// rules/nfl/2021-present.json (illustrative)
{
  "league": "nfl", "effectiveFrom": 2021, "effectiveTo": null,
  "source": { "url": "https://…/nfl-tiebreaking-procedures", "retrieved": "…" },
  "primary": "winPct",  // ties count 0.5
  "divisionLadder":  ["h2h", "divisionRecord", {"step": "commonGames", "minGames": 4}, "conferenceRecord",
                      "strengthOfVictory", "strengthOfSchedule", {"step": "pointsRank", "scope": "conference"},
                      {"step": "pointsRank", "scope": "league"}, {"step": "netPoints", "scope": "common"},
                      {"step": "netPoints", "scope": "all"}, "netTouchdowns", "coinFlip"],
  "wildcardLadder":  ["…"],
  "multiClub": { "h2h": "sweep", "divisionReduction": true, "restartOnElimination": true }
}
```

### 2.2 Step primitive library

The only hand-written tiebreak logic is a library of parameterized primitives, each a pure function over accumulators (list verified against all four leagues' current official procedures, Appendix A): `h2h` (pct in games among tied clubs), `h2hSweep` (one club beat — or lost to — each of the others), `groupPooledRecord` (combined pct vs. the other tied clubs pooled — MLB multi-club), `h2hPoints(oddGameExclusion)` (NHL two-club), `h2hPointsPct(oddGameExclusion)` (NHL multi-club — *percentage of available* points, not raw points), `divisionRecord`, `conferenceRecord`, `intraleagueRecord`, `intradivisionRecord`, `commonGames(min)`, `strengthOfVictory`, `strengthOfSchedule`, `pointsRank(scope)` (shared ranks awarded to all tied holders as if held solely), `netPoints(scope)`, `netTouchdowns`, `winsTotal`, `regulationWins`, `regulationOvertimeWins`, `goalDifferential` / `goalsFor` (standings definition: SO win = +1 GF, SO loss = +1 GA), `lastHalfIntraleagueWalk(anchor, excludeIntraGroup)` (MLB — anchored at the **All-Star break**, not the schedule midpoint; multi-club walks skip games among the tied clubs), `divisionWinnerPrecedence`, `recordVsEligible(scope)` (NBA — eligible set defined by *record*: the ten best records per conference **including every team tied for the tenth-best**, computable before any tie resolves), `gamesPlayedPointsPct` (NHL official step 1 — a no-op in final standings), `randomDraw` (alias `coinFlip`). Each primitive declares what accumulator fields it needs, so a rule set implies its accumulator layout (§3) and unused accumulators are never maintained.

Beyond comparison primitives, rule sets declare **procedural machinery** (verified variants in Appendix A): multi-club restart targets (NFL restarts differ between division and wild-card ladders), one-club-advances-then-others-revert (NFL), division reduction with original-seeding preservation (NFL wild card), division-winner ties broken first and quarantined (NBA — the result feeds only the division-winner flag, never seeding), partial-break restart with ladder switch to the two-club variant (NBA/MLB), and recursion of sub-ties into the smaller-group procedures (MLB).

A rules change is therefore: research → new `.md` + `.json` era files → new synthetic fixtures (§6.2) → harness green. No engine code changes unless a genuinely novel primitive appears.

### 2.3 Sourcing process

- **Current eras:** pull from the leagues' official published procedures (NFL.com tiebreaking procedures page; MLB's official tiebreaker rules; NBA official standings/tiebreaker procedures; NHL Rule/bylaw on standings order). Implementation step, not planning step: the `.md` files are written from the live pages at build time, never from memory or third-party summaries.
- **Historical eras** (as deep as backfill, Q8): archived versions of the same pages (Wayback Machine) and league press releases documenting changes. Each era file's change-note lists what differs from the adjacent era.
- Era boundaries, **verified against official sources 2026-07-16** (Appendix A): **NHL** — 2010-11 ROW introduced (pre-2010: total wins first); 2019-20 RW added ahead of ROW, total-wins step and goals-for step added; 2019-20 COVID season qualified playoff teams by points percentage (Return to Play), while 2020-21 completed all 56 games and never invoked its points-pct contingency (final standings normal — no special era file needed beyond the format anomaly). **MLB** — 2022 eliminated tiebreaker games (§2.4); pre-2022 used game-163 with club A/B/C/D scheduling designations. **NBA** — Sept 8, 2015: head-to-head moved above division-winner status (old system seeded division winners higher); 2020-21: eligibility set widened from top-8 to top-10 with the play-in (wording change only, ladder unchanged). **NFL** — comparison ladder stable since the 2002 realignment (SOV-before-SOS ordering dates to 2002); the 2020 expansion added a third wild card without altering the ladder.
- **Non-standard seasons** (2020 NBA bubble, 2020 NHL 24-team return, 2020 COVID-MLB) are marked `nonStandard: true` in their era files and excluded from golden replay (§6.1) rather than special-cased.

### 2.4 Era behaviors, not just era ladders

Some eras differ in *behavior*, not just step order — the rule set can therefore declare resolution behaviors the engine must honor:

- **MLB pre-2022: ties for division titles / wild cards were *played out* (game 163).** For backfilled sims of those seasons to be authentic, the rule set declares `tieResolution: "playoff-game"` for the affected tie types, and the engine simulates the extra game(s) (priced like any playoff game, doc 01 §8). Deterministic replay of those seasons consumes the actual game-163 results already present in the data. This is an engine-visible rule-set capability — spec'd here, implemented behind the `RuleSet` interface so post-2022 sims never pay for it.
- NHL points-percentage primary metric (COVID seasons) is likewise a rule-set field (`primary`), not code.

## 3. Accumulator contents (superset; per league, per rule set, only what its ladder needs)

Per team: W/L/T (or W/L/OTL), division and conference splits, PF/PA (margin-first model supplies simulated margins, D12), NHL: points/RW/ROW/GD/GF, MLB: intradivision, interdivision, ordered intraleague game logs (for the last-half backward walk).
Pairwise: H2H results matrix `(nTeams × nTeams)`.
Static per snapshot (schedule-derived, outcome-independent): opponent lists, common-opponent sets per pair, membership maps, MLB game-half classifications.

**Precompute/incremental rule (performance-critical):** everything derivable from the *schedule* is computed once per snapshot; everything derivable from *results* is accumulated incrementally — baseline from played games once per snapshot, extended per sim world. Nothing is rebuilt from the raw game list inside a sim.

## 4. Resolution algorithm (shared skeleton)

1. Primary sort per grouping (rule set's `primary`: win pct, or NHL points/points-pct) — the vast majority of positions resolve here.
2. Detect tie groups; resolve each through the era ladder:
   - Steps apply in order; a step fully orders the group, splits it into subgroups (re-enter ladder **from step 1** per subgroup — the restart rule, confirmed per league in each era's `.md`), or passes.
   - Multi-club groups use the rule set's multi-club variants; when eliminations reduce a group to two, restart with the two-club ladder.
   - NFL-style **division reduction** for cross-division conference ties (one club per division survives into the conference ladder; eliminated clubs re-pool for the next seed) is a declared multi-club behavior, driven by the rule set.
3. Final fallback everywhere: seeded coin flip (from the sim's RNG stream; deterministic mode labels it "unresolved — coin flip" in the trace rather than silently picking).

## 5. League module notes

The detailed current-era ladders live in the `rules/` files, authored from official sources during implementation (§2.3) — **deliberately not duplicated here**, so this doc can't drift from the sourced truth. (Appendix A carries the verified 2026-07-16 research summaries that seed those files.) What belongs here is the league-specific *machinery*, now verified:

- **NFL:** division reduction (wild-card 3+ step 1) with **original-division-seeding preservation** across subsequent applications; one club advances per step application, all others revert; restart targets differ by ladder (4→3 elimination restarts at step 1 of the three-club *division* format but step 2 of the three-club *wild-card* format — the reduction stays applied); H2H sweep applies **only** to the wild-card 3+ ladder (division 3+ head-to-head is plain pct among the tied clubs); common-games minimum of four applies **only** to wild-card ladders. **Division winners are seeded 1–4 using the wild-card tiebreakers** (home-field priority rule) — seeding code must cross-apply ladders. Net touchdowns exists in every ladder; we don't simulate TDs — in-sim it passes through (reach counter logged, §6.4); deterministic mode computes it only if upstream box data exposes it (doc 03 nice-to-have), else flags in trace. NFL is also the only league whose official procedure ends in a genuine **coin toss**.
- **MLB:** ladder is H2H → intradivision → **intraleague** → last-half intraleague (anchored at the **All-Star break** — a per-season data need, doc 03) → backward walk one intraleague game at a time. Multi-club: pairwise-sweep test, then pooled combined record among tied clubs, with sub-ties recursing into the two-/three-club procedures and walks excluding games among the tied clubs; ordered per-team intraleague game logs required in the accumulator. **No random step exists in the official procedure** ("repeated until the tie is resolved") — the engine's `randomDraw` terminal is a documented beyond-official fallback (reach counter must stay at ~zero). Pre-2022 eras: game-163 behavior (§2.4).
- **NHL:** five-outcome model (D13) feeds points/RW/ROW/W directly; sampled goal margins feed DIFF/GF using the **standings definition** (SO win = +1 GF, SO loss = +1 GA — conveniently identical to our ±1 extra-time margin convention). Two-club H2H points carries the odd-game exclusion; multi-club uses **percentage of available points** among the tied group. Official step 1 (fewer games played / points pct) is encoded but is a no-op in final standings. The ladder officially ends at goals-for — no random step (same beyond-official fallback note as MLB). Era footnote: a 2018-announced tiebreaking *game* for the final berth only (never used, absent from the current published procedure) is recorded in the era file as a footnote, not implemented.
- **NBA:** division-winner ties are broken **first and quarantined** (results feed only the division-winner flag, never seeding). The "record vs playoff-eligible" circularity is **resolved by the official text itself**: eligibility is defined by *record* — teams with the ten best records per conference *including every team tied for one of those records*, regardless of how the tie ultimately resolves. So the eligible set is computable directly from final records before any tie-breaking; no bootstrapping pass needed (this supersedes the earlier two-pass proposal). The multi-team ladder differs structurally from the two-team ladder: division winner comes **first**, and there is **no opposite-conference step**. Partial breaks restart from criterion 1 with the surviving subgroup, switching to the two-team ladder when exactly two remain. Official terminal step: **random drawing**.

## 6. Verification harness (the marketing claim)

**6.1 Golden-season replay.** For ≥5 completed seasons per league (spanning era boundaries where possible): pull final regular-season results from SportsCrunch → run `seed()` deterministically **under that season's era rule set** → assert exact match against curated fixtures of the official final seeding (per league-season JSON: seed order per conference + division winners, sourced from leagues' published final standings and actual playoff brackets). Every divergence is a bug, a wrong era boundary, or a mis-sourced rule — all three are exactly what this harness exists to catch. `nonStandard` seasons excluded.

**6.2 Synthetic tie fixtures.** Golden replay rarely exercises deep ladder steps (real seasons break ties early). Per rule set, constructed fixtures force resolution at each step — including the nasty NFL cases (3-club intra-division tie; multi-division wild-card tie requiring reduction; reduction-loser winning the next seed), MLB's backward walk, NHL's odd-game exclusion, NBA's two-pass eligibility. Fixtures are part of each era's definition-of-done.

**6.3 Rules-source ritual.** Preseason checklist (recurring, per league): re-fetch the official procedure page, diff against the current era's `.md`, and either confirm (bump retrieval date) or cut a new era (new files + fixtures). The `.md`/`.json` pairing makes the diff mechanical.

**6.4 Reach-frequency counters.** In-sim, count how often each ladder step decides a tie (per league per sim batch). Published on the transparency page (features/10) — substantiates "we implement every step" and validates the approximated steps (net TDs, NHL GF) as immaterial.

## 7. Performance

Tiebreakers, not game sims, are the bottleneck (reference doc §5). Budget: tie resolution averaging < 50µs per sim world (profiled per league; NFL worst-case). Levers: the §3 precompute/incremental rule; lazy evaluation (primitives compute only when a tie group actually reaches them); rule-set-implied accumulator pruning (§2.2); tie groups are rare in most sim worlds — the primary sort short-circuits.

## 8. PROPOSED resolutions (owner review requested)

| Item | Proposal | Rationale |
|---|---|---|
| Rules provenance (supersedes the "port" plan) | **Era-versioned rules-as-data** (§2): text+encoded pairs per league per era, sourced from official publications at implementation time, selected by season year; legacy code unused (D15) | Ladders have changed at every step over time; sourcing must be from the leagues, versioned, and diffable |
| NBA vs-playoff-eligible circularity | **Resolved by the official text** (verified 2026-07-16): eligibility is record-defined (top-10 records incl. all teams tied for them), computable before tie resolution — the earlier two-pass proposal is withdrawn as unnecessary | Simpler and official, not an interpretation |
| NHL GD/GF steps | Resolved by D12/D13 mechanics + reach counters; DIFF/GF use the standings definition (SO = ±1 goal) | No extra machinery; approximation is measurable |
| MLB pre-2022 ties | Rule-set-declared `tieResolution: "playoff-game"`; engine simulates game 163 in backfilled eras | Authentic backfill; zero cost to modern-era sims |
| Beyond-official random fallback | MLB and NHL official procedures have **no random terminal step**; the engine's `randomDraw` fallback exists there only as a beyond-official safety net whose reach counter must stay ~zero (and is disclosed on the transparency page) | Sims must always terminate; honesty about the one step we add |

Open (tracked here): how deep era research goes = backfill depth (Q8); whether upstream box data can expose net touchdowns for NFL deterministic mode (doc 03 nice-to-have — only exposure of data ESPN already provides, no new crawl); MLB All-Star break date per season as a bundle input (doc 03); NFL draft-order tiebreakers are a **separate official procedure** (reverse standings → opponents' aggregate win pct → divisional/conference ladders, with round-to-round rotation) — needed by features/17, not by seeding.

## 9. Dependencies & authoring order

- Consumed by doc 01 §9 (in-sim) and features/14 (deterministic + traces). The game-163 era behavior (§2.4) adds a small engine-side capability to doc 01 §8's bracket layer.
- Authoring order per D2: **NFL and MLB current-era rule sets first** (launch + dev sports, Phase 1), NBA/NHL before Phase 5; historical eras follow backfill depth (Q8).

---

## Appendix A — Verified research notes (fetched from official sources 2026-07-16)

Summaries of the four-league verification pass. These seed the first era `.md` files (which will still be authored from fresh fetches at implementation time per §2.3 — this appendix is planning provenance, not the rule source).

### A.1 NFL — [nfl.com/standings/tie-breaking-procedures](https://www.nfl.com/standings/tie-breaking-procedures)
Division (2 clubs): H2H → division record → common games (no minimum) → conference record → SOV → SOS → combined points-rank (conference) → combined points-rank (all teams) → net points common → net points all → net TDs → coin toss. Division 3+: same ladder; H2H = pct **among** clubs (no sweep). Wild card (2): H2H if applicable → conference → common games **min 4** → SOV → SOS → points-ranks → net points **conference** → net points all → net TDs → coin toss. Wild card 3+: step 1 = division reduction (one club per division; original division seeding preserved for later applications) → H2H **sweep** → as two-club from conference on. Restarts: to step 1 of the smaller format — except wild-card 3+ restarts at its step 2. One club advances per application; the rest revert. Home-field priority among division winners uses **wild-card** tiebreakers. Ties count as half-win/half-loss. Points-rank: tied teams each awarded the rank as if held solely. Ladder stable since 2002 realignment; 2020 added the third wild card only. Note: `operations.nfl.com`'s old tiebreaker URL is now a content-less shell — nfl.com is the live source. A separate official **draft-order** tiebreaking procedure exists (features/17).

### A.2 MLB — [mlb.com/news/mlb-playoff-tiebreaker-rules](https://www.mlb.com/news/mlb-playoff-tiebreaker-rules) (updated Sept 2025; no 2026 changes found)
One ladder for every tie type (division, wild card, seeding): H2H → intradivision → **intraleague** → last-half intraleague (last half = **after the All-Star break**, explicitly not the schedule midpoint) → walk backward one intraleague game at a time until resolved. **No random step exists.** 3-club: if identical records among each other → group intradivision → intraleague → last-half → walk (excluding games among tied clubs); else pairwise sweep ("better record against both") wins, then pooled combined pct among tied clubs, sub-ties recursing into the 2-club rules. 4-club ladder published analogously. Mixed division+WC 3-way tie: resolve division first, survivors use 2-club rules. Effective 2022 (postseason expansion killed game 163); pre-2022 era: on-field tiebreaker games with A/B/C/D designations. MLB has no official glossary entry — the annually refreshed news explainer is the canonical source.

### A.3 NHL — [nhl.com/info/standings-info/tie-breaking-procedure](https://www.nhl.com/info/standings-info/tie-breaking-procedure)
For clubs tied in points: (1) fewer games played i.e. points pct (no-op at season end) → (2) RW → (3) ROW → (4) total wins → (5) points in games among tied clubs, with odd-game exclusion (first game in the city with the extra game); **3+ clubs: percentage of available points** among the group → (6) goal differential → (7) goals for. DIFF/GF include shootout-awarded goals (SO win = +1 GF, SO loss = +1 GA). No random step. Era history: 2010-11 ROW introduced (prior: total wins first); 2019-20 added RW ahead of ROW, plus total-wins and GF steps; 2019-20 COVID qualification by points pct (Return to Play); 2020-21's points-pct contingency never invoked (all 56 games completed). Footnote: April 2018 league announcement of a tiebreaking *game* for the final berth only (home ice by weighted draw) — never used, absent from the current procedure page; era-file footnote only.

### A.4 NBA — [nba.com/standings](https://www.nba.com/standings) ("Play-In and Playoff Tie-Break Procedures", Paragraph L) + [official PDF](https://ak-static-int.nba.com/wp-content/uploads/sites/2/2017/06/NBA_Tiebreaker_Procedures.pdf) + [Sept 8, 2015 release](https://pr.nba.com/nba-playoff-seeding-changes/)
Two-team: H2H → division winner (applies across divisions) → division record (same division only) → conference record → vs postseason-eligible own conference → vs postseason-eligible opposite conference → point differential → **random drawing**. Multi-team: **division winner first** → pct among tied → division record (only if all same division) → conference record → vs eligible own conference → point differential → random drawing (**no opposite-conference step**). "Eligible" = the ten best records per conference **including teams tied for one of them** — record-defined, computable before ties resolve (kills the circularity). Guidelines: division-winner ties broken first, result quarantined to the division-winner flag; partial breaks restart at criterion 1 with the survivors, switching to the two-team ladder at two. Last structural change Sept 2015 (H2H moved above division winner); 2020-21 widened eligibility 8→10 for the play-in.
