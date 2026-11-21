# Features 14 — Clinch, Elimination, Scenarios, and Magic Numbers

**Status: DRAFT v3 (2026-10-21).** Per D50, PlayoffOdds computes these itself. NFL clinch/elimination statuses ship at launch (M2/M3); this week's clinching scenarios are the first M4 item; MLB magic numbers ship with MLB (M6); NBA and NHL with their onboarding (M5).

## 1. Why this is separate from the simulation

A simulation estimates. 100k simulated seasons can miss the one rare path where a team falls out, so a simulated 100% never means clinched. A clinch is a statement about **every** way the remaining games could go, under the real tiebreakers. That needs a search, not sampling.

The code lives in `@playoffodds/standings` (`computeClinch`, [04](../04-standings-tiebreakers.md) §10). It reuses the same rules modules and is available to SportsCrunch through the same CLI.

## 2. Targets and statuses

**Targets** come from each league's rules module. NFL: playoff spot, division title, top seed (the only bye). Later, other seeds, for example "clinched at least the 4 seed".

**Statuses:**

| Status | Meaning |
|---|---|
| `clinched` | No legal completion of the season keeps the team out of the target |
| `eliminated` | No legal completion puts the team in the target |
| `alive` | Neither proven (yet) |

Plus **controls its own destiny**: if the team wins every remaining game, it clinches regardless of other results. This uses the same check with the team's games fixed as wins (ties count as not winning).

## 3. Method (launch version)

For team **T** and target **X**:

- **Clinched?** Search for any assignment of remaining results (NFL: home win, away win or tie for every game) in which T misses X. If none exists, T has clinched X.
- **Eliminated?** Search for any assignment in which T reaches X. If none exists, T is eliminated from X.

### Conservative tiebreaks (never wrong, sometimes late)

Evaluating full tiebreakers inside the search is the hard part, because steps like strength of victory depend on games between other teams. The launch version avoids that:

- **Proving a clinch:** any tie in winning percentage involving T is resolved *against* T. Ties among other teams are resolved however hurts T most. The search plays the adversary and gets every close call.
- **Proving elimination:** every tie involving T is resolved *in T's favor*.
- **Division winners** take their playoff spots regardless of record. The search must respect that a weaker team can take a spot by winning its division.

Assuming the worst can only make the check *stricter* than reality, so a `clinched` or `eliminated` result is always true. The cost is lag: when a team has clinched only because it holds a tiebreaker, the league may announce it a week before we prove it. The official marker crawled by SportsCrunch fills that gap and is labeled as official.

### Solver

The search space is far too large to enumerate: about 80 remaining NFL games in Week 14 means 3^80 combinations. Two candidate approaches, to be chosen in the spike:

- **Integer program.** Binary variables per game outcome, team win totals as sums, and constraints expressing "T finishes outside the target" (including division-winner rules). Solve with a mature solver compiled to WebAssembly (for example HiGHS) so it runs inside the Node CLI. Elimination problems of this kind are known to solve quickly in practice.
- **Custom branch-and-bound** over games involving teams in contention, with win-total bounds for pruning.

Either way, cap each problem's time. A timeout returns `alive` (no claim) and is logged.

**Decided by the spike (2026-11-21, D57): branch-and-bound.**
- **Dominance first.** Both questions are monotone in the other teams' points. A clinch search therefore has the team lose all its remaining games and every contender beat every non-contender. An elimination search does the reverse. Only games between two contenders branch.
- **Contenders** are conference teams (division rivals, for the division title) that can still finish level with the team or better (clinch search), or strictly better (elimination search).
- **The goal** counts the teams that rank against the team, division by division. A clinch fails if a rival is level or better and at least three non-division-winners are; the division title and top seed are simpler. Code: `packages/standings/src/clinch/`. Benchmark: `scripts/clinch-spike.ts`.
- **Spike results:** 6,912 real problems with no disagreements against the HiGHS integer program. The median problem had 2 branching games and the largest 34. Branch-and-bound took at most 8 ms per problem.
- **Correctness checks** (`packages/standings/test/clinch.test.ts`):
  - On random seasons, all three searches match an unreduced brute force.
  - Random completions run through the full NFL procedure never contradict a claim.
  - Replaying 2020–2025 week by week, every claim holds in the final standings.

### Screen with the simulation

Only teams the simulation puts at or very near 0% or 100% for a target need a search. If simulated worlds already show both outcomes, the team is `alive`. This keeps a snapshot to a handful of solver calls. **Not needed at launch (2026-11-21):** with the chosen search, all 32 teams × 3 targets take under 20 ms, so every snapshot checks everything.

## 4. Validation

- **Exhaustive cross-check:** on small synthetic leagues and on the last week or two of real seasons (where full enumeration is feasible), compare against brute force over every outcome combination. There must be zero cases where we claim clinched or eliminated and brute force disagrees.
- **History:** replay NFL 2020–2025 week by week from SportsCrunch results.
  - Every computed clinch must hold in the actual final standings.
  - Where we have official announcement dates, every computed status must fall on or after them. Record our lag in days.
  - Reproducing a known official clinch weeks early would mean a bug.
- **Measured 2026-11-21** against official clinch dates for 2020–2025 from NFL.com's standings API, checked against 31 of the NFL's weekly Playoff Scenarios releases. The dates are in `packages/standings/fixtures/nfl/clinch-official/2020-2025.json`; the comparison is `scripts/clinch-lag.ts`.
  - We are never ahead of the league, and never claim what it doesn't.
  - Of 252 official clinches and eliminations, 178 fall in the same week, 40 a week later and 7 two weeks later. 27 are never proven, because they were decided by tiebreakers, mostly on the last weekend.
  - By type, the count in the same week: playoff spot 59 of 84, division title 34 of 48, top seed 7 of 12, eliminated 78 of 108.
  - A test keeps "never ahead" and the 178 baseline. The late and never-proven ones are what exact tiebreaks in the search (§8) would recover.
- **Live:** compare with the official markers each snapshot. If we show clinched and the official source never does, investigate as a bug. Official-only clinches are expected (lag).

## 5. Clinching scenarios (M4, first item after launch)

The text fans look for each week: "Bills clinch a playoff spot with: a win; or a tie plus a Jaguars loss; or a Jaguars loss plus a Colts loss."

1. Pick this week's games that can matter: games involving T or teams that can still finish around T. The simulation's conditional counts help rank them.
2. For each combination of those games' results (3 outcomes each for NFL), run the clinch check with this week fixed and later weeks free.
3. Keep the combinations that clinch, and simplify them into a short list of readable conditions.
4. Cap the number of games considered. If the list can't be completed in time, say "scenarios too complex to list; X% chance to clinch this week" rather than show a partial list as complete.

Show scenarios on the team page and on a league "clinching scenarios" page. Picker links can encode a scenario.

## 6. Magic numbers (MLB, M6)

**Per-rival magic number** for team T against rival R: `M = G + 1 − W_T − L_R`, where G is the season length. The `+1` drops to `0` once T holds the tiebreaker over R regardless of remaining games (MLB has broken ties by formula since 2022).

- **Division:** the magic number is the one against the strongest remaining rival.
- **Wild card:** per-rival numbers against the teams that can still pass T. Show a single number only when it is provably sufficient; otherwise show the per-rival list.
- **Elimination (tragic) numbers:** the mirror image.

Cross-check against the general clinch check: magic number 0 must coincide with `clinched`. NFL per-rival magic numbers can reuse this later, but the NFL audience mostly uses scenarios.

## 7. Labels

| Label | Source |
|---|---|
| **Clinched playoff spot** / **Eliminated** | Our check (`clinch_statuses`), with a details link |
| **Clinched (official)** | Official marker where our check hasn't proven it yet |
| **Controls own destiny** | Our check |
| `>99.9%` | Probability only; never shown as clinched |

The API returns probability and clinch status as separate fields.

## 8. Later

- **Exact tiebreaks inside the search,** to remove the lag and match or beat official announcements: head-to-head, division and conference records first, then strength of victory or schedule as needed.
- **NBA:** including the play-in tier, for example "clinched at least a play-in spot".
- **NHL:** points with the loser point; needs regulation/OT end types.
- **NFL seed-level clinches**, for example "clinched at least the 5 seed".
