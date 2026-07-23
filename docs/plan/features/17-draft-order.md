# Features 17 — Draft Order and Joint Lottery Simulation

**Status: DRAFT v2 (2026-07-22).** Phase 6; NBA/NHL first, NFL when validated, MLB blocked until all era eligibility restrictions are modeled.

## 1. Modeling invariant

Draft order is part of the same joint simulated season world. For each world:

1. Finish remaining regular/postseason games from the snapshot's known `PostseasonState`.
2. Determine playoff/non-playoff and other eligibility/team state under the validated era procedure.
3. Resolve reverse standings and draft-order tiebreaks using that world's results/statistics.
4. Allocate any tied lottery combinations/positions according to the official era process.
5. Execute sequential without-replacement lottery drawings, applying climb limits, repeat-winner/revenue-sharing/team-state restrictions and other era constraints.
6. Assign remaining picks/order and record the joint slot outcome for all teams.

Full lottery draws are not independent per team. A fixed marginal matrix multiplied by `p_bottom` cannot generally model tied combination splits, shared without-replacement draws, eligibility restrictions or NFL playoff-result-dependent order. `p_bottom` remains a useful display aggregate, not the lottery engine.

Use a deterministic versioned PRNG substream derived from the season-world stream so replay is stable and lottery draws remain coupled to their world.

## 2. Ownership and rule artifacts

Draft/lottery procedures remain PlayoffOdds-owned initially under D30. Each immutable era artifact has cited human documentation, schema/version/checksum, applicability/exceptions, selection rule, procedure graph, eligibility inputs and shared/synthetic/golden fixtures. Expanding the SportsCrunch registry to cover draft rules requires an explicit contract change; do not place draft fields in standings artifacts implicitly.

Corrections create a new artifact/version and new snapshots. The API/UI always names draft-rule lineage separately from standings-rule lineage.

## 3. Required local inputs

| Input | Source/materialization requirement |
|---|---|
| Final/world standings and playoff results | Same engine world, pinned standings artifact and `PostseasonState`; not a marginal summary. |
| Season-team identity/alignment | Local `season_teams`. |
| Draft eligibility/team state | Versioned snapshot input artifact with authoritative source/cutoff and checksum: playoff status, revenue-sharing/market/repeat-lottery or other official restrictions as required. |
| Lottery procedure/combination table | Immutable PlayoffOdds era rule artifact + fixtures. |
| Pick ownership/trades/protections | **Deferred.** v1 labels only the team's own nominal slot; no implied traded-pick accuracy. |

If a required eligibility/team-state input lacks a maintained authoritative source/local model, that league/era module is `unsupported` and no odds publish. A footnote does not cure wrong eligibility.

## 4. League requirements

The implementation research pass verifies current and historical official procedures; this plan does not freeze unverified numeric tables.

- **NBA:** eligible pool after play-in/postseason status, tied combination splitting, sequential top-pick drawings and reverse-order assignment; era changes and any pick-ownership display boundaries.
- **NHL:** eligible pool, number/order of drawings, maximum move, repeat-win/team restrictions and tie handling by era.
- **NFL:** no lottery, but final order depends on playoff advancement/results; strength-of-schedule and official separate draft tiebreak/round-rotation procedure require their own dependency fixtures. Regular-season bottom rank alone is insufficient.
- **MLB:** eligible pool, revenue-sharing/repeat-appearance/team-state restrictions, tied odds/combination allocation, sequential top picks and remaining order. Module remains blocked until all applicable restrictions are sourced, represented and tested.

Non-standard/changed seasons receive explicit artifacts/exceptions or are unsupported, never silently mapped to today's format.

## 5. Outputs and storage

Per snapshot/team aggregates may include:

- probability of each own nominal draft slot;
- expected/median/interval slot and probability of lottery selection where meaningful;
- reverse-standings/final-order distribution; and
- eligibility/restriction probability/status with lineage.

The engine records a versioned per-world draft slot plane or equivalent joint representation when the module runs, with explicit bit width/semantics in the binary manifest. Aggregate checks verify exactly one eligible assignment per slot/world, no duplicate without-replacement winner, every restriction, and probability row/column conservation as applicable.

Lottery simulation parameters, rule/input checksums, PRNG substream version and simulation count are retained in the canonical bundle/result lineage. Compression/storage is benchmarked, not assumed.

## 6. “Season forecast” versus “if season ended today”

- **Season forecast:** complete each simulated season/postseason world, then run that world's draft procedure. This is the primary probabilistic product.
- **If season ended today:** freeze the explicitly labeled current `if_season_ended` standings/eligibility state, then simulate only the applicable lottery/tie procedure. It is a separate mode/input and not mixed with projected final order.
- **Official current draft order:** displayed only if an authoritative official local source/definition exists; unresolved ties/restrictions remain explicit.

Every surface names the mode and exact `as_of`.

## 7. Surfaces

- `/{league}/draft`: accessible team × pick probability table/heatmap, expected slot, mode selector and eligibility/rule warning. Text/table values are primary; color is supplementary.
- Team page module: own nominal slot odds, activated/promoted by product rules but never suggesting ownership if trades are deferred.
- Lottery draw explorer: samples/replays from the selected valid mode/rule and labels it entertainment/one possible draw, not forecast evidence beyond the distribution.
- Draft-leverage extension: only after conditionals include valid joint draft outputs; it remains a conditional estimate with ESS/uncertainty, not a shortcut from current rank.

Share outputs include mode, snapshot, draft-rule version, “own nominal pick” label and canonical URL.

## 8. Validation and calibration

- Procedure fixtures force every drawing, tie split, restriction, move limit and remaining-order branch.
- Golden completed seasons/draws verify eligible pools, published odds/combination allocations and actual order mechanics under the correct era (not statistical replication of one random result).
- Small synthetic lotteries are exhaustively enumerated to compare exact distribution with Monte Carlo within confidence intervals.
- Property tests enforce without-replacement uniqueness, slot/team conservation, eligibility exclusions, order dependencies and deterministic replay.
- NFL fixtures include postseason advancement/order and separate draft tiebreak/rotation cases.
- MLB stays disabled until restriction fixtures and authoritative team-state inputs pass.

## 9. Phase 6 exit and rollback

- Each enabled league/era has immutable cited rule/input artifacts, selection/exception coverage and zero known unsupported restriction.
- Joint-world results differ from and supersede the invalid marginal-matrix approach; API/UI tests prove no independent team draws.
- Runtime/storage/cost fit production capacity without starving primary snapshot publication; module can run as an optional downstream stage.
- `if_season_ended` and projected-season modes remain separate across DB/DTO/UI.
- Accessibility, legal/mark, security and correction/replay gates pass.

Rollback disables the draft module by league/era while core odds continue. A wrong rule/input publishes a linked corrected snapshot/retraction; prior outputs are not edited. Pick trades/protections and unsupported MLB remain explicitly unavailable rather than approximate.
