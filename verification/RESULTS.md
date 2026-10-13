# Nookwire build verification

**Artifact:** `1.0.0-rc.1` source + compiled repository. **Release status: BLOCKED / NOT PRODUCTION-QUALIFIED.**

The requested v1 domain features and local owner operations are implemented. This archive is not a claim that the user's requested fully tested final product was achieved. In particular, official MCP integration, production native dependency validation and actual ordinary-chat host qualification could not be completed.

## What actually ran

| Check | Actual result |
| --- | --- |
| TypeScript compile | Exit 0; TypeScript 5.8.3, strict configuration |
| Separate no-emit typecheck | Exit 0; local Node type declarations 24.0.4 |
| Core/security/pagination/concurrency/operations | **163 tests; 163 passed, 0 failed, 0 skipped** |
| Test database/runtime | Real temporary disk files; Node **22.16.0**, SQLite **3.49.1**, explicit test-only `node:sqlite` adapter |
| Production better-sqlite3 | **Not installed or exercised** |
| Official SDK MCP/HTTP suite | Attempted: **4 tests blocked at missing-dependency prerequisite**, zero actual MCP calls |
| CLI help | Executed without opening a database; exit 0 |
| Domain owner CLI/service actions | Executed through the trusted owner service in the offline suites; native CLI write integration remains blocked |
| Disposable domain demo | Passed; same stable agent, separate sessions, shared unread response mail and integrity check |
| Synthetic 100-member burst | 30 canonical messages, **2,970 attention rows**, no observed busy errors in that run |
| Fail-closed release gate | Executed; exit 1 with explicit dependency/runtime/host blockers |
| ChatGPT ordinary tabs | Not exercised |
| Claude ordinary tabs | Not exercised |
| Deployment / real credentials | Neither performed nor created |

The test adapter is isolated under `tests/support/driver.mjs`. Production code never imports it or silently switches away from `better-sqlite3`. It verifies real SQLite domain/transaction behavior without pretending to verify another driver's native ABI or backup implementation. `npm run test:mcp` explicitly refuses this substitution.

## Scope implemented

All 22 specified MCP service contracts are implemented, with one documented `file_reports_list` extension for bounded access-report continuation. This includes stable identities, independent keys/sessions, private versioned profiles, inert schedules, directory projection, checkpoint CAS, DMs/rooms/threads, membership epochs, structured attention routing, shared explicit ACKs and per-session receipts, declarations, file references/reports, briefs, exports, quotas and local owner lifecycle/maintenance operations.

The exact schema is migrated with real checksums. Canonical messages/profile/brief history remains immutable. Production source uses the official SDK v2 factory/Node/Express integration rather than a handwritten JSON-RPC server. Input schemas and strict output DTO checks guard the service boundary. Those source facts are not a successful integration test.

## What the passing tests prove — and do not prove

Offline tests include the full twelve-step acceptance story at the domain boundary, independent multi-connection races, rollback injection, CAS, expired/revoked credentials, unsafe-integer sequences, sparse/snapshot/byte-limited paging, all follow-matrix cells, access loss across every exposed room read path, profile privacy, no automatic scheduler/network execution in the domain, one-time secret handling and backup/restore policy.

Disk-full and several I/O failure cases are **injected error paths**, not a physical disk filled to capacity. Backups/restoration are actually exercised on temporary files using the adapter's alternate backup mechanism; the production `better-sqlite3.backup()` call remains untested. The offline domain story is not equivalent to executing it in real ordinary chat tabs.

The shared-container burst measured a mean synchronous send of 4.26 ms, p95 6.82 ms and maximum 7.02 ms for this synthetic fixture. Event-loop delay reached 131.53 ms during the synchronous burst. Returned page sizes were 57289, 28790 bytes. These observations are **not** production throughput, concurrency capacity or a service-level guarantee. The recorded WAL size includes fixture provisioning.

## Why a lockfile/native/MCP pass is missing

Container npm access failed with `EAI_AGAIN` for `registry.npmjs.org`. Official web documentation was readable and informed the adapter API, but that did not install packages. Some scoped package pages also returned HTTP 403. The selected production runtime, Node 24.21.0, was not available in the container.

Therefore this repository contains **no invented package-lock.json, dependency integrity hashes, fake SDK mock, fabricated native-driver pass, or claimed real-host result**. SDK/Zod/type major lines in `package.json` are requirements awaiting exact resolution. Known exact better-sqlite3/Express selections are not installation or security-audit evidence. `scripts/bootstrap.mjs` resolves and installs real exact stable versions on a connected environment and lets npm produce a genuine lock. Remaining qualification is enforced by `scripts/release-gate.mjs`.

## Evidence files

- `core.tap`: complete successful offline test output.
- `mcp-attempt.tap`: actual blocked-prerequisite test output; not a passing report.
- `build-summary.json`: machine-readable scope/runtime/results/blockers.
- `dependency-attempt.json`: registry failure, without private environment details.
- `stress.json`: actual synthetic burst metrics and explicit driver caveat.
- `demo.json`: disposable domain demonstration, public IDs only.
- `release-gate.json`: actual fail-closed release result.
- `host-results.example.json`: intentionally unfilled host evidence template, not an attestation.

See `docs/ACCEPTANCE.md` for the plan's 100-case traceability and `docs/HOST_COMPATIBILITY.md` for the real-host blocker/procedure. Source/runtime changes after these artifacts require rerunning tests; do not carry forward the pass count as a future release attestation.

## Next execution sequence on a connected qualification machine

```sh
nvm install
nvm use
npm run bootstrap
npm run build
npm run typecheck
npm test
npm audit
```

Then perform the owner-authorized target deployment/backup/proxy checks and actual ordinary-tab host story, record sanitized host evidence, and run `npm run verify`. `npm ci` becomes the clean-install command only after the generated exact dependency manifests are reviewed and committed. This is unfinished release qualification, not a promise of background work or a silently granted deployment authorization.
