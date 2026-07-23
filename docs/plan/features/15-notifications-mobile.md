# Features 15 — Mobile/PWA and Hardened Notifications

**Status: DRAFT v2 (2026-07-22).** Mobile/accessibility baseline begins Phase 3; Web Push delivery is Phase 6.

## 1. Mobile/PWA baseline

- Design core tasks at 320–390 CSS pixels first while preserving semantic table/data alternatives.
- Keyboard/touch parity, visible focus, sufficient targets/contrast, reduced motion and no hover-only content follow doc 06 WCAG 2.2 AA requirements.
- PWA manifest/service worker may cache the shell and last published local snapshot/payload needed for followed leagues. Offline content keeps its exact `as_of` and an unmistakable offline/stale banner; it never says current without revalidation.
- Service-worker updates are versioned with app/client payload compatibility, fail safely and do not strand an incompatible engine/rule cache.
- Native applications are out of scope until measured PWA engagement/limitations justify them.

## 2. iOS Web Push and permission flow

The onboarding must explain and test platform constraints rather than hiding them:

- On supported iOS/iPadOS, web push requires the site to be installed/added to the Home Screen and permission requested from that installed app context.
- Permission request occurs only after an explicit user gesture and a plain pre-permission explanation of channel/frequency/value. Never prompt on first page load or repeatedly after denial.
- Detect capability/permission state and give platform-appropriate install steps; unsupported/denied states retain ordinary follow preferences locally without claiming notifications are active.
- Test onboarding, permission, deep links, badge/icon, unsubscribe and upgrade/service-worker behavior on supported Safari/iOS and major desktop/Android browsers before beta. Reverify platform requirements at implementation time.

## 3. Subscription lifecycle without general accounts

D25 uses device-local recipients at first. A subscription record contains an encrypted Web Push endpoint/keys, device-local recipient ID, followed team IDs, channel/threshold/timezone/quiet-hours preferences, consent and last-success/failure/expiry timestamps. It never stores more browser fingerprint data than required.

Lifecycle:

1. User selects a team/channel and sees frequency/privacy information.
2. After explicit gesture/capability checks, request permission and create/update the endpoint idempotently.
3. Show a persistent notification settings page with pause, per-team/channel controls and **unsubscribe/delete this device**.
4. Unsubscribe deletes/disables endpoint and preferences promptly and unregisters local state; privacy deletion path covers server records/history under doc 06/O5.
5. `404`/`410` push responses immediately retire the endpoint; repeated permanent/auth failures disable it. Inactive/expired endpoints are purged under O5.
6. A future accounts-lite recipient may group devices, but caps apply at logical user and device to prevent multiplying alerts.

No email/account is required for push. API-key accounts do not automatically opt into notifications.

## 4. Candidate and delivery data flow

All candidates derive from local immutable snapshots/events/games/proof results:

1. Pointer publication commits.
2. A notification evaluator compares named snapshots/events and writes immutable candidates with source snapshot/event/proof IDs, message facts, expiry and priority.
3. Before send, revalidate that the candidate's event has not been superseded/retracted, its game/team is still relevant, proof/model status is current and recipient preferences/caps allow it.
4. Create an idempotent delivery record and enqueue. Delivery workers do not recompute odds or call SportsCrunch.
5. Record provider status/attempt metadata without full endpoint/message secrets; update success/failure/retirement state.

Idempotency key includes recipient/subscription, channel, team/global scope, source snapshot/event/proof, message semantic version and correction version. Retry reuses the key; duplicate webhook/pointer events cannot send twice.

## 5. Channels

| Channel | Source and eligibility |
|---|---|
| Odds movement | Named spine/current comparison from `team_odds`; threshold exceeded with uncertainty/correction checks. Prefer slate-end/debounced state to avoid reversals. |
| High-leverage game | Local game start + quality-passing `game_conditionals`; send before configurable lead time only if still upcoming/current. |
| Clinch/elimination | Authoritative official status or current Phase 5E `proven` result. Probability 100% is insufficient. |
| Tonight scenario | Current non-expired proven scenario from Phase 5E, including exact outcome semantics. |
| Digest | Scheduled summary over named spine snapshots/events; correction-aware and one per configured period. |

Content includes the value/status, exact context and deep link; no empty “check the app” teaser. Reconstruction/degraded warnings are included or suppress the notification when they make the claim unsafe.

## 6. Caps, expiry, quiet hours, and suppression

Caps are enforced at all levels and configurable without schema change:

- per logical recipient/user across devices;
- per device/subscription;
- per team/channel and per day/rolling window;
- per game/event to prevent variants; and
- global send/concurrency/cost caps with priority/admission control.

**PROPOSED starting policy:** max 2 non-digest notifications per team/day, 3 per recipient/day, one notification per semantic event, and a tested global batch/rate ceiling. Clinch/correction supersedes ordinary movement; digest can merge queued low-priority items. O5/O7/load tests finalize values.

Quiet hours use the stored timezone; queued items have channel-specific expiry. A high-leverage pregame alert expires at game start; tonight scenario expires when a referenced game starts/finals/changes; movement normally expires at next spine; proof status candidates expire on pointer/proof supersession. Expired candidates are dropped, never “caught up” late.

## 7. Stale events, corrections, and retractions

Pre-send revalidation checks current pointer, source checksum/revision, local game state/start, correction/retraction links and proof validity. Any mismatch suppresses/rebuilds the candidate.

If a delivered claim becomes materially wrong:

- publish an immutable correction/retraction snapshot/event and update the deep-linked page immediately;
- send a correction notification only when user impact/materiality and caps/policy justify it, clearly labeled “Correction,” linked to the corrected facts;
- never silently overwrite delivery history; and
- track correction rate as a quality metric/alert.

Push delivery cannot be recalled. Message design avoids overconfident causal language and always leads to a current, correction-aware page.

## 8. Privacy and security

- Treat endpoint/keys as credentials/personal data: encrypt at rest where practical, restrict worker access, redact logs/errors and never expose to analytics/client after registration.
- CSRF/authenticate browser subscription mutations; validate endpoint scheme/size and team/channel enums; enforce per-IP/recipient creation limits to prevent storage/send abuse.
- VAPID/signing keys are secret-rotation/runbook assets. Rotation, provider outage and compromised endpoint tests are required.
- Publish purpose/processor/retention/deletion details. No marketing or cross-team channel is inferred from one follow action.
- Delivery logs and inactive endpoint retention use O5, separate from permanent non-personal snapshot retention.

## 9. Reliability and observability

Metrics: active/expired/retired subscriptions, onboarding funnel by capability (privacy-safe), candidate→suppressed/queued/sent, delivery success/hard/soft failure, retries/duplicates, cap/quiet/expiry drops, correction rate, queue age and provider latency/cost. Alerts cover global delivery outage, credential failure, duplicate spike, stale candidate send and queue age beyond expiry.

Provider failure retries with bounded backoff only while candidate remains current/unexpired. Publication never waits on push. Global kill switch stops sends without deleting preferences.

## 10. Phase gates and rollback

**Phase 3 mobile/PWA:** core routes pass mobile/no-JS/accessibility/performance tests; offline snapshot is timestamped/stale; service-worker rollback works.

**Phase 6 push exit:**

- iOS Home Screen + user-gesture and other platform flows pass real-device tests;
- subscribe/update/pause/unsubscribe/delete and 404/410/inactive expiry work end to end;
- idempotency survives duplicate candidates/retries; per-user/device/team/global caps, quiet hours and expiry pass deterministic tests;
- stale/corrected/retracted/proof-revoked fixtures suppress or correct safely;
- privacy/security review, O5 retention approval, provider load/cost and kill-switch/runbook drills pass.

Rollback disables candidate generation/sending by channel or globally while preserving preferences. Core site/current publication remains independent and operational.
