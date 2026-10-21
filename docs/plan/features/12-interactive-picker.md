# Features 12 — Interactive Picker

**Status: DRAFT v3 (2026-10-21).** M4, after clinching scenarios, postseason resume and result-coupled drift. Aim for NFL Weeks 17–18; otherwise it debuts for the NFL playoffs and NBA/NHL. The first version runs entirely in the browser (D49). Results are simulation estimates, never described as exact.

Users pick winners of upcoming games and see the playoff odds recalculate as probabilities, not just a deterministic bracket. This is the product's wedge: almost no one fuses a picker with live simulation.

## 1. How it works

1. The page loads the current snapshot's `SimInput`, the same gzipped file the server simulated ([02](../02-simulation-outputs.md) §3). It is served at a cacheable URL keyed by snapshot ID. The file holds team IDs, games, win probabilities and the matchup matrix, and nothing secret.
2. A Web Worker runs `@playoffodds/engine` with the user's picks as forced outcomes (`pins`, [01](../01-simulation-engine.md) §9).
3. It shows a first result after about 2k sims, then keeps refining in the background (to 5k or 10k), updating the numbers quietly. The details panel shows the simulation count.
4. The baseline column shows current odds from the server snapshot, so users see the change each pick makes.

Everything happens inside the same simulated season.

- **Picks affect later games.** With the result-coupled drift built first in M4 ([01](../01-simulation-engine.md) §4), a picked win also nudges that team's later games and playoff matchups, as a real win would move later lines.
- **Picks don't reshuffle anything else.** Because draws are keyed by sim, purpose and game, a pick changes only what that result touches. Changes against baseline therefore reflect the pick, not reshuffled randomness.

## 2. Picks, seeds and share links

- **Canonical picks:** a sorted list of `(game_id, outcome)` with outcomes `home` or `away` (NFL `tie` later, if wanted). Game IDs are stable SportsCrunch IDs (D23).
- **URL:** a versioned, compact base64url encoding in a query parameter, for example `/nfl/picker?p=1.<encoded>`. Validate length and count. If a link fails to decode, say so instead of applying part of it.
- **Seed:** a hash of snapshot ID plus canonical picks, so everyone opening the same link against the same snapshot sees the same numbers.
- **Links apply to the current snapshot** (D23). If the snapshot has moved on, the page shows the new `as_of`.

## 3. When games finish

When the current snapshot advances:

- picks for games that ended the way the user picked are dropped, with a small note;
- picks that contradict the actual result are dropped and listed ("Your pick: MIA over BUF — BUF won").

## 4. UI

- Games are grouped by week. Each game has a three-state control (home / away / not picked) and shows its win probability.
- **Quick actions:** "reset", and "pick all favorites" for the week.
- **Results:** the league table with playoffs, division and seed odds next to the baseline. A team focus view shows that team's path.
- The picker is keyboard and touch operable. Number updates don't steal focus or flash.
- A 100% result reads ">99.9%", never "clinched". A later version can run the clinch check on the user's scenario and say "these picks clinch a playoff spot" when proven.

## 5. Performance targets

- First result in under ~200 ms on a mid-range phone.
- Engine bundle plus snapshot input under ~150 KB compressed.
- Worker memory stays modest.

Measure in M4. If phones are too slow, start with fewer sims and say so.

## 6. Later

- **Server refinement:** a larger server-side run for a shared scenario, cached by snapshot plus picks.
- **Faster estimates:** filtering stored per-sim outcomes. This is only valid for a few picks with enough matching sims (D35); otherwise run directly.
- **"What helps my team most" suggestions:** computed from leverage ([features/13](13-leverage-rooting.md)) and applied as one joint scenario, never by adding individual swings.
- **NHL:** regulation-loss and overtime picks once the NHL outcome model exists.
