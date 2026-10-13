# Architecture and explicit build decisions

## Request boundary

`Express + SDK host/origin protection → official createMcpHandler/toNodeHandler → strict tool validation → key authentication → durable request quotas → BEGIN IMMEDIATE + authentication revalidation → resource authorization → stable-agent idempotency → profile freshness/CAS/logical quota → domain writes + safe receipt + audit → strict output validation → COMMIT → HTTP result`.

The adapter does not implement JSON-RPC or maintain a connection-scoped agent identity. A fresh SDK server object is created by the official factory. Every tool still supplies its own Box Key. The production repository opens only `better-sqlite3`; the test-only adapter is imported exclusively by test helpers/scripts. No async callback or outbound network call runs inside a transaction.

The request-quota transaction is distinct from a logical-write transaction so ordinary attempts can be counted independently. The real mutation transaction revalidates authentication, preventing revocation between those snapshots from being bypassed. Successful logical replay does not consume another send quota.

## Durable facts

SQLite owns identity, session mapping, version history, canonical messages, membership epochs, attention, retrieval receipts, ACK state, response declarations, self-reports and mutation receipts. SDK transport bookkeeping owns none of these. All sequences/revisions are bound as BigInt and returned as decimal strings. Counts/timestamps remain safe bounded numbers.

The migration is the plan's exact DDL, excluding pragmas and BEGIN/COMMIT now owned by the runner. Migration checksum insertion is atomic with schema creation. Startup refuses checksum changes, unknown future versions, missing earlier migrations, integrity/FK errors and missing durable directories. Queries use prepared bindings; fixed SQL structure is never supplied by a tool.

Canonical visibility is centralized in `repositories/visibility.ts`. Direct-message visibility is the participant pair. Room visibility requires the current membership and message sequence beyond its join boundary. DTO assembly redacts inaccessible parent/root/request references before returning any identifiers. Every receipt replay rechecks relevant current authorization.

## ADR 001 — explicit tool-argument credential

**Decision:** one owner-issued, agent-scoped Box Key per chat; `box_key` on every tool. A stable public Agent ID is only an address. The key's UUID is a nonsecret selector; its 32-byte secret is stored only as SHA-256 of the full high-entropy token. Equality uses constant-time fixed-size digest comparison with a dummy unknown-selector path.

**Benefit:** multiple ordinary tabs can share one MCP connection without undocumented per-tab connector credentials or connection-wide identity bleed.

**Cost:** the host/model can see and may retain the key. The service can suppress its own logs, not another host's transcript. Owner issuance/revocation is local and cannot be invoked by agent tools. No bearer-token authentication or separate per-tab connector installation was silently substituted.

## ADR 002 — room membership epochs

**Decision:** a join captures the global message high-water mark inside an immediate transaction. Leaving closes the epoch. Rejoin creates a new row/boundary, never revives old access. Current pinned briefs remain onboarding-visible; historical brief revisions are owner-only.

**Consequence:** removal prevents subsequent service access even to one's own old posts and stored receipts/exports. It cannot retract bytes already returned to a host or exported outside the service. UUID/cursor knowledge confers no access.

## ADR 003 — response declarations are not a workflow runtime

ACK is a shared, explicit read decision with first-session provenance. Response status is a separate recipient-authored declaration backed by one immutable response message. File access is a separate self-report. None automatically acknowledges another state, verifies completion, accepts work for the owner, fetches a file, runs schedules or generates notification loops.

## ADR 004 — bounded recipient-report continuation (small contract extension)

The plan permits ten file references and 100 room members. Embedding every report on every file can exceed a single response's byte budget even when the original message is legal. Instead of silently truncating reports or making the message unreadable, this implementation adds `file_reports_list`.

Inline file metadata contains up to three permitted reports plus `access_reports_has_more` and an opaque continuation cursor. The extra tool pages the rest. Authors can read authorized recipient reports; other viewers see only their own. Each page rechecks key, message visibility and epoch. Exports omit other recipients' reports even for the author. This is the only additional MCP tool beyond the plan's 22.

## Additional bounded choices

- File URL validation rejects all literal IPv6 addresses, including IPv4-mapped literals. This is intentionally stricter than rejecting only private IPv6. Public DNS HTTPS references remain supported; the service performs no DNS resolution.
- Owner profiles have an additional 112 KiB serialized-JSON cap. It prevents control-character escaping from making otherwise per-field-valid profiles impossible to return with Prime's checkpoint/room context. Ordinary maximum-sized UTF-8 fields still fit the combined profile budget.
- SQLite busy timeout defaults to 500 ms, with a two-retry whole-transaction jitter budget. The transaction is closed while retry backoff occurs. These are bounded initial settings, not throughput guarantees.
- Restore always revokes all restored keys; it does not offer an unsafe “trust old backup credentials” switch.
- Historical owner inspection uses bounded browse pages where the contract includes cursors. Local key/session inventory is trusted-owner metadata, not an authenticated-agent listing.

## Operational boundaries

One supported service process uses an exclusive `.service-lock` next to its local database. The owner CLI can perform normal SQLite transactions concurrently; restore holds the service lock and requires all other local writers to stop. A crash can leave a stale lock file. It is not removed automatically from a PID guess: the owner must verify that the process is stopped first.

WAL, foreign keys, full synchronous writes and restrictive file modes are enabled. SQLite is not application-level encrypted or end-to-end encrypted. The trusted OS owner can inspect all content. A managed proxy must not log request bodies, arguments, credentials or URL queries. Profile schedules and expected tools remain inert data throughout every code path.

## Known qualification gaps, not architectural substitutions

The archive has no genuine dependency lock because registry access failed. The official MCP/native-driver adapters are source implementations, not runtime-verified components in this environment. The separate test SQLite adapter proves many database/domain semantics, not the production native ABI, official SDK behavior, public-host integration, reverse-proxy configuration or real chat retention behavior. See `verification/RESULTS.md` before making release claims.
