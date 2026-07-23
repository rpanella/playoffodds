# Features 14 — Proof-Safe Clinch, Elimination, Control, and Magic

**Status: DRAFT v2 (2026-07-22).** Phase 5E only. Phase 2/3 store probabilities and official status; they do not claim PlayoffOdds mathematical proof.

## 1. Safety invariant

A positive clinch/elimination/control/magic guarantee is published only when a deterministic solver has proved the quantified statement over every legal remaining outcome under the pinned rules, schedule and postseason state. Monte Carlo screening, record bounds and bounded enumeration are heuristics/candidate reducers—not proof by themselves.

Statuses are explicit:

- `proven`: complete proof with method/version/dependency graph and witness/certificate metadata;
- `disproven`: a valid counterexample world exists;
- `unknown`: timeout, resource limit, missing input or unsupported dependency;
- `not_applicable`: target/procedure has no meaning in this context.

UI/API never converts `unknown` to false/true and never labels probabilistic 100.0% “clinched.” Official league-recognized status is separately labeled `official` with SportsCrunch lineage.

## 2. Targets and quantified questions

Each proof names a league, season, exact snapshot/rules checksum, team, target and quantifier:

- clinched target: no legal completion makes the team fail the target;
- eliminated target: no legal completion makes the team attain the target;
- control: with a declared set of the team's outcomes pinned favorably (for example, win out), no completion of other games makes it fail;
- tonight scenario: a declared combination of current-slate outcomes makes target proof true regardless of later legal outcomes; and
- magic guarantee: a formally defined set/vector of future team/rival outcomes sufficient to guarantee the target.

Targets include qualification, division/path, bye/top seed or a seed threshold only where the pinned artifact/bracket gives them precise semantics.

## 3. Explicit dependency graph

The pinned rule artifact declares dependencies for every primary metric/tiebreak step. The proof builder composes them with schedule/bracket dependencies:

- direct team/rival W/L/T or multi-valued outcomes;
- head-to-head/group/common-opponent records;
- opponent and defeated-opponent future records (NFL SOS/SOV);
- score/margin/touchdown/goal statistics where procedures require them;
- cross-group eligible-team membership or division-winner precedence;
- NHL regulation/extra-time/loser-point classes;
- postseason/play-in results when the target/order depends on them; and
- any rules-authorized draw/random terminal, modeled as nondeterministic adversarial possibilities for guarantee proofs unless official semantics say otherwise.

Record-only pruning is forbidden when transitive dependencies can change a tiebreak. If a dependency type lacks sound solver support, return `unknown/unsupported_dependency`.

## 4. Solver architecture and research gate

Phase 0 researches representative MLB/NFL cases and specifies the dependency IR plus validation corpus. Phase 5E implements one or more proven methods by supported league/target, such as exact dynamic programming, SAT/SMT, MILP, exhaustive branch-and-bound with sound bounds, or a verified hybrid.

For each method document:

- variables/domains, including NFL ties and NHL multi-valued outcomes;
- complete mapping from game worlds to evaluator inputs;
- sound pruning/bounds and proof of search completeness for declared dependencies;
- treatment of scores/statistics with finite domains or symbolic constraints;
- emitted proof/counterexample certificate and independent verification;
- deterministic ordering, cancellation/resource limits and `unknown` behavior; and
- version/capability matrix by league/era/target.

“Searched 2^20 leaves” or “timed out after X” is not exact. A finite exhaustive search is proof only when the legal world space and pruning completeness are established and the run completes.

## 5. Screening and conservative execution

Monte Carlo counterexamples and cheap arithmetic bounds can quickly disprove candidates or prioritize solver work. They may not prove a universal claim unless the bound itself has a documented proof covering the full dependency graph.

Execution policy:

1. Validate exact snapshot/rules/schedule/PostseasonState and dependency support.
2. Use screening to find counterexamples/candidates.
3. Build the complete relevant dependency problem with no unsound record-only exclusions.
4. Run the supported exact solver under bounded operational resources.
5. Independently verify its witness/certificate/result where feasible.
6. Persist `proof_results` with method/version, inputs/checksums, status, dependencies, timing/resources and proof/counterexample artifact.

Timeout, cancellation, missing score domain or unsupported primitive returns `unknown`, keeps the probabilistic display and emits an operational diagnostic—not a user-facing false badge.

## 6. Magic and tragic semantics

Many races have no single rival-independent scalar. The canonical output is therefore a set of minimal sufficient conditions or a per-opponent/scenario vector, for example `{team wins ≥ a, rival R losses ≥ b, rival S regulation losses ≥ c}` under named assumptions.

A scalar “magic number N” may be displayed only if the solver proves that the league/target admits the declared scalar definition and every combination totaling N is sufficient. Otherwise show:

- opponent-specific magic requirements;
- a small set of minimal guarantee scenarios;
- “depends on tiebreak/results” with a link to proof/scenario details; or
- `unknown/not supported`.

Do not compute magic from pessimistic tiebreak assumptions and call it exact unless those assumptions are encoded as the explicit product definition and communicated. Clinch-date distributions remain probabilistic scenario outputs, not proof dates.

## 7. Tonight scenarios

Current-slate enumeration can be a front-end to the same proof solver:

- variables use all legal game outcome classes (NFL tie, NHL regulation/extra-time as required);
- for each candidate current-slate assignment, the solver proves the target over all later outcomes;
- only proven assignments enter Boolean/minimal-condition simplification;
- minimized sentences retain outcome semantics and proof IDs; and
- resource/unsupported cases remain unknown and are omitted with a disclosure, not assumed false.

Picker links encode the proven current-slate conditions, but the picker remains a probabilistic explorer. A notification is sent only after the proof result is current and stale-event checks pass.

## 8. Control-your-destiny

“Win out ⇒ in” pins the subject team's declared remaining outcomes, then universally quantifies every other legal result/statistic dependency. For NFL/NHL, “win” semantics are explicit (tie not win; NHL regulation versus extra-time when the target cares). The solver returns proof or a counterexample/unknown.

“Needs help” is safe only when win-out control is disproven with a counterexample. Unknown is phrased “not yet proven” and may link to rooting estimates without implying the needed help is exhaustive.

## 9. Verification corpus

- Curated official historical clinch/elimination announcements with exact cutoff schedule/results and era rule artifacts.
- Synthetic deep tiebreak/dependency fixtures, including NFL SOV/SOS third-party games and score steps.
- NHL multi-valued and loser-point scenarios; NBA play-in; MLB multi-team/backward-walk as supported.
- Bounded small leagues/problems exhaustively brute-forced independently and compared to the production solver.
- Metamorphic tests: adding a guaranteed favorable result cannot invalidate a proof unless the declared rule dependency explains it; proof certificate re-verification; deterministic replay.
- Negative/timeout/unsupported fixtures proving no false positive leaks through API/UI/notifications.

Official announcement disagreement is investigated as a P1 data/rule/proof issue, but an announcement is not by itself a machine-verifiable proof corpus without exact cutoff inputs.

## 10. Surfaces and language

Core tables/team pages distinguish:

- `Officially clinched` (authoritative official source);
- `Clinched — proven by PlayoffOdds` (Phase 5E proof ID/method link);
- probabilistic `>99.9%` (no proof); and
- `Not yet proven/unknown` when proof cannot complete.

API/MCP returns probability and proof object separately. Proof URLs are immutable and checksum-linked. Accessibility text spells out badge meaning; color/glyph alone is insufficient.

## 11. Phase 5E acceptance and rollback

- Declared league/era/target capability matrix is public; unsupported is explicit.
- Solver agrees with independent exhaustive results on every bounded fixture and has zero false positives across curated official/edge cases.
- Dependency coverage fails closed for unknown rule primitives; NFL SOV/SOS and NHL multi-valued fixtures demonstrate no record-only/binary shortcut.
- Timeout/cancel/resource-limit returns `unknown` across DB/DTO/UI/notification tests.
- Magic output uses scalar only after definition proof; vector/scenario alternatives are usable and accessible.
- Production time/memory/admission limits and certificate retention/replay pass.

Rollback disables PlayoffOdds proof badges/numbers by solver version/league while preserving official status and probabilities. Previously wrong proof output is retracted through an immutable correction event; it is never silently edited.
