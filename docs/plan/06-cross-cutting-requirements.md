# 06 — Cross-Cutting Product and Operational Requirements

**Status: DRAFT v1 (2026-07-22) — requirements and proposed starting targets; owner decisions O2–O7 remain in doc 99.**

These requirements apply to every phase and feature. A feature is not done when its happy path works; it is done when the applicable security, privacy, accessibility, legal, quality, observability, recovery, and capacity gates pass.

## 1. Requirement language and ownership

- **CONFIRMED** requirements derive from decisions in doc 99 and are release-blocking.
- **PROPOSED** numeric thresholds are the engineering starting point; Phase 0/2 evidence and owner decisions O4/O6/O7 finalize them.
- The application owner is accountable for policy choices. Implementation owners produce evidence (tests, reports, runbooks); an owner approval is not substituted for missing evidence.
- Exceptions are time-bounded, documented with risk/mitigation/expiry, and cannot weaken rules parity, immutable bundle retention, proof honesty, or no-upstream request-path invariants.

## 2. Security threat model and abuse controls

### Assets and trust boundaries

Protect: publication pointers, immutable bundles/rules, model parameters, SportsCrunch/service credentials, signing/VAPID secrets, push endpoints, API keys, team/admin access, and correctness/availability of public odds. Trust boundaries include SportsCrunch API/webhooks, anonymous site/API/MCP/scenario traffic, browser workers/service workers, deploy/build systems, DB/artifact store, and operator access.

### Required controls

- Signed SportsCrunch events: verify signature over raw bytes, timestamp/replay window, request ID and expected scope before enqueue; deduplicate and re-fetch authoritative local materialization inputs.
- Least-privilege, separately rotatable credentials for SportsCrunch, DB, artifact store, push, deploy and monitoring. Secrets never enter bundles, URLs, client payloads, analytics or logs.
- Standard web controls: TLS, secure headers/CSP, CSRF on state-changing browser routes, strict CORS allow rules (public GETs may be open), parameterized queries, output escaping, dependency/build-lock scanning, protected admin/ops routes, and audited privileged actions.
- Validate league/team/snapshot identifiers, dates/modes, pagination, pin count/encoding, payload size, content type and decompression limits at the edge. Unknown/unsupported values get typed 4xx errors.
- Rate limits combine per-IP/key/subscription controls with global concurrency and cost budgets. Expensive conditioned simulation is queued/bounded separately from cached GET/MCP reads; timeout/cancel leaves no partial publication.
- Cache keys include every representation-affecting parameter and authorization state. Do not let untrusted host/forwarded headers create canonical URLs or poison SSR/API caches.
- WAF/bot rules must distinguish desired crawl/API traffic from abuse and must not silently block verified discovery bots contrary to the recorded O2 policy.
- Admin publication/rollback/correction operations require authenticated authorization, reason, immutable audit event and, for high-risk production actions, a second confirmation or equivalent protected workflow.

### Abuse tests/gates

Threat-model review in Phase 0; automated dependency/secret/static checks in CI; rate-limit, malformed payload, webhook replay, cache isolation and resource-exhaustion tests before beta; focused external or independent security review before Phase 4. Critical/high findings block launch unless remediated or explicitly risk-accepted with expiry.

## 3. Privacy, deletion, retention, and log hygiene

PlayoffOdds launches without general user accounts (D25), but push endpoints, IP addresses, user agents, API keys/emails and scenario requests can be personal or linkable data.

- Collect only what a defined feature/defense needs. Do not store full IP/user-agent indefinitely; truncate/hash/rotate where aggregate abuse analysis suffices.
- Publish a plain privacy notice listing data, purpose, processor/service, retention, deletion/unsubscribe path and contact.
- Push onboarding is explicit and user-initiated; unsubscribe deletes or disables the endpoint and preferences promptly. Browser permission state is not treated as consent to unrelated analytics.
- A deletion request covers accounts-lite email/key records, device push endpoint/preferences and linkable delivery history, subject only to minimal legal/security holds. Record a non-sensitive deletion audit marker.
- Push endpoints and API keys are encrypted at rest where practical, never logged in full, and redacted from error telemetry. URLs/query strings containing scenario pins are not copied wholesale into analytics logs.
- `404`/`410` push responses retire endpoints immediately; repeated hard failures disable them. Stale endpoints expire under O5.
- Application logs use structured allowlisted fields (request ID, route template, status, duration, snapshot/checksum IDs), not request/response payload dumps. Debug payload logging is off in production.
- Model/snapshot artifacts are non-personal and follow permanent retention in doc 02; privacy data follows separate time-bounded O5 policy.

**PROPOSED for O5:** inactive push endpoints 90 days; delivery attempt bodies not retained, metadata 30 days; raw security request logs 30 days with longer aggregated counters; verified account/key audit events 1 year. Confirm against operational/legal need before beta.

## 4. Accessibility and resilient HTML

Target **WCAG 2.2 AA** for public and account/subscription flows. Accessibility is tested throughout Phase 3, not deferred polish.

- Every action and route is keyboard operable with visible focus, logical focus order, skip navigation, no keyboard trap, and predictable focus restoration after Inertia navigation/dialog updates.
- Semantic headings, landmarks, links, buttons, form labels/errors and status announcements. Dynamic odds changes use restrained live-region announcements and never flood screen readers.
- Data tables use real table markup, captions, scoped headers, sortable-state labels, and a non-color representation. Mobile card/grid alternatives preserve relationships.
- Charts provide a text summary and accessible data table/download; interactions work by keyboard/touch; tooltips are not the sole source. Series differ by labels/patterns as well as color.
- Meet text/UI contrast, 200% zoom/reflow, 320 CSS-pixel layout, target size, and error-identification requirements. Clinch/elimination and deltas never rely only on red/green.
- Respect reduced-motion and contrast/user preferences. Progressive 2k→5k updates avoid flashing/layout shift and expose stable loading/refining/complete states.
- Useful current odds, timestamps, methodology/lineage links, core navigation and table content exist in server-rendered/no-JavaScript HTML. No-JS is a tested semantic fallback even when advanced picker/chart interactions require JS.
- Automated axe-equivalent checks, keyboard tests, no-JS integration tests and manual screen-reader sampling cover league/team/API-doc/subscription critical paths. AA violations in core tasks block Phase 4.

## 5. Legal, licensing, attribution, and marks

- Inventory every upstream source, rule citation, sportsbook/model input, team/league mark, font/icon, library and analytics/notification processor with license/terms, allowed use, attribution, redistribution and retention constraints.
- Public API/downloads expose PlayoffOdds outputs, not an unlicensed proxy of SportsCrunch/raw sportsbook data. DTO field review is a legal/contract gate.
- Exact output license remains O3. Do not label data CC BY-style until counsel/owner confirms that instrument and upstream compatibility.
- Team/league marks require explicit permission or a documented nominative/text-only fallback. `teams.mark_asset` records license/status; unapproved assets cannot publish.
- Rules pages paraphrase/cite official procedures within allowed use; avoid copying large protected texts. Store citations/retrieval dates and correction history.
- Publish terms, privacy, attribution/citation guidance, methodology/model card and takedown/contact path before public beta.
- Crawler policy separates discovery/search use from training. `OAI-SearchBot` and `GPTBot` are separate O2 choices; robots/CDN/WAF behavior must match the recorded matrix.

## 6. Analytics, success metrics, observability, and alerting

### Product analytics

Use privacy-minimized first-party events where possible. Measure outcomes, not vanity-only traffic:

- successful current odds/team/chart/API/MCP fetches and freshness;
- picker starts, pins, completed/refined conditioned results, shares and low-ESS fallbacks;
- return usage, followed teams, push opt-in/delivery/disable rates;
- API/MCP adoption, canonical citation/referral evidence, crawler fetch health;
- methodology/lineage engagement and correction visibility; and
- accessibility/no-JS task success sampled through tests/feedback, not invasive fingerprinting.

Do not send push endpoints, API keys, emails, full scenario encodings or raw upstream payloads to analytics vendors.

### Technical observability

Correlate with request/job ID, snapshot ID, bundle/rules/build checksum and pointer version. Metrics/logs/traces cover upstream fetch latency/errors, queue depth/age, assembly/parity/validation failures, simulation duration/memory, publication freshness, replay failures, pointer changes, cache/API/MCP performance, SSR health, notification candidates/delivery, storage/backup/restore and cost.

Alerts must be actionable, deduplicated and linked to a runbook. Page immediately for pointer corruption, material parity/checksum failure, published artifact unavailable, security secret/signature anomaly, or current data beyond the league freshness SLO. Ticket/non-page for isolated upstream retry, individual push retirement or non-material optional degradation.

**PROPOSED for O7:** ≥99.5% monthly public read availability excluding announced maintenance; ≥99% scheduled spine publication within 30 minutes of target when upstream prerequisites are available; zero known material parity publications; p95 cached read under 500 ms; alert within 5 minutes for publication staleness/parity failure. Phase 2 soak establishes realistic league baselines.

## 7. Backup, restore, and disaster recovery

- Publication requires durable DB and artifact writes before pointer advance. A pointer may never reference an artifact that exists only on one ephemeral disk.
- Back up DB, immutable artifacts/bundles/rules/client payloads, configuration needed to restore, and deployment/build manifests. Encrypt backups and test access controls.
- Use point-in-time or sufficiently frequent DB protection plus versioned/replicated artifact storage. Backup deletion credentials are separated from primary write credentials where feasible.
- Restore tests are evidence: provision isolated recovery, restore pointer/history/artifacts, verify checksums, serve last good snapshot and complete an offline replay.
- Runbooks cover DB loss, artifact-store loss, bad deploy, bad snapshot/pointer, SportsCrunch outage, queue backlog, SSR failure, secret rotation and compromised push/API credential.

**PROPOSED for O4:** DB RPO ≤15 minutes and RTO ≤4 hours; published artifact durability before pointer advance with disaster-backup RPO ≤24 hours and RTO ≤4 hours; quarterly full restore/replay test. A degraded static/last-good read mode should recover faster than full pipeline operation. Owner confirms numeric targets/cost.

## 8. Deployment topology, supervision, and rollback

Baseline topology on the dedicated environment (D28): web/reverse proxy + PHP application, MySQL `podds`, queue/scheduler, supervised Node simulation workers, supervised SSR Node process if Inertia SSR is retained, immutable artifact storage/CDN, and monitoring/backup agents. SportsCrunch remains a separate upstream service.

- Deploy Laravel assets, DTO schema, TypeScript engine, SSR bundle and worker compatibility as one release manifest with checksums. Mixed incompatible builds fail health checks and cannot publish.
- Every long-running Node/PHP queue/SSR process is supervised with automatic restart/backoff, memory/time limits, health/readiness checks, graceful drain, structured logs/metrics and deploy version labels.
- SSR health failure must not fabricate stale numbers. Prefer last-good cached/server HTML or a controlled no-JS-capable fallback; alert and degrade advanced hydration. No-JS HTML integration tests run against the production-shaped topology.
- Database migrations are backward-compatible across rolling deploy/rollback or require a planned maintenance transaction. Pointer and immutable artifact formats have explicit reader compatibility.
- Rollback restores the previous application/engine/SSR release and, only if needed, advances the pointer back to a previous verified snapshot through an audited operation. Never mutate/delete the bad immutable snapshot during rollback.
- Pre-production smoke tests validate current page/API/MCP, no-JS output, queue simulation, parity gate, pointer publication, worker/SSR restart and cache keys.

## 9. Capacity, performance, and cost

- Establish representative server/mobile bundles and load profiles in Phase 0: league launch peak, webhook slate burst, simultaneous picker requests, crawler/API/MCP traffic, notification fan-out and backfill competition.
- Maintain separate concurrency/budgets for publication-critical jobs and user-conditioned simulations so abuse or backfill cannot starve current snapshots.
- Load tests report p50/p95/p99, throughput, queue age, memory/CPU, DB/cache/artifact I/O, error/degradation rate and estimated monthly/peak cost.
- Capacity includes at least the O4-approved headroom after one worker/process loss. Autoscaling is optional; bounded admission/queueing and graceful stale/read-only behavior are required.
- Performance figures in docs 01/features/12/16 are targets until representative tests pass. Compression and CDN hit-rate assumptions are measured.
- Set cost alerts and per-feature cost attribution for simulations, artifact storage/egress, SSR, push and external services. O4 approves monthly budget and stop/degrade thresholds.

## 10. Data quality, late corrections, and model changes

- Validate completeness, referential integrity, time ordering, duplicate IDs, season-team alignment, scores/end types, anchor bounds/semantics, rule/schema/checksums and postseason consistency before simulation.
- Assign severity: material (can change standings/qualification/odds or lineage), degraded optional, or informational. Material failures block publication; optional degradation is visible and thresholded.
- Quarantine anomalous bundles with diagnostic diffs; do not auto-normalize away unexplained contradictions.
- Late source correction creates new local events, bundle and snapshot revision. Prior published snapshots remain addressable and link to correction/retraction. Current moves only after full gates.
- Model/rule/parameter changes have versioned model cards/changelog, effective snapshot, validation comparison and rollback plan. Material methodology changes receive public notice and chart annotations; do not splice recomputed history into captured history without a distinct series/reconstruction label.
- Dual-run old/new models on a representative window before promotion. Compare proper scores/calibration/coverage, aggregate movement and operational cost. An upgrade can be rejected even if runtime improves.

## 11. API and dependency version policy

- Public DTO/API/MCP contracts version independently of database schema. Additive changes may remain in a major version; semantic/breaking changes use a new version and migration window.
- Every response states snapshot/rules/model lineage and decimal units; immutable resources use ETags. Deprecated fields/endpoints carry machine-readable and documented sunset dates after O6 approval.
- Framework, Inertia, Vue/React, Node, TypeScript, Laravel MCP and vendor crawler/directory claims are verified in Phase 0 and before each relevant launch. Do not encode unverified future product/version guarantees.
- Security-supported versions are required. Upgrades pass contract, replay, SSR/no-JS, accessibility, load and rollback suites before production.

## 12. Phase gates

- **Phase 0:** threat model; data/license/marks inventory; privacy/retention draft; accessibility test plan; topology; version verification; proposed O4/O7 targets; representative performance/repro prototypes.
- **Phase 1:** engine/rules/bundle security and replay evidence; no secrets in artifacts; model card/calibration report.
- **Phase 2:** backup/restore, correction, parity failure, dead-letter/retry, pointer rollback and two-week observability soak.
- **Phase 3:** WCAG/no-JS/SSR critical-path evidence; small API/MCP abuse/cache/DTO contract tests; privacy/legal pages drafted.
- **Phase 4:** load, independent security review, legal/marks/license approval, crawler policy O2, restore/rollback drill, alert/runbook review and owner sign-off before public launch.
- **Later features:** repeat threat/privacy/accessibility/load review for picker conditioning, push, proof search and lotteries; a prior launch gate does not grandfather a materially new attack/cost/data surface.
