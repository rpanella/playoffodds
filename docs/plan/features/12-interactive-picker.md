# Features 12 — Interactive Picker and Conditioned Forecasts

**Status: DRAFT v2 (2026-07-22).** Phase 5A; conditional estimates are never described as exact.

Users pin future outcomes and see a coherent forecast under those conditions. Pins modify one simulated world: they still update standings, dynamic team state and later bracket matchups at the correct information-batch boundary.

## 1. Complete immutable client contract

The browser worker receives a snapshot-keyed payload derived from the retained bundle:

- stable team/game IDs and index maps;
- complete remaining regular/postseason game start/overlap batch, teams, neutral/site and anchor semantics/source;
- team ratings/dynamic state and every parameter checksum;
- locally rebuilt standings baseline;
- bracket configuration and resumable `PostseasonState`;
- exact pinned rule payload/schema/checksum; and
- required engine/build/PRNG/binary compatibility.

The worker rejects incompatible/corrupt payloads and offers a refresh. It never fetches SportsCrunch or improvises rules from a version string.

## 2. Three computation paths

### A. Client preview/refinement

On a valid pin change, a Web Worker runs the direct conditioned engine (pinned outcomes are forced) using streams derived from the canonical scenario seed. The first 2k target streams provide a quick estimate; idle work extends additively to the 5k target. These counts and latency budgets remain benchmark-controlled targets.

### B. Server matrix conditional estimate

For a small pin set, the server may filter the retained outcome matrix and recompute aggregates over matching worlds. This is **conditional Monte Carlo**, not exact. It returns branch count, ESS, simulation count, uncertainty/interval and matrix/build lineage.

The configurable policy permits this path only when:

- every pin is represented by the matrix's multi-valued outcome semantics;
- pin count/query cost is within abuse limits;
- joint matching ESS passes the Phase 5A threshold; and
- uncertainty for displayed primary probabilities is within the product threshold.

**PROPOSED prototype threshold:** ESS ≥5,000 and worst-case standard error ≤0.75 percentage point. The measured Phase 5A gate may change it without changing DTO semantics.

### C. Direct conditioned server simulation

If the matrix branch is too thin, unsupported, pruned or fails uncertainty, enqueue/run a direct server simulation with pins forced. Every simulated world satisfies the scenario; no rejection/filter collapse occurs. The run uses a bounded/adaptive count up to the approved server target and returns count/uncertainty/build lineage. Results cache by immutable snapshot ID + canonical pins + engine/rules/parameter checksums.

The request/render process does not run the engine inline. It creates/looks up a bounded job and returns progress/result; admission control protects publication workers.

## 3. Stable seed and canonical pins

Canonical pin encoding includes league, stable game ID, outcome semantic/version (winner/tie/regulation/extra-time where supported), sorted order and encoding version. Unknown, duplicate, contradictory or already-impossible pins are rejected or resolved through §6.

`scenario_seed = stable_hash(snapshot identity + canonical ordered pins + engine seed-domain version)`.

Thus every viewer resolving the same link against the same current snapshot gets the same client/server streams. Because D23 links apply to current by default, a later snapshot intentionally produces a different identity/seed and shows the new `as_of`. Immutable snapshot links may be used for audit/API fetch but are not the default viral scenario behavior.

## 4. Progressive UI state semantics

The state machine is visible enough to prevent numbers silently changing meaning:

| State | Meaning |
|---|---|
| `loading_inputs` | Payload/worker compatibility is being checked; last current odds may remain visibly unconditioned. |
| `preview` | First direct client estimate is available; label “quick estimate” and show simulation count. |
| `refining` | Preview remains stable while additional disjoint streams run; progress is non-blocking. |
| `client_refined` | Client target reached; display count/uncertainty in details. |
| `server_matrix` | Higher-sample conditional-matrix estimate passed ESS/uncertainty gates; never label exact. |
| `server_conditioned` | Direct conditioned server result is authoritative for this scenario estimate; still Monte Carlo with uncertainty. |
| `unavailable/stale` | Payload/build/snapshot/job failed or pointer moved materially; preserve pins and offer refresh/retry. |

Primary UI may use a compact “Quick / refining / updated” indicator. A diagnostics disclosure always exposes snapshot, method, simulations, matching count/ESS, standard error/interval, seed domain and build. Swapping results uses restrained motion, preserves focus and does not announce every intermediate number to screen readers.

Toggling a pin off returns to the deterministic seed for the resulting canonical set; the same snapshot/scenario reproduces earlier streams. It does not claim different methods/counts have zero sampling difference.

## 5. Picker UX

- Slate navigation uses actual league dates/weeks and local game start/state.
- A three-state winner control (home/away/unpicked) is the base. NFL tie and NHL regulation/extra-time classes are offered only when the UI/encoding/model phase explicitly supports them; hidden classes remain simulated.
- Team panel and league table show playoffs/path/seed/round values with the probability-proof honesty formatter.
- “What helps” ordering can use feature 13 conditionals, but multiple favorable pins are recomputed as one joint scenario; swings are never summed.
- Reset/undo and bounded quick actions produce explicit canonical pins.
- No picker result claims a scenario itself mathematically clinches a team until Phase 5E proof runs and returns evidence. A 100% conditioned estimate formats probabilistically.

## 6. Live/current rollover and corrections

On pointer advance:

- Matching pins for now-final games become known state and are removed from the future pin set with an audit note.
- Contradicted pins are marked, excluded and summarized; the user explicitly clears/accepts the new scenario.
- Postponed/canceled/rescheduled/neutral-site corrections use local `game_change_events`; do not silently rebind a game ID to different semantics.
- The new payload includes the advanced `PostseasonState`. Completed postseason games/series are never re-simulated.
- A retracted/corrected snapshot invalidates cached scenario results by snapshot/checksum and links to the correction.

## 7. Share links

Keep D23 URL-only, stable-ID, versioned base64url encoding with strict size/count validation. Decode failures show typed recovery instead of applying partial unknown picks silently. The page states current-snapshot semantics and exact `as_of`.

Scenario share cards are rendered from a result that passed its method/uncertainty gate and include canonical URL, snapshot time and “estimate” language. If direct result is pending, do not publish a falsely precise card from a tiny branch.

## 8. Security, accessibility, performance, and failure

- Limit pin count, URL/body size, decompression, simulation count, jobs/IP/key, global concurrency and cache cardinality; validate game ownership and outcome enum.
- Publication workers have reserved capacity; picker overload receives bounded queue/429 with retry guidance.
- Worker runs off the UI thread with cancellation and memory/time caps. A failed worker/job leaves static current odds usable.
- Controls are keyboard/touch operable with labels, selected state, focus preservation, reduced motion and semantic result updates.
- Initial targets: preview under 200 ms, payload under 100 KB compressed and worker under 50 MB on a representative mid-range mobile device; each is measured and can trigger a documented server-first/deferred-league fallback.

## 9. Phase 5A exit gate

- Same snapshot + canonical pins reproduce stream/result checksums in the supported replay envelope; different viewers resolve the same seed.
- 2k→5k extends without rerunning first streams; state transitions and accessibility tests pass.
- Matrix estimates expose count/ESS/uncertainty and route below-threshold cases to direct conditioned simulation.
- Direct server jobs are idempotent/cacheable, bounded and isolated from publication; overload/failure remains honest.
- Representative NFL/MLB and postseason-in-progress scenarios pass mobile/runtime/payload budgets or approved feature-specific degradation.
- No output/API/UI uses “exact” for filtering/simulation or “clinched” without Phase 5E proof.
