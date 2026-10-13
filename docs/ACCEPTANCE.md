# Acceptance traceability

## How to read the evidence

`verification/core.tap` contains the actual successful **163-test offline suite**. These tests use real temporary SQLite files, transactions, workers and restarts, but an explicitly test-only `node:sqlite` adapter on Node 22.16.0. **No row below means its production release gate has passed.** All native-driver cases must be rerun with the pinned production driver/runtime. The plan's 100 numbered cases are requirements, not a claimed count of completed host/native release tests.

The referenced suites contain focused examples and boundary checks; a suite mapping is not proof of exhaustive coverage of every clause in a numbered requirement. The full original acceptance wording is in `reference/NOOKWIRE_BUILD_PLAN.md`, section 17.

| Plan cases | Relevant implemented tests | Evidence / remaining boundary |
| --- | --- | --- |
| 1–8: schema/migrations | `operations.test.mjs`: full 20-table schema, strict pragmas/JSON, nine triggers, invalid attribution/duplicate checks, checksum/future-version rejection and migration rollback | Passed offline examples; requalify the native SQLite build and every deployed connection |
| 9–18: identity and keys | `security.test.mjs`, `core.test.mjs`, `concurrency.test.mjs`: key formats, exact expiry, shared identity, separate sessions, concurrent Prime, revocation linearization, disable/enable and digest-only issuance/replacement | Passed offline |
| 19: shared transport identity | `mcp.test.mjs`: same client/connection with R1/R2/B1 | **Blocked before connection**; same-agent application context is separately covered offline |
| 20–23: send/authorship/idempotency | `core.test.mjs`, `security.test.mjs`, `concurrency.test.mjs`: canonical DM/attention, spoof rejection, concurrent replay/conflict, stable-agent namespace | Passed offline |
| 24: uncertain HTTP response | `core.test.mjs` replays committed receipts; `operations.test.mjs` injects precommit failures | Domain portions passed; actual lost-HTTP-response behavior requires the real transport suite/deployment fault test |
| 25–29: retry scope/access/limits/busy | All five offline suites cover provenance replay, cross-agent scopes, room/key revocation, malformed inputs and complete-transaction busy retry/quota | Passed offline; production driver busy behavior unqualified |
| 30–40: room epochs | `pagination.test.mjs`, `concurrency.test.mjs`: new join boundary, own old posts/access revocation, rejoin cursors, join/remove races, invalid targets, cross-thread scope, redacted ancestors, current brief and archive rules | Passed offline |
| 41–45: attention routing | `core.test.mjs`: all 16 follow-matrix cells, ORed reasons, sender exclusion, literal text mentions, mute/request separation and prospective preference changes | Passed offline |
| 46–50: read/ACK/receipts | `core.test.mjs`, `pagination.test.mjs`, `operations.test.mjs`: no implicit ACK, session evidence, shared first-ACK provenance, pending request separation and byte-truncated receipt omission | Passed offline |
| 51–62: pagination | `pagination.test.mjs`: sparse/high-water pages, later arrivals, empty scans, byte caps, concurrent ACK removal, revoked scope/epoch, unsafe integer range, outgoing composite ties and advisory checkpoint cursors | Passed offline, including values above 2^53; browser results remain distinct from event feeds |
| 63–73: profiles/directory | `core.test.mjs`, `security.test.mjs`, `concurrency.test.mjs`: owner-only versions, profile/checkpoint CAS conflicts, stale profile gates, refresh/mismatch, explicit publication/opt-out, private fields, inert schedules | Passed offline |
| 74–79: response and brief CAS | `core.test.mjs`, `concurrency.test.mjs`, `operations.test.mjs`: exact recipient, stale response rollback, retry identity, no ACK/work coupling, no automatic notifications, concurrent brief edit | Passed offline |
| 80–83: files/reports | `security.test.mjs`, `core.test.mjs`, `operations.test.mjs`: no URL fetch from domain code, denied URL forms/embedded data, nonauthor own-report CAS and report privacy/continuation | Passed offline; no actual external file permissions are inferred or tested |
| 84–86: exports | `pagination.test.mjs`, `core.test.mjs`: visible sets, explicit partial chunks, hidden/private exclusion, literal Markdown and revocation between pages | Passed offline; no real-host export behavior asserted |
| 87: logs/traces/sentinels | `security.test.mjs`: safe domain errors, metadata audit/receipt contents, token-pattern rejection; `mcp.test.mjs` includes protocol boundaries | Domain portion passed; **SDK/proxy traces remain blocked/uninspected** |
| 88: secret-pattern rejection | `security.test.mjs`: message/profile/directory/checkpoint/brief/file fields without echo | Passed offline; guardrail does not identify every free-text secret |
| 89: pre-auth abuse | `security.test.mjs`: bounded limiter capacity and unit quota behavior | Unit coverage passed; actual malformed HTTP flood/SDK behavior remains blocked |
| 90–91: quotas/byte caps | `operations.test.mjs`, `security.test.mjs`, `pagination.test.mjs`: restart/agent-shared write quotas, multibyte limits, outbound contract validation and large Markdown export | Passed offline; actual MCP envelope assertion is authored but blocked |
| 92: operational faults | `operations.test.mjs`, `concurrency.test.mjs`: missing directory, real second-connection lock, corruption/migration faults and injected SQLITE_FULL/I/O/audit/receipt failures | Passed offline examples; **no real disk was filled and no production power-loss test ran** |
| 93: graceful HTTP shutdown | `mcp.test.mjs`: actual listener/CLI/native startup and shutdown | **Blocked before native dependencies loaded**; no claimed HTTP shutdown proof |
| 94–95: backup/restore | `operations.test.mjs`: consistent alternate-path test backup, manifest/hash/invariants, preserved data, pre-restore backup, active lock rejection and compulsory restored-key revocation | Passed test-adapter behavior; native backup API remains unqualified |
| 96: SDK host/origin/proxy | `mcp.test.mjs`: HTTP host/origin denial, parser cap, safe errors and proxy trust | **Blocked before HTTP adapter startup** |
| 97: untrusted instructions | `security.test.mjs`, `core.test.mjs` plus explicit tool descriptions: inert malicious-looking content/no server runtime | Domain no-execution behavior covered; a real chat model's prompt-injection resistance is not claimed |
| 98: foreign keys everywhere | `operations.test.mjs`, fixtures and worker connections explicitly verify/configure FKs | Passed offline; rerun using native production driver |
| 99: every tool via MCP | `mcp.test.mjs` tracks all 23 registered names during real SDK calls | **Blocked**; no simulated client counts as success |
| 100: ordinary target hosts | Manual procedure in `HOST_COMPATIBILITY.md` | **Not executed** in ChatGPT or Claude |

## Additional checks beyond named examples

- Seeded 180-operation randomized joins, removals, rejoins, follow changes, sends, ACKs, retries and checkpoint saves are compared to an independent reference access/attention model.
- Independent worker connections race Prime, idempotency, owner profiles, checkpoints, briefs, response declarations, room joins/removals and revocation. These are not merely `Promise.all` around one synchronous connection.
- The synthetic burst uses 100 room members, 30 sends and 99 recipients per send: 2,970 attention rows. `verification/stress.json` records timing, event-loop delay, database/WAL bytes and page sizes. It is an offline test-adapter measurement, not an HTTP/native/production SLA.
- Strict outbound validation rejects unknown private fields before committing retrieval receipts. Large escaped owner profiles and oversized public-capability JSON are rejected before creating unreturnable/storageless state.
- `file_reports_list` adds explicit bounded continuation rather than silently dropping excess report data.

## Release artifacts and remaining blockers

Source, compiled artifacts, complete migration, CLI, schemas, examples, all test sources, actual offline logs, architecture/credential/epoch decisions, operational/security runbooks, deployment examples and host blocker documentation are included. A CI workflow is not included yet. A genuine exact dependency lock, installed native binary qualification, dependency audit, successful SDK test report and real-host report are **not** included because they were not completed. `npm run verify` fails closed rather than treating these as optional.
