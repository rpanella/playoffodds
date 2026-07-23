# 99 — Decision Log and Canonical Open Decisions

**Status: LIVE (2026-07-22).** This is the authoritative decision index. It is append-only in spirit: a later decision may narrow or supersede an earlier one, but the earlier entry remains visible.

## Status and supersession convention

- **CONFIRMED / LOCKED** means owner-decided or invariant under a confirmed decision.
- **PROPOSED** is the recommended default but still requires the named verification or owner confirmation.
- **OPEN** requires an owner choice among materially different outcomes. All current opens live in this file.
- **BLOCKED** is reserved for a phase gate that cannot safely pass, not ordinary uncertainty.
- A superseding entry names the earlier stable IDs it changes. Other documents reference `D…` and `O…` IDs and do not maintain duplicate question lists.

## Decisions

| # | Date | Decision | Rationale |
|---|---|---|---|
| D1 | 2026-07-16 | Docs-first: detailed reviewable plan before any code | Owner directive; docs must be executable by LLM agents |
| D2 | 2026-07-16 | Engine sport-agnostic; MLB = live dev/validation sport; public launch at NFL kickoff (~Sep 10, 2026); NBA/NHL in Oct | MLB season is live now (real daily data all summer); NFL is the biggest-audience debut |
| D3 | 2026-07-16 | Website: Laravel 12 + Inertia; frontend framework deferred to Phase 3 | **SUPERSEDED by D37/O1:** verify and choose the greenfield stack in Phase 0; Laravel 13 + Inertia 3 + Vue 3 + TypeScript is the proposed default |
| D4 | 2026-07-16 | Sim engine: **shared TypeScript** package — Node worker server-side, same code in browser | Shared engine remains; **NARROWED by D30:** rule definitions are authored once in SportsCrunch and interpreted by parity-tested PHP and TypeScript evaluators |
| D5 | 2026-07-16 | Data via SportsCrunch **API + small additions** (not direct DB) | Decoupling and API contract; the historical direct-DB/bulk exception was rejected by D21 |
| D6 | 2026-07-16 | Sims use **dynamic in-sim rating evolution** (zero-mean Elo-style updates), not frozen odds | **NARROWED by D41/doc 01:** dynamic evolution must pass drift/proper-score/calibration/coverage gates; \`eta=0\` is the safe rollback until it does |
| D7 | 2026-07-16 | Per-game probabilities **anchored to SportsCrunch blended market/model probability** in logit space; deltas ride on top | Keeps market sharpness (injuries/pitchers priced in) while allowing in-sim evolution; needs only league `k` |
| D8 | 2026-07-16 | Calibrate drift rate η per league by **measuring historical market-implied rating drift**; validate with coverage tests | **NARROWED by D34:** use captured walk-forward inputs where available; reconstructed/frozen-modern studies must be labeled and checked for present-state leakage |
| D9 | 2026-07-16 | SportsCrunch's data acquisition/completeness (legacy backfill, gap recovery, source redundancy) is **out of scope** — this project only specs the new SportsCrunch additions it needs | Owner will backfill older seasons upstream independently; PlayoffOdds consumes what exists and degrades gracefully |
| D10 | 2026-07-16 | No per-sim talent draw (σ_est) in v1; coverage tests are the objective trigger to add it | Historical owner decision; current engine contract is doc 01 |
| D11 | 2026-07-16 | 100k sims server-side all leagues; 2–5k browser | Targets pending representative benchmark gates under D39 |
| D12 | 2026-07-16 | Margin-first outcome model for NFL/NBA; MLB Bernoulli-only | Refined by the probability-preserving discrete score contract in D41/doc 01 |
| D13 | 2026-07-16 | NHL five-outcome decomposition | **CORRECTED by D41/doc 01:** the constrained model has six terminal classes (home/away winner × REG/OT/SO) |
| D14 | 2026-07-16 | Playoff games reuse regular-season HFA; brackets as data tables re-verified preseason; ratings+deltas price matchups | Current effect includes resumable postseason state D32; HFA remains a calibrated simplification |
| D15 | 2026-07-16 | **OLD_playoffodds is not used** (no code, no reference). Tiebreaker rules are sourced from official league publications and stored **era-versioned**: paired text (`.md`, cited + dated) and encoded (`.json` ladder over step primitives) rule sets with applicability year ranges, selected by season year | Owner: the legacy app is ~10 years old and every step of the procedures has changed over time; rules must come from the leagues, versioned per era, in both human-readable and code form |
| D16 | 2026-07-16 | Snapshot cadence: daily **spine** at league snapshot instant (sole charting axis) + webhook-triggered **intraday** re-sims on game finals (debounced); anchor-only refresh behind a flag | In force; canonical terms are in D42/doc 02 |
| D17 | 2026-07-16 | Outcome matrices: custom versioned binary, engine-owned reader/writer, disk with S3-ready layout; retained current season + 30 days; aggregates & payloads forever; pruned artifacts reproducible via provenance triple + seed | **SUPERSEDED by D31** where it concerns reproducibility and input retention; exact bundles are permanent |
| D18 | 2026-07-16 | Backfill at launch = current + previous season per league via per-day API assembly; deeper seasons opportunistically post-launch | In force subject to coverage and D34 historical labeling |
| D19 | 2026-07-16 | PlayoffOdds application DB is named **`podds`** — never `playoffodds` | Permanent guard against collision with the legacy `playoffodds` DB that SportsCrunch imports from |
| D20 | 2026-07-16 | SportsCrunch ratings endpoint ships **raw ratings + league params** (`k`, HFA); matchup probabilities derived engine-side | Required upstream contract; current fields/semantics verified in Phase 0 |
| D21 | 2026-07-16 | Backfill via **per-day API assembly** — no bulk export, throttle change or direct-DB exception to D5 | In force; throughput estimates require measurement |
| D22 | 2026-07-16 | Postseason matchups priced **ratings-side** (D14); `historical-odds` stays regular-season-only | In force with known postseason state under D32 |
| D23 | 2026-07-16 | Scenario share links are **URL-only** with stable game IDs and apply pins to the current snapshot | In force; stable scenario seed and conditioning rules added by D35 |
| D24 | 2026-07-16 | Brand: **PlayoffOdds / playoffodds.com** | Owner call; app DB remains `podds` per D19 |
| D25 | 2026-07-16 | **No user accounts in v1**: device-local push; **accounts-lite** arrives only where API keys require it | In force with privacy/retention requirements in doc 06/features 15 |
| D26 | 2026-07-16 | **All free at launch**: site/API/downloads free with required attribution; paid tiers revisited post-traction | In force; exact license/instrument remains O3 and must not be assumed CC BY-compatible |
| D27 | 2026-07-16 | Draft features: **NBA + NHL first**, NFL table anytime, MLB lottery last; pick trades/protections deferred; MLB eligibility restrictions could be footnoted | Order/defer items remain; knowingly incomplete MLB behavior is **SUPERSEDED by D36** |
| D28 | 2026-07-16 | Hosting: **same Forge/AWS environment as SportsCrunch, dedicated server** for `podds` + Node worker | Direction remains; topology/supervision/DR gates are in doc 06 |
| D29 | 2026-07-16 | College sports: keep data-driven doors open; no college work planned | In force |

## Current decisions

| ID | Date | Status | Decision | Consequence |
|---|---|---|---|---|
| D30 | 2026-07-22 | **CONFIRMED** | **SportsCrunch boundary.** SportsCrunch is the system of record for immutable, era-versioned standings/qualification/seeding definitions and authoritative `as_of` standings. It owns the canonical JSON Schema, cited human docs, shared fixtures, rule selection, PHP interpreter, and versioned standings/rule endpoints. PlayoffOdds pins the selected artifact into every snapshot and evaluates it locally with a generic TypeScript interpreter. This narrows D4/D15 and extends D5. | Definitions are authored once; only the small generic interpreter is duplicated. PHP/TypeScript parity uses shared fixtures and differential tests. Required upstream endpoints do not yet exist and gate trustworthy simulation. |
| D31 | 2026-07-22 | **CONFIRMED** | **Reproducibility.** Permanently retain a compressed canonical immutable `SnapshotBundle` containing exact normalized input bytes, the pinned rule payload, checksums/lineage, engine source/build ID, parameters/schema, seed/count, binary format version, and replay runtime metadata. Correction creates a new artifact; published artifacts never mutate. Supersedes D17's version/hash/seed-only recreation claim. | Replays cannot depend on later upstream state or mutable configuration. Raw outcome matrices may have a separate, shorter retention policy; input bundles may not. |
| D32 | 2026-07-22 | **CONFIRMED** | Every bundle has a resumable `PostseasonState`: known matchups, completed games/series, scores, eliminated/advanced teams, play-in/wild-card state, and remaining bracket. | Simulations resume from known postseason reality rather than restarting it. |
| D33 | 2026-07-22 | **CONFIRMED** | Clinch, elimination, control, and magic guarantees use a separate proof-safe subsystem with an explicit tiebreak dependency graph and a Phase 0/5E-selected exact method. Timeout or unsupported dependencies return `unknown/not_proven`; Monte Carlo 0%/100% is never proof. | Record-only pruning is unsafe for dependencies such as NFL SOV/SOS, and a timed-out enumeration is not exact. |
| D34 | 2026-07-22 | **CONFIRMED** | Historical output distinguishes **captured walk-forward artifacts**, **retrospective reconstruction**, and **frozen-modern-model evaluation**. Every point discloses input coverage, anomalies/corrections, and model/rules lineage. | SportsCrunch historical odds may use present schedule/model/config semantics. “Nothing unknowable” is prohibited unless every cutoff input was captured then. |
| D35 | 2026-07-22 | **CONFIRMED** | Picker matrix filtering is conditional Monte Carlo, used only for few pins with adequate effective sample size. Low-ESS scenarios use a direct conditioned server simulation. Scenario seeds derive from snapshot identity plus canonical ordered pins; progressive client refinement exposes stable state and diagnostics. | Filtering is fast, not exact. Stable inputs and seeds make viewers agree without hiding sampling uncertainty. |
| D36 | 2026-07-22 | **CONFIRMED** | Draft/lottery outputs sample the full joint, without-replacement lottery procedure inside the same simulated season world and apply validated era-specific eligibility/team-state rules. Unsupported MLB restrictions block that module. Supersedes D27's “ship and footnote” allowance. | Marginal finish distributions and a fixed matrix cannot represent joint draws, split combinations, ties, playoff-dependent order, or eligibility rules. |
| D37 | 2026-07-22 | **PROPOSED** | Greenfield web default is **Laravel 13 + Inertia 3 + Vue 3 + TypeScript**, subject to Phase 0 current-version/package verification. React is an alternative only with a concrete owner-confirmed reason. Framework choice moves from Phase 3 to Phase 0, superseding D3. Public odds require useful no-JavaScript HTML; if Inertia SSR supplies it, Node is a supervised deploy unit. | Laravel 12's support window does not fit the planned launch. Final selection remains O1 until verification. |
| D38 | 2026-07-22 | **CONFIRMED** | Ship a small anonymous read API and basic MCP discovery/fetch slice by Phase 3 or the Phase 4 launch gate; larger API/MCP/key/download expansion remains Phase 6. DTOs are stable contracts, not database mirrors. | Agent-readiness is product differentiation and should compound from launch. Exact vendor/package behavior is Phase 0-verified. |
| D39 | 2026-07-22 | **CONFIRMED** | Roadmap phases use explicit dependencies, quantitative exit gates, rollback/failure behavior, and deferred scope. Phase 1 is an MLB-first vertical proof then NFL; Phase 2 is the production pipeline plus a two-week soak; Phase 4 is beta/soft launch; advanced work splits 5A–5E, with proof-safe clinch in 5E. | Gate passage, not a date, authorizes progression. Performance numbers remain targets until representative prototypes pass. |
| D40 | 2026-07-22 | **CONFIRMED** | PlayoffOdds locally materializes everything needed for serving and operations. Publication is atomic through a stable pointer and fails closed on invalid input, checksum/schema mismatch, missing lineage, or material PHP/TypeScript standings disagreement. SportsCrunch is never called from a normal render/request path. | The site keeps serving the last good immutable snapshot through upstream or pipeline failure. |
| D41 | 2026-07-22 | **CONFIRMED** | Math gates: rating increments are centered but aggregate probability drift is measured, not assumed zero; simultaneity uses actual starts/overlap; NHL uses a constrained six-terminal-class model (home/away winner × REG/OT/SO); NFL uses calibrated probability-preserving W/L/T; discrete score/margin and accumulator rules are fixture-tested. | Nonlinear links invalidate the old martingale-mean claim; unconstrained decompositions, miscounted outcome classes, and ad hoc tie bands can produce invalid probabilities. |
| D42 | 2026-07-22 | **CONFIRMED** | Canonical time/publication vocabulary is defined in doc 02 and reused everywhere: `as_of`, `current`, `snapshot`, `spine`, `intraday`, `official`, and `if_season_ended`. | These are product-contract terms, not interchangeable labels. |

## Canonical open decisions

Downstream documents may recommend a choice and link here, but may not create another open-question list.

| ID | Needed by | Status | Choice and current recommendation |
|---|---|---|---|
| O1 | Before Phase 1 scaffolding | **OPEN** | Confirm the verified web stack. Recommendation: Laravel 13 + Inertia 3 + Vue 3 + TypeScript. React requires a concrete owner-confirmed reason. Verify SSR/package/runtime support first. |
| O2 | Phase 3 crawler configuration | **OPEN** | Choose crawler policy separately: recommendation is allow `OAI-SearchBot` for discovery; decide independently whether to allow `GPTBot` for training. Record other bots in the same policy matrix. |
| O3 | Before API/download launch | **OPEN** | Select the exact output/data license and attribution terms compatible with upstream contracts and team-mark restrictions. D26 fixes “free with attribution,” not the legal instrument. |
| O4 | Phase 0 cross-cutting gate | **OPEN** | Approve numeric RPO, RTO, restore-test cadence, monthly infrastructure budget, and peak-load headroom. Proposed starting targets are in doc 06. |
| O5 | Before notification beta | **OPEN** | Approve retention windows for push endpoints/preferences, delivery audit records, and user-agent/IP security logs. Proposed minimization windows are in doc 06 and features/15. |
| O6 | Before API beta | **OPEN** | Approve API deprecation notice and anonymous/keyed limits after load/cost tests. Proposed defaults are in features/16. |
| O7 | Before public launch | **OPEN** | Approve launch success metrics and alert/error-budget thresholds after the Phase 2 soak establishes a baseline. Proposed measures are in doc 06. |

## Resolved legacy question index

Legacy `Q1`–`Q21` references are historical only: Q1→D10, Q2→D11, Q3→D12, Q4→D13, Q5→D14, Q6→D16, Q7→D17 then D31, Q8→D18, Q9→D20, Q10→D21, Q11→D22, Q12→D24, Q13→D25, Q14/Q20→D26/O3, Q15→D27 then D36, Q16→D28, Q17→D29, Q18→D23/D35, Q19→D37/O1. Q21's marketplace-spend choice is deferred and is not an implementation gate.
