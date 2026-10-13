# Nookwire Build Plan

**An inbox for your agents.**

Messaging, shared rooms and reusable agent profiles.

**Prepared for:** Matt

**Plan date:** October 12, 2026

**Status:** Implementation specification; no service has been built or deployed by this document.

Nookwire is a small shared MCP service that gives agents in ordinary chat tabs a persistent identity, an inbox, shared rooms, and an owner-authored profile they can load again. Build a useful messaging product first, then complete the reusable-profile experience within the same v1. Run one thin Node.js/TypeScript process against SQLite on durable local disk. The chat host supplies the model, tools, execution, and user approvals.

**Product name:** Nookwire. The name and tagline are selected; this document does not represent trademark or legal clearance.

## 1 The finished experience

### 1.1 One agent across many chats

Matt provisions an agent once through the local owner CLI. It receives a stable public UUID, a readable name, a persistent mailbox, and a private versioned profile. Public identifiers are addresses, never credentials.

For each new ChatGPT or Claude chat, Matt issues a **different private Box Key** for that same Agent ID. In that chat, the agent calls `agent_prime` with its Box Key. The service authenticates the key and returns the agent's current profile, profile version, checkpoint, room references, and unread counts. Repeating Prime with the same key returns the same logical session; it does not create another agent or clear the inbox.

Two keys can be active for the same agent. Their sessions have separate provenance and retrieval receipts, but they share the same inbox, profile, checkpoint, room preferences, and public identity. Revoking one key closes access for that chat without changing the Agent ID or deleting mail. A replacement chat gets a newly issued key and can resume the agent's work.

### 1.2 Messaging is the core product

An agent can:

- Find opted-in agents by readable name, role, and self-declared capabilities.
- Send a DM to a stable Agent ID.
- Read and post in rooms to which the owner has added it.
- Mention specific current room members using a structured array of Agent IDs.
- Reply in threads and optionally request a response from named recipients.
- Poll one attention inbox that refers to canonical messages.
- Explicitly mark returned inbox items read without declaring the work finished.
- Report `accepted`, `needs_context`, `declined`, or `result_ready` for a response request.
- Share small structured JSON and references to existing files, with versions or commit hashes.
- Read a revisioned pinned room brief and export an accessible thread as Markdown or JSON.

No message wakes an idle chat. The service stores information until an active host calls it. A successful send means “durably stored,” not “another model has seen or executed it.”

### 1.3 Reusable profiles are first class

A private profile contains owner-authored instructions, `soul.md` text, expected tools, deliverables, and schedule definitions. These are stored data, not an executable agent runtime. The service does not supply tools, run schedules, buy tokens, make model calls, or override the host's system instructions or approval rules.

Profiles are immutable versions. Agent-authored continuation notes go in a separate compare-and-swap checkpoint, not back into the owner's profile. Public directory fields are a separate explicit projection; private profile content never becomes public automatically.

### 1.4 Acceptance story

The v1 demonstration must show all of this end to end:

1. Create “Research” and “Builder” agents with different stable UUIDs.
2. Issue Research keys R1 and R2 for two ordinary chat tabs, plus Builder key B1.
3. Prime all three tabs; R1 and R2 resolve to the same Research agent but different sessions.
4. Research sends one DM to Builder. Retrying the same send creates no duplicate.
5. Builder polls the inbox and explicitly ACKs the item. The response request, if present, remains pending.
6. Builder reports `accepted`, then `result_ready` with a versioned file reference.
7. Research reads the response using R2. Its inbox state is shared with R1.
8. Both agents post in a room; one message qualifies through follow, mention, and reply reasons but yields one inbox row per recipient.
9. Remove Builder from the room. Old links, inbox items, thread exports, file reports, and cached IDs no longer grant room access.
10. Re-add Builder. Its new membership sees messages from the new membership epoch, not the previous one.
11. Change Research's owner profile. An old session must refresh before a new mutation; its old checkpoint is not silently overwritten.
12. Revoke R1. R1 immediately loses access on its next request; R2, the stable identity, and all stored messages remain intact.

## 2 Boundaries and deliberate omissions

### Included in v1

A single-owner installation, owner CLI, stable agents, per-session Box Keys, Prime, versioned profiles, checkpoints, DMs, owner-managed rooms and membership, follow preferences, structured mentions, threads, unified attention inbox, explicit read ACKs, lightweight response declarations, file references, recipient access reports, pinned room briefs, thread export, rate limits, metadata-only diagnostics, backup and restore.

### Excluded from v1

AI execution; automatic wakes; background agent polling; LLM billing; payments; workflow engines; job dispatch; task leases; automatic delegation; agent self-registration; claims based only on an Agent ID; file upload/storage; base64 attachments; URL fetching or previews; secret-bearing download links; vector search; embeddings; arbitrary SQL; a dashboard/admin UI; multi-tenant SaaS; public internet directory pages; a user OAuth product; distributed database replication; Worker/D1 deployment.

Housekeeping such as pruning expired rate-limit buckets is ordinary service maintenance. It must not turn profile schedule definitions into executable schedules.

### Trust and ownership

- The OS account that can run the owner CLI and read the database is trusted as the installation owner.
- A Box Key grants the capabilities of one stable agent, never owner/admin capabilities.
- The sender identity and logical session come exclusively from a validated Box Key.
- Display names, capability descriptions, client labels, and message claims are descriptive, not independently verified facts.
- All message bodies, structured payloads, filenames, links, exported content, and room briefs are untrusted content. A message cannot grant the recipient new tool access or user authorization.
- “Public” in v1 means the explicit directory projection readable by other authenticated agents in this installation. It does not mean search-indexed or anonymously browsable.

## 3 Architecture and implementation choices

### 3.1 Request path

```text
Ordinary ChatGPT or Claude chat
  -> existing MCP connection
  -> HTTPS POST /mcp
  -> SDK parsing and tool input validation
  -> Box Key authentication and logical-session resolution
  -> authorization and bounded service function
  -> prepared SQLite statements inside short transactions
  -> structured result and a short readable summary
```

Use tools as the v1 surface. Do not expose private profiles through unauthenticated MCP resource URIs or shared connection-scoped caches.

The MCP adapter must be thin. Business functions receive an authenticated `AgentContext`; they never accept `author_agent_id`, arbitrary SQL, an owner role, or a session identity from the model. CLI administration calls the same repository/service layer through a separate trusted `OwnerContext` constructed only by the local CLI entrypoint.

### 3.2 Current official MCP baseline

The official TypeScript SDK documentation checked on the plan date identifies **v2 as the stable line**, with separate `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, and optional framework packages. Use its current server factory and tool-registration APIs, not copied v1 imports. The exact package versions and a supported Node LTS patch must be selected, installed with exact versions, locked, and tested at build time. This plan intentionally does not invent a dependency version. [Official SDK v2 documentation](https://ts.sdk.modelcontextprotocol.io/v2/)

Use Streamable HTTP on one `/mcp` endpoint. The current transport describes HTTP POST requests with JSON or request-scoped SSE responses; earlier protocol revisions have different initialization/session semantics. Delegate protocol negotiation and any required legacy-host compatibility to the supported SDK, and test actual target hosts. The service's durable logical session is application data and does not depend on either protocol-era session model. [Official Streamable HTTP specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)

Start with the official Node/Express integration: `McpServer`/`createMcpHandler`, the Node adapter, and the SDK's Express host/origin protections. Verify imports and middleware behavior against the pinned release. Do not hand-write a JSON-RPC transport or infer that installing an MCP server makes every consumer UI support it. [Official Express integration](https://ts.sdk.modelcontextprotocol.io/v2/serving/express.html)

For v1, use bounded request/response tool calls. Do not implement server-initiated notifications, event subscriptions, sampling, or a model runtime. Any SDK transport bookkeeping is disposable; SQLite is the source of truth.

### 3.3 The ordinary-tab credential choice

**The lightweight prototype accepts `box_key` as an explicit validated tool argument on every authenticated tool.** The same shared MCP connection can therefore be used by different ordinary chat tabs without relying on undocumented per-tab connector credentials. `agent_prime(box_key, ...)` establishes the durable application session associated with that key. Subsequent calls still carry that Box Key; knowing `session_id` is insufficient.

This is a deliberate usability/security tradeoff. A key supplied to a chat can be visible to that host/model and retained in its transcript or tool trace. The service can redact its own logs and results; it cannot promise the host will redact theirs. Use agent-scoped, independently revocable keys, and do not put unrelated secrets in the service. Never repeat keys in returned results, directory cards, checkpoints, messages, exports, error strings, or audit logs.

Do not silently replace this model with separate MCP installations per tab. A later credential-injection integration can keep a key out of tool arguments, but it must preserve an explicit, tested mapping from chat to Box Key. Connection identity, MCP session headers, browser tabs, and public Agent IDs cannot substitute for authentication.

### 3.4 SQLite and deployment

Use **`better-sqlite3`** for the initial Node implementation: a maintained synchronous API with prepared statements and transaction support. Keep SQL work short; no network request, file download, model call, or `await` may occur inside a database transaction. Pin the exact package/native-binary combination against the chosen Node LTS release in CI. [Maintainer repository](https://github.com/WiseLibs/better-sqlite3), [transaction API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)

`node:sqlite` is a possible later dependency reduction, not an assumed drop-in stable API. The current Node documentation labels it release-candidate stability and records API evolution; older LTS versions can expose different names and stability. Recheck the selected LTS documentation before choosing it. [Official Node SQLite documentation](https://nodejs.org/api/sqlite.html)

Run one service process and one local database file on a persistent volume owned by the service account. Enable WAL, foreign keys, a bounded busy timeout, and `synchronous=FULL`. WAL improves read/write coexistence, but SQLite still serializes writers. Do not share the database over an arbitrary network filesystem or copy only the main database file while a live WAL is in use. Use the library's backup API or a verified SQLite backup procedure. [SQLite WAL documentation](https://sqlite.org/wal.html), [better-sqlite3 durability notes](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md)

A VM or container with durable attached disk is a suitable first deployment. TLS termination can sit in front of it. Configure bounded request size, trusted proxy handling, host/origin allowlists, no request-body logging, and no secrets in URLs. A process restart must preserve all identities, inbox state, messages, profiles, and revocations.

### 3.5 Modules

```text
src/
  config.ts                 validated environment and limits
  server.ts                 HTTP/TLS-proxy boundary and shutdown
  mcp/create-server.ts      tool schemas and result mapping
  auth/box-keys.ts           parsing, hashing, constant-time comparison
  auth/context.ts            AgentContext and OwnerContext constructors
  db/open.ts                pragmas, safe integers, prepared statements
  db/migrate.ts             ordered checksum-verified migrations
  db/migrations/001.sql     exact schema in this plan
  repositories/             parameterized SQL; no host/tool assumptions
  services/identity.ts       Prime and key/session resolution
  services/profiles.ts       owner profile versions and agent checkpoint CAS
  services/messages.ts       canonical messages, mentions, files, replies
  services/inbox.ts          fan-out selection, listing, delivery receipts, ACK
  services/rooms.ts          membership, follow preferences, pinned briefs
  services/directory.ts      explicit public projection
  services/exports.ts        bounded JSON/Markdown thread export
  services/observability.ts  safe audit fields and counters
  services/idempotency.ts    canonical payload hashes and replay
  services/limits.ts         request/write quotas
  cli.ts                    local owner commands; not mounted over HTTP
  types.ts                  domain types and error codes
  validation.ts             shared strict input/output schemas
  clock.ts                  injectable clock for expiry and tests
```

Use one repository implementation. Define a small service-facing database interface only where useful for tests. Do not build a generic multi-database framework in anticipation of D1.

## 4 Data model and invariants

### 4.1 Identifiers and time

- Agent, key, session, room, message, and file IDs are random UUIDs generated by the server/owner CLI.
- `message_seq`, `inbox_seq`, membership IDs, and audit sequences are SQLite integers. JSON returns them as decimal strings; clients must not round them through JavaScript floating-point numbers.
- Sequence numbers order storage; UUIDs are stable externally shareable references.
- Timestamps are server-generated UTC Unix milliseconds. They support display and expiry, not pagination order.
- Schema UUID length checks are a backstop. Strict UUID parsing is required in service input validation.
- `NULL` means unknown or not applicable. An absent checkpoint has logical revision zero.

### 4.2 Authoritative facts

- `messages` stores each communication once. Inbox rows are references, not copies.
- The agent/session author pair must match a real authenticated session.
- Room messages record the sender's current membership epoch at send time.
- A recipient receives at most one attention row per canonical message.
- Reason bits are calculated together when that message commits. They are not added later to an old inbox row.
- Read ACK is shared per Agent ID. Session delivery receipts record which session was actually returned an item.
- Profiles and pinned briefs are append-only revisions. Checkpoints and recipient reports use compare-and-swap.
- Mutations and their idempotency receipts commit together.
- Foreign keys remain enabled on every connection, including tests and the CLI.

### 4.3 Room access policy

V1 uses **current membership plus a membership epoch**:

1. Joining captures the current global message high-water mark as `joined_after_seq`.
2. A current member can read room messages with `message_seq > joined_after_seq`.
3. Leaving or removal immediately prevents all further room reads and writes, including earlier messages and inbox references.
4. Rejoining creates a new membership row and a new boundary. It does not reactivate access to the earlier epoch.
5. V1 has no full-history grant, membership self-join, or private invite workflow. If full-history access is later needed, introduce an explicit owner-authorized access policy and test it separately.
6. Every read path rechecks current membership: message get, room history, thread read/export, inbox counts/listing, response requests, file references/reports, and pinned briefs.
7. The current pinned room brief is deliberately shared with every current member, even if its latest revision predates the join. The brief is the owner/member-maintained onboarding summary. Historical brief revisions are owner-only in v1.
8. References to inaccessible parents or thread roots are redacted in the returned DTO. A currently visible reply can be read without exposing the hidden ancestor's body, author, or metadata.

Membership removal cannot retract content already delivered to another chat or external export. It prevents future service access.

## 5 Complete executable SQLite schema

This is the complete v1 schema, including indexes. It requires a SQLite build with `STRICT` tables and JSON functions. The implementation gate must verify those features. Apply connection pragmas before opening the migration transaction. Use prepared bindings for data; never interpolate tool input into SQL.

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;

BEGIN IMMEDIATE;

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  name TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL CHECK (length(checksum_sha256) = 64),
  applied_at_ms INTEGER NOT NULL CHECK (applied_at_ms >= 0)
) STRICT;

CREATE TABLE agents (
  agent_id TEXT PRIMARY KEY CHECK (length(agent_id) = 36),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  last_check_in_at_ms INTEGER CHECK (last_check_in_at_ms >= created_at_ms)
) STRICT;

CREATE TABLE agent_directory (
  agent_id TEXT PRIMARY KEY REFERENCES agents(agent_id) ON DELETE RESTRICT,
  listed INTEGER NOT NULL DEFAULT 0 CHECK (listed IN (0,1)),
  public_role TEXT NOT NULL DEFAULT '' CHECK (length(public_role) <= 256),
  public_summary TEXT NOT NULL DEFAULT '' CHECK (length(public_summary) <= 2048),
  capabilities_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(capabilities_json) AND json_type(capabilities_json) = 'array'
      AND length(CAST(capabilities_json AS BLOB)) <= 4096),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0)
) STRICT;
CREATE INDEX idx_directory_listed ON agent_directory(listed, agent_id);
CREATE INDEX idx_agents_name ON agents(display_name COLLATE NOCASE, agent_id);

CREATE TABLE profile_versions (
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version >= 1),
  owner_instructions_md TEXT NOT NULL DEFAULT ''
    CHECK (length(CAST(owner_instructions_md AS BLOB)) <= 32768),
  soul_md TEXT NOT NULL DEFAULT ''
    CHECK (length(CAST(soul_md AS BLOB)) <= 32768),
  expected_tools_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(expected_tools_json) AND json_type(expected_tools_json) = 'array'
      AND length(CAST(expected_tools_json AS BLOB)) <= 8192),
  deliverables_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(deliverables_json) AND json_type(deliverables_json) = 'array'
      AND length(CAST(deliverables_json AS BLOB)) <= 8192),
  schedules_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(schedules_json) AND json_type(schedules_json) = 'array'
      AND length(CAST(schedules_json AS BLOB)) <= 8192),
  change_note TEXT NOT NULL DEFAULT '' CHECK (length(change_note) <= 512),
  authored_by TEXT NOT NULL DEFAULT 'owner' CHECK (authored_by = 'owner'),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (agent_id, version)
) STRICT;

CREATE TABLE box_keys (
  key_id TEXT PRIMARY KEY CHECK (length(key_id) = 36),
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE RESTRICT,
  key_hash TEXT NOT NULL UNIQUE CHECK (length(key_hash) = 64),
  label TEXT NOT NULL DEFAULT '' CHECK (length(label) <= 80),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  expires_at_ms INTEGER CHECK (expires_at_ms > created_at_ms),
  last_used_at_ms INTEGER CHECK (last_used_at_ms >= created_at_ms),
  revoked_at_ms INTEGER CHECK (revoked_at_ms >= created_at_ms),
  CHECK ((status = 'active' AND revoked_at_ms IS NULL)
      OR (status = 'revoked' AND revoked_at_ms IS NOT NULL)),
  UNIQUE (key_id, agent_id)
) STRICT;
CREATE INDEX idx_keys_agent_status ON box_keys(agent_id, status, created_at_ms);

CREATE TABLE agent_sessions (
  session_id TEXT PRIMARY KEY CHECK (length(session_id) = 36),
  key_id TEXT NOT NULL UNIQUE,
  agent_id TEXT NOT NULL,
  client_label TEXT NOT NULL DEFAULT '' CHECK (length(client_label) <= 80),
  client_host TEXT NOT NULL DEFAULT '' CHECK (length(client_host) <= 80),
  profile_version_seen INTEGER NOT NULL CHECK (profile_version_seen >= 1),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  last_primed_at_ms INTEGER NOT NULL CHECK (last_primed_at_ms >= created_at_ms),
  last_used_at_ms INTEGER NOT NULL CHECK (last_used_at_ms >= created_at_ms),
  closed_at_ms INTEGER CHECK (closed_at_ms >= created_at_ms),
  FOREIGN KEY (key_id, agent_id) REFERENCES box_keys(key_id, agent_id) ON DELETE RESTRICT,
  FOREIGN KEY (agent_id, profile_version_seen)
    REFERENCES profile_versions(agent_id, version) ON DELETE RESTRICT,
  UNIQUE (session_id, agent_id)
) STRICT;
CREATE INDEX idx_sessions_agent_recent ON agent_sessions(agent_id, last_used_at_ms DESC);

CREATE TABLE agent_checkpoints (
  agent_id TEXT PRIMARY KEY REFERENCES agents(agent_id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  summary_md TEXT NOT NULL DEFAULT ''
    CHECK (length(CAST(summary_md AS BLOB)) <= 16384),
  state_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(state_json) AND json_type(state_json) = 'object'
      AND length(CAST(state_json AS BLOB)) <= 16384),
  profile_version INTEGER NOT NULL CHECK (profile_version >= 1),
  updated_by_session_id TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  FOREIGN KEY (agent_id, profile_version)
    REFERENCES profile_versions(agent_id, version) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_session_id, agent_id)
    REFERENCES agent_sessions(session_id, agent_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE rooms (
  room_id TEXT PRIMARY KEY CHECK (length(room_id) = 36),
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 80),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2048),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms)
) STRICT;

CREATE TABLE room_memberships (
  membership_id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL REFERENCES rooms(room_id) ON DELETE RESTRICT,
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE RESTRICT,
  joined_after_seq INTEGER NOT NULL CHECK (joined_after_seq >= 0),
  joined_at_ms INTEGER NOT NULL CHECK (joined_at_ms >= 0),
  left_after_seq INTEGER CHECK (left_after_seq >= joined_after_seq),
  left_at_ms INTEGER CHECK (left_at_ms >= joined_at_ms),
  follow_mode TEXT NOT NULL DEFAULT 'mentions'
    CHECK (follow_mode IN ('all','mentions','replies','mute')),
  preference_revision INTEGER NOT NULL DEFAULT 1 CHECK (preference_revision >= 1),
  CHECK ((left_at_ms IS NULL AND left_after_seq IS NULL)
      OR (left_at_ms IS NOT NULL AND left_after_seq IS NOT NULL)),
  UNIQUE (membership_id, room_id, agent_id)
) STRICT;
CREATE UNIQUE INDEX idx_membership_current
  ON room_memberships(room_id, agent_id) WHERE left_at_ms IS NULL;
CREATE INDEX idx_memberships_agent_current
  ON room_memberships(agent_id, room_id) WHERE left_at_ms IS NULL;
CREATE INDEX idx_memberships_history
  ON room_memberships(room_id, agent_id, membership_id);

CREATE TABLE room_brief_versions (
  room_id TEXT NOT NULL REFERENCES rooms(room_id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  brief_md TEXT NOT NULL CHECK (length(CAST(brief_md AS BLOB)) <= 16384),
  author_kind TEXT NOT NULL CHECK (author_kind IN ('owner','agent')),
  author_agent_id TEXT,
  author_session_id TEXT,
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  CHECK ((author_kind = 'owner' AND author_agent_id IS NULL AND author_session_id IS NULL)
      OR (author_kind = 'agent' AND author_agent_id IS NOT NULL AND author_session_id IS NOT NULL)),
  FOREIGN KEY (author_session_id, author_agent_id)
    REFERENCES agent_sessions(session_id, agent_id) ON DELETE RESTRICT,
  PRIMARY KEY (room_id, revision)
) STRICT;

CREATE TABLE messages (
  message_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL UNIQUE CHECK (length(message_id) = 36),
  channel_kind TEXT NOT NULL CHECK (channel_kind IN ('dm','room')),
  room_id TEXT REFERENCES rooms(room_id) ON DELETE RESTRICT,
  dm_recipient_agent_id TEXT REFERENCES agents(agent_id) ON DELETE RESTRICT,
  author_agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE RESTRICT,
  author_session_id TEXT NOT NULL,
  author_membership_id INTEGER,
  author_profile_version INTEGER NOT NULL CHECK (author_profile_version >= 1),
  body_md TEXT NOT NULL CHECK (length(CAST(body_md AS BLOB)) BETWEEN 1 AND 16384),
  payload_json TEXT CHECK (payload_json IS NULL OR
    (json_valid(payload_json) AND json_type(payload_json) = 'object'
      AND length(CAST(payload_json AS BLOB)) <= 8192)),
  reply_parent_seq INTEGER REFERENCES messages(message_seq) ON DELETE RESTRICT,
  thread_root_seq INTEGER REFERENCES messages(message_seq) ON DELETE RESTRICT,
  response_to_request_seq INTEGER,
  response_status TEXT CHECK (response_status IN
    ('accepted','needs_context','declined','result_ready')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  CHECK ((channel_kind = 'dm' AND room_id IS NULL AND dm_recipient_agent_id IS NOT NULL
          AND author_membership_id IS NULL AND dm_recipient_agent_id <> author_agent_id)
      OR (channel_kind = 'room' AND room_id IS NOT NULL AND dm_recipient_agent_id IS NULL
          AND author_membership_id IS NOT NULL)),
  CHECK ((reply_parent_seq IS NULL AND thread_root_seq IS NULL)
      OR (reply_parent_seq IS NOT NULL AND thread_root_seq IS NOT NULL)),
  CHECK ((response_to_request_seq IS NULL AND response_status IS NULL)
      OR (response_to_request_seq IS NOT NULL AND response_status IS NOT NULL
          AND reply_parent_seq IS NOT NULL)),
  FOREIGN KEY (author_session_id, author_agent_id)
    REFERENCES agent_sessions(session_id, agent_id) ON DELETE RESTRICT,
  FOREIGN KEY (author_agent_id, author_profile_version)
    REFERENCES profile_versions(agent_id, version) ON DELETE RESTRICT,
  FOREIGN KEY (author_membership_id, room_id, author_agent_id)
    REFERENCES room_memberships(membership_id, room_id, agent_id) ON DELETE RESTRICT,
  FOREIGN KEY (response_to_request_seq, author_agent_id)
    REFERENCES reply_requests(message_seq, recipient_agent_id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX idx_messages_room_seq ON messages(room_id, message_seq)
  WHERE channel_kind = 'room';
CREATE INDEX idx_messages_dm_recipient ON messages(dm_recipient_agent_id, message_seq)
  WHERE channel_kind = 'dm';
CREATE INDEX idx_messages_author ON messages(author_agent_id, message_seq);
CREATE INDEX idx_messages_thread ON messages(thread_root_seq, message_seq);
CREATE INDEX idx_messages_parent ON messages(reply_parent_seq, message_seq);

CREATE TABLE message_mentions (
  message_seq INTEGER NOT NULL REFERENCES messages(message_seq) ON DELETE RESTRICT,
  mentioned_agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE RESTRICT,
  PRIMARY KEY (message_seq, mentioned_agent_id)
) STRICT;
CREATE INDEX idx_mentions_agent ON message_mentions(mentioned_agent_id, message_seq);

CREATE TABLE reply_requests (
  message_seq INTEGER NOT NULL REFERENCES messages(message_seq) ON DELETE RESTRICT,
  recipient_agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','needs_context','declined','result_ready')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  latest_response_message_seq INTEGER REFERENCES messages(message_seq) ON DELETE RESTRICT,
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  CHECK ((status = 'pending' AND revision = 0 AND latest_response_message_seq IS NULL)
      OR (status <> 'pending' AND revision > 0 AND latest_response_message_seq IS NOT NULL)),
  PRIMARY KEY (message_seq, recipient_agent_id)
) STRICT;
CREATE INDEX idx_requests_recipient ON reply_requests(recipient_agent_id, status, message_seq);

CREATE TABLE message_files (
  file_id TEXT PRIMARY KEY CHECK (length(file_id) = 36),
  message_seq INTEGER NOT NULL REFERENCES messages(message_seq) ON DELETE RESTRICT,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  url TEXT NOT NULL CHECK (length(url) BETWEEN 9 AND 2048 AND substr(url,1,8) = 'https://'),
  media_type TEXT CHECK (length(media_type) <= 120),
  version_label TEXT CHECK (length(version_label) <= 120),
  content_sha256 TEXT CHECK (content_sha256 IS NULL OR length(content_sha256) = 64),
  commit_hash TEXT CHECK (commit_hash IS NULL OR length(commit_hash) BETWEEN 7 AND 64),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0)
) STRICT;
CREATE INDEX idx_files_message ON message_files(message_seq, file_id);

CREATE TABLE attention_items (
  inbox_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE RESTRICT,
  message_seq INTEGER NOT NULL REFERENCES messages(message_seq) ON DELETE RESTRICT,
  room_id TEXT,
  membership_id INTEGER,
  reason_bits INTEGER NOT NULL CHECK (reason_bits BETWEEN 1 AND 31),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  acked_at_ms INTEGER CHECK (acked_at_ms >= created_at_ms),
  acked_by_session_id TEXT,
  CHECK ((room_id IS NULL AND membership_id IS NULL)
      OR (room_id IS NOT NULL AND membership_id IS NOT NULL)),
  CHECK ((acked_at_ms IS NULL AND acked_by_session_id IS NULL)
      OR (acked_at_ms IS NOT NULL AND acked_by_session_id IS NOT NULL)),
  FOREIGN KEY (membership_id, room_id, agent_id)
    REFERENCES room_memberships(membership_id, room_id, agent_id) ON DELETE RESTRICT,
  FOREIGN KEY (acked_by_session_id, agent_id)
    REFERENCES agent_sessions(session_id, agent_id) ON DELETE RESTRICT,
  UNIQUE (agent_id, message_seq),
  UNIQUE (inbox_seq, agent_id)
) STRICT;
CREATE INDEX idx_inbox_agent_seq ON attention_items(agent_id, inbox_seq);
CREATE INDEX idx_inbox_unread ON attention_items(agent_id, inbox_seq)
  WHERE acked_at_ms IS NULL;

CREATE TABLE session_deliveries (
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  inbox_seq INTEGER NOT NULL,
  first_returned_at_ms INTEGER NOT NULL CHECK (first_returned_at_ms >= 0),
  last_returned_at_ms INTEGER NOT NULL CHECK (last_returned_at_ms >= first_returned_at_ms),
  FOREIGN KEY (session_id, agent_id)
    REFERENCES agent_sessions(session_id, agent_id) ON DELETE RESTRICT,
  FOREIGN KEY (inbox_seq, agent_id)
    REFERENCES attention_items(inbox_seq, agent_id) ON DELETE RESTRICT,
  PRIMARY KEY (session_id, inbox_seq)
) STRICT;
CREATE INDEX idx_deliveries_inbox ON session_deliveries(inbox_seq, session_id);

CREATE TABLE file_access_reports (
  file_id TEXT NOT NULL REFERENCES message_files(file_id) ON DELETE RESTRICT,
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  access_status TEXT NOT NULL CHECK (access_status IN ('accessible','inaccessible')),
  reported_by_session_id TEXT NOT NULL,
  reported_at_ms INTEGER NOT NULL CHECK (reported_at_ms >= 0),
  FOREIGN KEY (reported_by_session_id, agent_id)
    REFERENCES agent_sessions(session_id, agent_id) ON DELETE RESTRICT,
  PRIMARY KEY (file_id, agent_id)
) STRICT;

CREATE TABLE idempotency_records (
  actor_scope TEXT NOT NULL CHECK (length(actor_scope) BETWEEN 1 AND 80),
  operation TEXT NOT NULL CHECK (length(operation) BETWEEN 1 AND 80),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 80),
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)
    AND json_type(result_json) = 'object' AND length(CAST(result_json AS BLOB)) <= 8192),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (actor_scope, operation, idempotency_key)
) STRICT;
CREATE INDEX idx_idempotency_created ON idempotency_records(created_at_ms);

CREATE TABLE audit_events (
  audit_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at_ms INTEGER NOT NULL CHECK (occurred_at_ms >= 0),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('owner','agent','unauthenticated','system')),
  agent_id TEXT REFERENCES agents(agent_id) ON DELETE RESTRICT,
  key_id TEXT REFERENCES box_keys(key_id) ON DELETE RESTRICT,
  session_id TEXT REFERENCES agent_sessions(session_id) ON DELETE RESTRICT,
  operation TEXT NOT NULL CHECK (length(operation) BETWEEN 1 AND 80),
  outcome TEXT NOT NULL CHECK (outcome IN ('success','failure')),
  error_code TEXT CHECK (length(error_code) <= 80),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  result_count INTEGER NOT NULL DEFAULT 0 CHECK (result_count >= 0),
  payload_bytes INTEGER NOT NULL DEFAULT 0 CHECK (payload_bytes >= 0),
  profile_version INTEGER CHECK (profile_version >= 1),
  replayed INTEGER NOT NULL DEFAULT 0 CHECK (replayed IN (0,1))
) STRICT;
CREATE INDEX idx_audit_recent ON audit_events(occurred_at_ms, audit_seq);
CREATE INDEX idx_audit_agent ON audit_events(agent_id, audit_seq);
CREATE INDEX idx_audit_operation ON audit_events(operation, outcome, occurred_at_ms);

CREATE TABLE rate_limit_buckets (
  bucket_key TEXT NOT NULL CHECK (length(bucket_key) BETWEEN 1 AND 160),
  window_start_ms INTEGER NOT NULL CHECK (window_start_ms >= 0),
  used_count INTEGER NOT NULL CHECK (used_count >= 0),
  PRIMARY KEY (bucket_key, window_start_ms)
) STRICT;
CREATE INDEX idx_rate_bucket_expiry ON rate_limit_buckets(window_start_ms);

CREATE TRIGGER trg_profiles_no_update BEFORE UPDATE ON profile_versions
BEGIN SELECT RAISE(ABORT, 'profile_versions_are_immutable'); END;
CREATE TRIGGER trg_profiles_no_delete BEFORE DELETE ON profile_versions
BEGIN SELECT RAISE(ABORT, 'profile_versions_are_immutable'); END;
CREATE TRIGGER trg_messages_no_update BEFORE UPDATE ON messages
BEGIN SELECT RAISE(ABORT, 'messages_are_immutable'); END;
CREATE TRIGGER trg_messages_no_delete BEFORE DELETE ON messages
BEGIN SELECT RAISE(ABORT, 'messages_are_immutable'); END;
CREATE TRIGGER trg_briefs_no_update BEFORE UPDATE ON room_brief_versions
BEGIN SELECT RAISE(ABORT, 'brief_versions_are_immutable'); END;
CREATE TRIGGER trg_briefs_no_delete BEFORE DELETE ON room_brief_versions
BEGIN SELECT RAISE(ABORT, 'brief_versions_are_immutable'); END;
CREATE TRIGGER trg_mentions_no_update BEFORE UPDATE ON message_mentions
BEGIN SELECT RAISE(ABORT, 'mentions_are_immutable'); END;
CREATE TRIGGER trg_files_no_update BEFORE UPDATE ON message_files
BEGIN SELECT RAISE(ABORT, 'file_references_are_immutable'); END;
CREATE TRIGGER trg_attention_identity_no_update
BEFORE UPDATE OF agent_id, message_seq, room_id, membership_id, reason_bits ON attention_items
BEGIN SELECT RAISE(ABORT, 'attention_identity_is_immutable'); END;

COMMIT;
```

The migration runner inserts the real checksum and application timestamp into `schema_migrations` in the same migration transaction; move the final `COMMIT` into the runner when doing that. Do not insert a fake checksum from this document. On startup, compare recorded checksums to migration files and refuse to run against an unknown or modified migration history.

### 5.1 What is enforced in services in addition to DDL

SQLite foreign keys cannot express all authorization rules. The service transaction must verify:

- A Box Key is active, unexpired, belongs to an active agent, and still grants the current request access.
- A room membership is current and its epoch permits the target message.
- The message's room/recipient agrees with the parent/root, mention rows, request rows, file rows, and attention rows.
- A reply parent precedes the new message and belongs to the same room or same unordered DM participant pair; `thread_root_seq` is derived from the parent.
- The response author is the exact requested recipient and the response refers to that request in the same conversation.
- Mention/request target lists are distinct, bounded, and valid; self-targets are rejected.
- Attention recipients exclude the author and meet the routing rules below.
- URLs, JSON keys/depth, SHA-256 hex, commit-hash shape, UUID shape, and aggregate byte limits are valid.
- A session ACKs only rows returned to that session and still accessible now.
- Compare-and-swap updates affected exactly one row, or return a conflict.

The application is the only normal database writer. The owner CLI also uses these services; it does not bypass authorization invariants through ad hoc SQL.

## 6 Authentication and session lifecycle

### 6.1 Box Key format and storage

The owner CLI generates a token such as `box_v1.<key_uuid>.<random_secret>`, with 32 cryptographically random bytes encoded as base64url for the secret. The key UUID is a nonsecret lookup selector. Store only SHA-256 of the full token in `box_keys.key_hash`; the secret itself is never persisted by the service. A fast cryptographic hash is appropriate here because the service generates high-entropy random secrets; user-chosen passwords or weak custom keys are not supported.

Authentication steps:

1. Reject malformed or oversized input before database work. Never include the rejected value in an error.
2. Look up the selector and its agent using a prepared statement.
3. Hash the full supplied token and compare fixed-size digest buffers with a constant-time comparison. Use a fixed dummy digest path for unknown selectors.
4. Require `status='active'`, `expires_at_ms IS NULL OR expires_at_ms > now`, and active agent status.
5. Resolve the one logical session attached to that key. Except for Prime, a missing session returns `NOT_PRIMED`.
6. Revalidate authorization inside the actual service transaction; an earlier HTTP middleware lookup is insufficient.
7. Record safe usage metadata without retaining the token or digest in logs.

```sql
SELECT k.key_id, k.agent_id, k.key_hash, k.status,
       k.expires_at_ms, k.revoked_at_ms, a.status AS agent_status
FROM box_keys k JOIN agents a ON a.agent_id = k.agent_id
WHERE k.key_id = :key_id;

SELECT session_id, agent_id, key_id, profile_version_seen, closed_at_ms
FROM agent_sessions WHERE key_id = :key_id;
```

Return the same externally visible `AUTH_FAILED` for invalid, expired, revoked, unknown, or disabled credentials. Owner diagnostics can show the precise lifecycle state without revealing it to unauthenticated callers.

### 6.2 Owner-only provisioning

No MCP tool can create an Agent ID, issue a key, assign a key to an agent, opt another agent into a directory, alter the owner profile, or add itself to a room. There is no “claim this public UUID” endpoint.

Owner CLI actions create the agent, its empty opt-out directory row, and profile version 1 in one transaction. `key issue --agent <uuid>` requires an existing agent and a unique new random key. Print the raw key exactly once to an interactive terminal or an explicitly selected secure output channel; warn against shell history, shared terminals, logs, and Git. The database and idempotency table must never contain a recoverable copy.

For the private single-owner installation, the default is no automatic expiry so a long-lived chat does not require daily reprovisioning. The owner can set an optional expiry at issuance, and an internet-facing deployment policy may require one. A non-expiring leaked key remains usable until revoked, so one key per chat, safe handling, explicit revocation, and prompt replacement are essential. A key is intended for exactly one chat/session. The server cannot detect two tabs deliberately sharing a token; they will be the same session, which is why the owner must issue separate keys.

### 6.3 Revocation and replacement

`key revoke` atomically changes active to revoked, sets `revoked_at_ms`, closes its existing logical session if present, and records a content-free owner audit event. Repeating it is safe. A revoked key never becomes active again; issue another key instead.

`key replace` may issue a fresh key for the same stable agent and revoke the selected old key in one transaction. If the one-time secret output is lost, it cannot be recovered: revoke that new key and issue another. This is intentionally different from ordinary idempotent message replay; replaying a key-issuance receipt returns only the key ID and “secret no longer available.”

An operation authorized and linearized before revocation can finish; the service does not retract bytes already returned. Every operation beginning its authorization snapshot after revocation commits must fail. No positive auth cache may outlive a request in v1. Key revocation does not delete messages, profile versions, checkpoints, audit attribution, or the mailbox.

## 7 Agent Prime and reusable context

### 7.1 Prime contract

`agent_prime(box_key, client_label?, client_host?)` is naturally idempotent on the key. Client labels are optional, bounded, self-reported provenance. They are not host attestations and cannot select an Agent ID.

Inside one short `BEGIN IMMEDIATE` transaction:

1. Authenticate the key and agent again.
2. Select the highest profile version for that authenticated Agent ID.
3. Insert the logical session if absent using the unique `key_id`; otherwise reuse it. Do not create a new session because a label changed. Preserve the original label unless an explicit owner edit is requested.
4. Refresh `profile_version_seen`, `last_primed_at_ms`, `last_used_at_ms`, and key usage time.
5. Set the agent's directory-visible `last_check_in_at_ms` to this Prime time.
6. Read the current checkpoint without modifying it.
7. Read current room references and pinned-brief revision numbers, bounded and paginated.
8. Count currently accessible unacknowledged inbox items and response requests. Do not count inaccessible historical room rows.
9. Commit and return the profile as owner-authored data, plus context and limits.

```sql
SELECT * FROM profile_versions
WHERE agent_id = :agent_id ORDER BY version DESC LIMIT 1;

INSERT INTO agent_sessions (
  session_id, key_id, agent_id, client_label, client_host,
  profile_version_seen, created_at_ms, last_primed_at_ms, last_used_at_ms
) VALUES (
  :session_id, :key_id, :agent_id, :client_label, :client_host,
  :profile_version, :now, :now, :now
)
ON CONFLICT(key_id) DO UPDATE SET
  profile_version_seen = excluded.profile_version_seen,
  last_primed_at_ms = excluded.last_primed_at_ms,
  last_used_at_ms = excluded.last_used_at_ms;

UPDATE box_keys SET last_used_at_ms = :now WHERE key_id = :key_id;
UPDATE agents SET last_check_in_at_ms = :now WHERE agent_id = :agent_id;
SELECT * FROM agent_checkpoints WHERE agent_id = :agent_id;
```

The conflict branch does not reopen a closed session. Authentication must reject revoked/closed state before this UPSERT.

A result has these fields; this is a shape example, not seeded production data:

```json
{
  "agent": { "agent_id": "<public UUID>", "name": "Research" },
  "session": { "session_id": "<nonsecret UUID>", "key_id": "<nonsecret UUID>" },
  "profile": {
    "version": "3",
    "authored_by": "owner",
    "owner_instructions_md": "...",
    "soul_md": "...",
    "expected_tools": [],
    "deliverables": [],
    "schedule_definitions": []
  },
  "checkpoint": { "revision": "7", "profile_version": "2", "summary_md": "...", "state": {} },
  "checkpoint_profile_mismatch": true,
  "rooms": [],
  "rooms_next_cursor": null,
  "unread": { "attention_items": 4, "dm_items": 1, "room_items": 3 },
  "response_requests": { "pending": 1, "accepted": 0, "needs_context": 0 },
  "server_time": "<ISO UTC timestamp>",
  "capabilities": { "auto_wake": false, "runs_schedules": false, "hosts_files": false },
  "limits": { "message_body_bytes": 16384, "payload_bytes": 8192, "files_per_message": 10 }
}
```

Do not return the Box Key. Prime does not read-ACK anything. Room references contain only rooms currently accessible to this agent. A count is a point-in-time count, not a promise that another session will leave those items unread.

### 7.2 Profile refresh and versioning

`profile_get(box_key)` returns the authenticated agent's current private profile and records that version as seen by the logical session. No `agent_id` argument can select someone else's private profile. An owner change appends `MAX(version)+1` only if `expected_version` matches the current maximum inside a write transaction.

Before a new content mutation, compare `session.profile_version_seen` to the latest profile version. If stale, return `PROFILE_OUTDATED` with only the new version number and instruct the host to Prime or get the profile. Do not silently execute a mutation under instructions the session has not loaded. Reading and ACKing existing mail remain possible. A matching, already-committed idempotency replay can return its safe receipt after current access checks even when the profile has subsequently changed.

Expected tools are descriptions of what an owner anticipates the host can use. Schedules are definitions such as `{name, timezone, expression, intended_action}` with `execution: "external"`; no expression is executed or registered anywhere. Validate array elements and IANA timezone strings. Reject keys named `secret`, `api_key`, or credential-like fields where the schema does not explicitly allow them. This is a guardrail, not a guarantee that free text contains no secrets.

### 7.3 JSON field schemas

Use strict object schemas with unknown fields rejected for service-owned structures. The small `payload` and checkpoint `state` objects are intentionally extensible; they still have depth/byte limits and are never interpreted as commands or configuration.

| Field | Array element or object shape | Additional validation |
| --- | --- | --- |
| `expected_tools` | `{name, required, purpose, host_requirement?}` | Up to 40 items; name 1–120 characters, required boolean, purpose up to 500 characters, optional host requirement up to 300 characters |
| `deliverables` | `{name, format?, acceptance_criteria}` | Up to 20 items; name 1–120 characters; optional format up to 80; criteria array of at most 10 strings, each at most 300 characters |
| `schedule_definitions` | `{name, timezone, expression, intended_action, execution:"external"}` | Up to 20 items; valid IANA timezone; name up to 120, expression up to 300, intended action up to 500 characters; expression is descriptive text, never evaluated |
| `capabilities` | Array of strings | Up to 32 unique, nonempty strings of at most 80 characters each; returned as self-declared |
| `files` | `{display_name, url, media_type?, version_label?, content_sha256?, commit_hash?}` | Schema/URL rules in section 10; UUID, message linkage, and timestamps are server-generated |
| `payload` | Arbitrary small JSON object | No functions, binary/attachment fields, credential fields, or executable interpretation; bounded depth and bytes |
| Checkpoint `state` | Arbitrary small JSON object | Advisory continuation data only; cannot set identity, membership, owner profile, or authoritative ACK state |

The server maps API names to the corresponding JSON text columns. An empty collection is `[]`, not `null`. Canonicalize validated JSON before hashing idempotent requests. Profile revisions and all CAS/cursor sequence values use decimal strings on the wire; counts, bounded limits, and UTC millisecond timestamps may use safe JSON numbers. Return a separate ISO UTC display time when useful.

### 7.4 Checkpoint contract and CAS

`checkpoint_get` reads only this agent's checkpoint. `checkpoint_save` accepts `expected_revision`, `summary_md`, `state`, and an idempotency key. The service attaches the authenticated session and currently seen profile version. Checkpoints are shared across sessions of an agent.

```sql
-- For an existing checkpoint, within BEGIN IMMEDIATE:
UPDATE agent_checkpoints
SET revision = revision + 1,
    summary_md = :summary_md,
    state_json = :state_json,
    profile_version = :profile_version,
    updated_by_session_id = :session_id,
    updated_at_ms = :now
WHERE agent_id = :agent_id AND revision = :expected_revision;
```

If there is no checkpoint and expected revision is zero, insert revision 1. Otherwise exactly one updated row is required. On conflict, return `REVISION_CONFLICT` and the current revision; the caller must read, merge deliberately, and retry with a new mutation ID. Do not auto-merge or use last-writer-wins.

A checkpoint can contain task notes and advisory cursor references. It must not be used as the authoritative read state or an authorization source. A new session starts with the actual unread inbox, even if a checkpoint mentions a later cursor. A checkpoint from an older profile version is returned with a mismatch flag; the host decides how to adapt it.

## 8 Messaging and attention routing

### 8.1 Send contract

`message_send` accepts:

- `box_key`
- `idempotency_key`, generated once by the calling host for the logical send
- Exactly one destination: `{kind:"dm", recipient_agent_id}` or `{kind:"room", room_id}`
- `body_md`, required nonempty text
- Optional `payload`, a small JSON object
- Optional `reply_to_message_id`
- Optional `mention_agent_ids`, at most 20 distinct agents
- Optional `reply_requested_agent_ids`, at most 20 distinct agents
- Optional `files`, at most 10 reference objects

It does not accept author identity, session identity, creation timestamp, profile version, reason flags, membership IDs, arbitrary notification recipients, or a response status.

For DMs, mentions and response requests may name only the recipient. For rooms, every mentioned/requested agent must be a current active member, and a requested recipient must also be in the structured mention list. Reject the whole send if any target is invalid. Do not partially deliver a message that claims to mention someone it did not reach. A textual `@Name` is ordinary text and has no routing effect.

The service generates the message UUID, stores one row, inserts mentions/files/request rows, computes the recipient set, creates attention rows, and stores its idempotency receipt in **one transaction**. There is no asynchronous notification fan-out job in v1.

Return `{message_id, message_seq, stored_at, attention_recipient_count, response_request_count}`. Never return “delivered/read/completed” just because the transaction committed.

### 8.2 Thread semantics

For a reply, load and authorize the parent first. A DM reply must preserve the same unordered pair of participants. A room reply must remain in the same room. Set the root to `parent.thread_root_seq ?? parent.message_seq`; do not accept a caller-supplied root. The root's sequence is necessarily earlier than the new message.

`thread_read(anchor_message_id)` permits any currently accessible anchor message, including a visible reply whose original root is now outside the caller's access epoch. Internally select the root family, then authorize every returned row. Do not fetch an entire thread and filter it in the model. Invisible ancestors are omitted; returned messages flag `parent_context_available:false` without disclosing hidden ancestor metadata.

V1 messages are immutable. Correct a mistake with a new reply. Editing an old message would require notification/version rules and is intentionally deferred.

### 8.3 Follow modes and reason bits

Reasons are a bitset in one attention row:

| Bit | Name | Meaning |
| --- | --- | --- |
| 1 | `direct` | A DM addressed to this agent |
| 2 | `room_follow` | The agent follows all room messages |
| 4 | `mention` | The agent is explicitly structurally mentioned |
| 8 | `reply` | The new message directly replies to a message authored by this agent |
| 16 | `reply_requested` | The sender explicitly requested this recipient's response |

For room messages, use this exact policy:

| Follow mode | Ordinary post | Structured mention | Direct reply to own message | Explicit response request |
| --- | --- | --- | --- | --- |
| `all` | Include | Include | Include | Include |
| `mentions` | Skip | Include | Include | Include |
| `replies` | Skip | Skip unless also a response request | Include | Include |
| `mute` | Skip | Skip | Skip | Skip |

`mute` is absolute for room attention. A muted agent can still open room history and see requests manually. The UI/result must not promise that a response request overrides mute. DMs are independent of room preferences and always create attention for their recipient.

Exclude the author from attention even if they follow all. For every eligible recipient, OR all applicable reasons and insert once. A follower who is also mentioned and receives a direct reply has reason bits `2|4|8`, not three inbox items. Do not add a `mention` reason suppressed by the chosen mode; reason flags explain why that row was actually included.

Follow changes are prospective. They neither backfill old messages nor retroactively remove existing attention rows. Removal from the room hides all its rows through access checks; rejoining does not resurface the previous membership's rows.

### 8.4 Fan-out algorithm

Inside the send transaction, load current room memberships and preferences once. The initial limit is 100 members per room, making synchronous fan-out bounded. Derive the parent author, mention set, and response-request set from already validated data. Compute one map `recipient_agent_id -> {membership_id, reason_bits}`. Skip inactive agents and the sender. Insert attention in deterministic Agent ID order, although correctness does not depend on that order.

```sql
INSERT INTO attention_items (
  agent_id, message_seq, room_id, membership_id, reason_bits, created_at_ms
) VALUES (:recipient, :message_seq, :room_id, :membership_id, :reason_bits, :now);
```

A duplicate unique key here is an invariant violation for a new message, not a reason to silently ignore a service bug. Idempotent retries are handled before inserting a new message.

### 8.5 Lightweight response requests

A response request is a row on a message, not an executable task. Each named recipient has its own current declaration and revision. Other members cannot respond on that recipient's behalf.

`request_respond(box_key, request_message_id, expected_revision, status, body_md, files?, idempotency_key)`:

1. Verify the caller is an exact requested recipient and can still read the request.
2. Recheck current room access and room archival state when relevant.
3. Compare the request-recipient row's revision.
4. Create one canonical response message in the same conversation, directly replying to the request, with a server-derived response status and recipient identity.
5. Update the request row to point to this response and increment its revision.
6. Route attention for that new response message under the normal rules, including a direct reply to the original sender.
7. Commit the response, declaration, attention rows, audit event, and idempotency receipt together.

Allowed declarations are `accepted`, `needs_context`, `declined`, and `result_ready`. They report what the recipient says; `result_ready` is not independent verification, owner acceptance, or work-completion evidence. Keep an append-only history in the canonical response messages. The current row is the latest declaration. A later explicit declaration may correct an earlier one through CAS; no workflow state machine, automatic retry, deadline enforcement, or transition side effect is introduced.

Response messages cannot themselves carry structured response requests through this endpoint. No receipt, read ACK, file report, failure, or delivery event automatically creates a message. Those rules prevent server-generated notification loops.

## 9 Inbox, ACKs, and precise pagination

### 9.1 Shared read state and separate session receipts

`inbox_list` returns attention rows and their canonical message data. Merely listing or getting a message never sets `acked_at_ms`. For every returned attention item, the service upserts a `session_deliveries` receipt for the current session, in the same transaction used to authorize and select that page.

`inbox_ack` accepts explicit `inbox_seq` values, at most 100, plus an idempotency key. It verifies all of them belong to this agent, are still accessible, and were returned to this session. Reject the entire batch if any item fails. There is no “ACK everything below this cursor” shortcut and no automatic “mark all read on Prime.”

The ACK is shared across this agent's sessions. If R1 ACKs an item, R2 no longer sees it in a new unread query. A page already returned to R2 may show stale unread state; R2's ACK returns `already_acked` and does not overwrite the first ACK's provenance. This is a shared mailbox, not a work-claim/locking mechanism. Two sessions can act on the same mail unless the host/user coordinates them.

```sql
INSERT INTO session_deliveries (
  session_id, agent_id, inbox_seq, first_returned_at_ms, last_returned_at_ms
) VALUES (:session_id, :agent_id, :inbox_seq, :now, :now)
ON CONFLICT(session_id, inbox_seq) DO UPDATE SET
  last_returned_at_ms = excluded.last_returned_at_ms;

-- Run after validating the explicit batch and delivery receipts:
UPDATE attention_items
SET acked_at_ms = :now, acked_by_session_id = :session_id
WHERE agent_id = :agent_id AND inbox_seq = :inbox_seq AND acked_at_ms IS NULL;
```

ACK means the agent deliberately marked the message read. It does not mean the model understood it, the human approved a request, a file opened, the work started, or the work finished. Response declarations and file reports are separate explicit operations.

### 9.2 Cursor format and snapshot rules

Use ascending keyset pagination, never OFFSET and never timestamps. Cursors are opaque base64url-encoded validated JSON, not bearer credentials. They contain `v`, stream type, authenticated Agent ID, filter/scope, `after`, and optional `upper`. Room cursors also contain the current membership ID. Thread cursors scope to the visible anchor ID; they do not expose a hidden root ID or its metadata. Sequence values are decimal strings.

A cursor need not be cryptographically signed in v1 because it grants no access and every query independently binds the real authenticated agent and rechecks authorization. Reject a cursor from a different agent, scope, filter, membership epoch, or unsupported version. Caller tampering may choose its own starting position, never another agent's mailbox. Reject negative/out-of-range sequence values and `after > upper`.

For each paged scan:

1. On the first page, capture the current stream maximum as the fixed `upper` inside the read/receipt transaction. For the inbox, use the maximum `inbox_seq` for this agent; for room/thread history, the maximum relevant canonical message sequence.
2. Query authorized rows with `sequence > after AND sequence <= upper`, ascending, with a row and byte cap.
3. If a row cap or byte cap leaves eligible rows unreturned, the next cursor advances only to the **last returned row**, retaining the same upper bound.
4. Only when the eligible range through `upper` is exhausted may the resume cursor advance to `upper`.
5. A future poll uses that completed resume position and captures a new upper bound. New commits above the old upper are then included.
6. For an empty exhausted page, advancing to the captured upper is safe. Never set an incomplete page's cursor to the database's current MAX.

Gaps are normal: other agents' rows, other rooms, rolled-back allocations, revoked access, or ACKed items can produce noncontiguous sequences. The algorithm scans through gaps; it does not assume `next = previous + 1`.

Return `items`, `has_more`, `next_cursor` for the current snapshot if incomplete, and `resume_cursor` only once complete. Also return the captured `upper` and a server timestamp for debugging. Do not expose an opaque cursor as an ACK token.

### 9.3 Unread polling and concurrent changes

Unread filtering only removes eligibility: an item may become ACKed or its room access revoked. V1 has no “mark unread” feature, no retrospective follow backfill, and no restoration of old room epochs. Thus a completed scan cannot later acquire a newly eligible old row behind its cursor.

A caller wanting **all currently unread work** starts an unread scan from zero. A caller wanting only new arrivals can continue from a completed resume cursor, but still-unacknowledged earlier items remain in the mailbox and must be revisited through a fresh unread scan. Prime uses fresh counts and never treats a saved cursor as proof that older work is done.

When two sessions poll simultaneously, both can receive the same unread item. If one ACKs it before the other's next page, it legitimately disappears from that unread page because the mailbox's read state is shared. It has not disappeared from history or been automatically completed.

All writes that create messages and inbox rows are in one SQLite write transaction. No delayed fan-out can insert a notification for an old message after a completed inbox scan without receiving a new higher inbox sequence. Even so, v1 forbids delayed fan-out and old-item reason mutation to keep these invariants simple.

### 9.4 Canonical inbox query

Use the same access predicate for listing and counts. This query assumes current authentication has already been checked inside the transaction; it does not replace Box Key authentication.

```sql
SELECT i.inbox_seq, i.reason_bits, i.acked_at_ms, i.message_seq,
       m.message_id, m.channel_kind, m.room_id, m.author_agent_id,
       m.author_session_id, m.author_profile_version, m.body_md,
       m.payload_json, m.reply_parent_seq, m.thread_root_seq,
       m.response_status, m.created_at_ms
FROM attention_items i
JOIN messages m ON m.message_seq = i.message_seq
WHERE i.agent_id = :agent_id
  AND i.inbox_seq > :after AND i.inbox_seq <= :upper
  AND (:unread_only = 0 OR i.acked_at_ms IS NULL)
  AND (
    (m.channel_kind = 'dm' AND m.dm_recipient_agent_id = :agent_id
      AND i.room_id IS NULL AND i.membership_id IS NULL)
    OR
    (m.channel_kind = 'room' AND i.room_id = m.room_id AND EXISTS (
      SELECT 1 FROM room_memberships rm
      WHERE rm.membership_id = i.membership_id
        AND rm.room_id = m.room_id AND rm.agent_id = :agent_id
        AND rm.left_at_ms IS NULL AND m.message_seq > rm.joined_after_seq
    ))
  )
ORDER BY i.inbox_seq ASC
LIMIT :limit_plus_one;
```

The service assembles mentions, response declarations, and file references in bounded follow-up selects for the returned message IDs. It redacts inaccessible parent/root references before returning DTOs. Never join all child tables into one row-multiplying pagination query.

## 10 Rooms, directory, and file references

### 10.1 Owner-managed rooms and epochs

Owner room creation does not add every agent by default. Adding an agent captures the high-water boundary under `BEGIN IMMEDIATE`, then inserts a new membership. Adding an already-current member returns the current membership; it does not reset their history or preferences. Removing a member sets both leave fields once and leaves history intact for audit.

```sql
SELECT COALESCE(MAX(message_seq), 0) AS boundary FROM messages;

INSERT INTO room_memberships (
  room_id, agent_id, joined_after_seq, joined_at_ms, follow_mode
) VALUES (:room_id, :agent_id, :boundary, :now, :follow_mode);

UPDATE room_memberships
SET left_after_seq = :boundary, left_at_ms = :now
WHERE room_id = :room_id AND agent_id = :agent_id AND left_at_ms IS NULL;
```

A room archive freezes new messages, response declarations, new membership additions, and brief edits. Current members can still read, ACK, adjust follow preferences, and report file access. The owner can remove members or unarchive. Archive never grants access.

`room_follow` changes only the authenticated agent's current membership preference with `expected_preference_revision`. Use a CAS update, not a supplied Agent ID.

```sql
UPDATE room_memberships
SET follow_mode = :mode, preference_revision = preference_revision + 1
WHERE membership_id = :membership_id AND agent_id = :agent_id
  AND left_at_ms IS NULL AND preference_revision = :expected_revision;
```

### 10.2 Pinned brief

`room_brief_get` returns the latest revision to current members. `room_brief_update` lets a current member publish an explicit new brief with expected revision and an idempotency key. The owner CLI can also publish it. It is room content, not owner-authored agent instruction, and recipients must treat it accordingly.

Within a write transaction, validate membership/archive state, select the current maximum revision, require the expected revision, and insert the next one. A stale update fails without overwriting someone else's summary. There is no background summarizer. Brief updates do not create attention messages; a member can separately send a room message if it deliberately wants to announce the change.

### 10.3 Directory privacy

Directory list/search returns only active agents with `listed=1`: stable Agent ID, readable name, role, public summary, self-declared capabilities, and last Prime/check-in time. Label capabilities `self_declared:true`. Label check-in as a timestamp; never call the agent “online,” “awake,” “available,” or “verified.”

The owner controls opt-in. `directory_update_self` may revise only the authenticated agent's explicit public role, summary, and capabilities with CAS. It cannot change `listed`, its stable UUID, or anyone else's fields. The operation returns the resulting public projection so the caller can see what it is publishing. No private-profile field is copied automatically.

An unlisted agent is not discoverable in directory search. Its stable UUID can still be used as a DM address if known; unlisting is a discoverability setting, not an inbound-message block. Do not disclose a hidden agent's private role or profile when resolving an exact address.

Use parameterized case-insensitive name/role search with escaped wildcard characters and a bounded query length. For small v1 directories, a bounded LIKE query is sufficient; do not add FTS/vector infrastructure. Directory pagination uses stable `(display_name COLLATE NOCASE, agent_id)` keyset order for a single scan; directory updates may change ordering, so this is a browsing cursor, not a lossless event feed.

### 10.4 File references and recipient access reports

A file reference contains an HTTPS URL and display name, plus optional media type, version label, SHA-256, and commit hash. Require at least a version label, content hash, or commit hash for something described as a final/versioned deliverable. For an ordinary link, all may be absent and the result labels it unversioned.

Validate with a URL parser and strict length limits. V1 rejects credentials in URL authority, fragments, query strings, non-HTTPS schemes, `data:`/`file:` URLs, obvious loopback/private literal addresses, and common secret-bearing token patterns. Rejecting all query strings is an intentional simple first-version rule; support for known harmless query parameters can be qualified later. Do not fetch a URL, follow redirects, inspect DNS, download content, create previews, test credentials, or resolve permission checks on the server.

Do not accept file bytes, uploads, base64, signed secret links, or a shared drive credential in a payload. The sender must select an appropriately shareable nonsecret URL and use existing host permissions for sharing; the service does not grant access to the file.

`file_access_report(file_id, expected_revision, access_status, idempotency_key)` is available only to a currently authorized recipient/viewer of that message, excluding the message's author. It records that caller's own `accessible` or `inaccessible` declaration and session provenance. The server never marks another agent's access for it. No row means “not reported,” not “accessible.” These reports are self-reports and can become stale.

The message author can read recipient reports while still authorized to the message. Other recipients see only their own report. The report does not emit mail or mark an inbox item read. Publishing a new file version means sending a new file reference/message, preserving prior provenance.

## 11 Thread export

`thread_export(anchor_message_id, format, cursor?, limit?)` uses the exact same authorized message selector and snapshot pagination as `thread_read`. It returns bounded data/chunks; it does not upload, email, publish, or create a server-hosted downloadable file.

JSON includes an export schema version, export time, public agent names/IDs for visible messages, message IDs/sequences/times, body text, small structured payloads, visible reply references, mentions, response declarations, and file metadata. It excludes Box Keys/digests, private profiles, checkpoints, owner diagnostics, other agents' file reports, and hidden room history.

Markdown includes the same authorized messages in readable order, with clear authors/times and links. Escape headings/link text as needed, preserve message text as content, and never execute embedded HTML/scripts. Include `partial:true` plus the next cursor if more data remains; do not claim an incomplete page is the entire thread. An external client may assemble chunks into a file.

Every page checks current key and room membership. If the key or membership is revoked midway, later pages fail. Previously returned chunks cannot be recalled. No background export job or export table is needed.

## 12 Complete backend contract inventory

All authenticated MCP tools include `box_key`; the tables below omit that repeated argument. All mutations except naturally idempotent Prime require `idempotency_key`. Revisions and sequence values are decimal strings on the wire. Return validated DTOs, not raw database rows. Tool output includes a compact human-readable summary and structured JSON; neither contains credentials.

### 12.1 MCP tools

| Function | Inputs beyond credential | Reads and checks | Writes | Result |
| --- | --- | --- | --- | --- |
| `agent_prime` | Optional client label/host | Key, agent, latest profile, checkpoint, accessible rooms/inbox/request counts | One session per key; seen profile; usage/check-in metadata | Full reusable context described in section 7 |
| `profile_get` | None | Own current profile only | Session's seen version and usage metadata | Owner-authored profile/version |
| `checkpoint_get` | None | Own checkpoint | Usage metadata only | Checkpoint or logical revision zero |
| `checkpoint_save` | Expected revision, summary, state, mutation ID | Own current profile/session; checkpoint CAS | Checkpoint and idempotency receipt | New revision and stored timestamp |
| `directory_search` | Query, cursor, limit | Opted-in active directory projection only | Usage metadata only | Bounded public cards |
| `directory_get` | Public Agent ID | Active, opted-in card; otherwise generic not found | Usage metadata only | One public card |
| `directory_update_self` | Expected revision, explicit public role/summary/capabilities, mutation ID | Own directory row; no opt-in change | Own public fields/revision and receipt | Exact resulting public card/opt-in state |
| `rooms_list` | Cursor, limit | Own current memberships and room metadata | Usage metadata only | Room references, own preference/revision, current brief revision |
| `room_get` | Room ID | Current membership | Usage metadata only | Room details, bounded current roster, own membership epoch/preference |
| `room_follow` | Room ID, expected preference revision, mode, mutation ID | Own current membership CAS | Own membership preference/revision and receipt | New preference/revision |
| `room_brief_get` | Room ID | Current membership, latest brief | Usage metadata only | Brief and revision, or revision zero |
| `room_brief_update` | Room ID, expected revision, brief, mutation ID | Current member, not archived, latest revision CAS | New brief version and receipt | New revision, author/session provenance |
| `message_send` | Destination, body, optional payload/reply/mentions/requests/files, mutation ID | Destination/parent/member checks and limits | Message, children, request rows, attention rows, receipt | Stored message reference and counts |
| `message_get` | Message ID | Canonical visibility predicate | Own session receipt if an attention row exists; never ACK | Message DTO plus permitted children/reports |
| `conversation_read` | Room ID or DM peer ID, cursor, limit | Current room epoch or own DM pair | Receipts only for this agent's returned attention items | Canonical message page |
| `thread_read` | Accessible anchor message ID, cursor, limit | Anchor and every row via canonical visibility | Same receipt behavior as conversation read | Visible thread page; hidden-parent flags |
| `inbox_list` | `unread_only` default true, cursor, limit | Own attention and live access | Session delivery receipts for returned items | Deduplicated inbox page and reason labels |
| `inbox_ack` | Explicit inbox sequence array, mutation ID | Own delivered-to-this-session and still-accessible rows | First ACK timestamp/session; receipt | Newly ACKed and already-ACKed counts/IDs |
| `requests_list` | Incoming/outgoing, optional declaration filter, cursor, limit | Own requested-recipient rows or authored requests; canonical visibility | Usage metadata only | Current declarations and revisions |
| `request_respond` | Request message ID, expected revision, declaration, body/files, mutation ID | Exact recipient, current access, profile, CAS | Canonical response message, attention, declaration update, receipt | Response reference and declaration revision |
| `file_access_report` | File ID, expected revision, accessible/inaccessible, mutation ID | Caller can view message and is not its author | Own recipient report CAS and receipt | Own report revision/status/time |
| `thread_export` | Anchor ID, JSON/Markdown, cursor, limit | Same visibility as thread read on every page | Usage metadata only; no ACK or delivery assertion | Bounded export data/chunk with completion flag |

`room_get` exposes current members' public IDs and display names because shared membership is part of the room. It does not disclose unlisted members' private profile or hidden directory fields. `message_get` and history reads insert session receipts only for items actually included in that tool result, never for invisible ancestors or unreturned rows.

`requests_list` is a current-state browser, not a lossless event stream. Start a fresh scan to discover changed declarations; use canonical response messages in the inbox/history for the event record. Outgoing requests use a composite `(message_seq, recipient_agent_id)` cursor, since one message can request several recipients. Its high-water bound is the original message sequence; the full composite position is preserved between pages so equal-sequence recipients are not skipped.

### 12.2 Local owner CLI

Use the local command namespace `nookwire`. The CLI is not an HTTP admin API and is never an MCP tool.

| Command/service function | Required action | Database effect and safeguards |
| --- | --- | --- |
| `agent create` / `createAgent` | Name and initial owner profile | Generate new UUID; insert agent, private profile v1, opt-out directory atomically |
| `agent list/show` / `inspectAgent` | Optional exact Agent ID | Read identities, lifecycle, profile version, counts; secrets/digests excluded |
| `agent rename` / `renameAgent` | Agent ID, name, mutation ID | Update display name/time; stable UUID unchanged |
| `agent disable/enable` / `setAgentStatus` | Exact Agent ID, explicit state, mutation ID | Change status; disabled agent's keys all fail auth; memberships/mail retained |
| `key issue` / `issueBoxKey` | Existing Agent ID, label, expiry choice, mutation ID | Generate random key, store hash, return secret once; no self-claim |
| `key list` / `listBoxKeys` | Agent ID | Safe lifecycle fields only; show expired as derived effective state |
| `key revoke` / `revokeBoxKey` | Key ID, mutation ID | Revoke key and close its session atomically |
| `key replace` / `replaceBoxKey` | Old key ID, new expiry, mutation ID | Fresh key for same agent plus old-key revocation; one-time secret |
| `key revoke-all` / `revokeAgentKeys` | Agent ID, mutation ID | Revoke all active keys and close their sessions; mailbox retained |
| `session list` / `listSessions` | Agent ID | Read key IDs, session IDs, self-reported labels, seen profile and usage times |
| `profile show/history` / `readOwnerProfiles` | Agent ID/version | Read private owner content locally; avoid console logging by default |
| `profile put` / `appendProfileVersion` | Owner file, expected version, mutation ID | Validate and append next version atomically; agent cannot invoke |
| `directory set` / `setDirectoryPublication` | Agent ID, opt-in choice, explicit public data, expected revision, mutation ID | Change explicit projection and opt-in; never copy private profile automatically |
| `room create` / `createRoom` | Slug/name/description, mutation ID | Create private room; no implicit membership |
| `room edit/archive` / `updateRoom` | Room ID, new metadata/archive state, mutation ID | Safe metadata update; archive behavior as defined above |
| `room add` / `addRoomMember` | Room ID, Agent ID, default follow mode, mutation ID | Insert current epoch at serialized message boundary; current-member add is a no-op |
| `room remove` / `removeRoomMember` | Room ID, Agent ID, mutation ID | Close current epoch at serialized boundary; no destructive deletion |
| `room members/history` / `inspectMemberships` | Room ID | Read current and past membership epochs for owner inspection |
| `room brief put/history` / `ownerBrief` | Room ID, expected revision/file for writes | Append owner-authored room brief or inspect revisions |
| `audit stats/events` / `readDiagnostics` | Time range, safe filters/limit | Metadata-only counts, outcomes, latencies, session/key provenance |
| `db migrate` / `migrateDatabase` | Local DB and migration directory | Verify checksums; one atomic migration at a time |
| `db backup` / `backupDatabase` | Approved local destination | Consistent SQLite backup; record manifest/checksum separately |
| `db verify` / `verifyDatabase` | Database/backup path | Run integrity and FK checks, schema/version checks, fixture-free invariant checks |
| `db restore` / `restoreDatabase` | Verified backup, stopped service | Owner-controlled offline restore with a pre-restore backup and validation |
| `db maintenance` / `maintainDatabase` | Explicit retention parameters | Prune old rate buckets/safe audit retention and obsolete session receipts; no message/profile purge |

Enable/disable is a reversible agent lifecycle switch, not key rotation. Re-enabling an agent makes its still-active, unexpired keys usable again; the CLI must say so. For a suspected compromise use `revoke-all`, which is irreversible for those keys.

V1 has no message/profile/agent purge command. Future destructive retention requires an explicit design and backup/restore policy rather than silently dropping immutable-history triggers.

### 12.3 Shared internal functions

These are ordinary TypeScript functions, not additional MCP tools:

- `parseCredential`, `hashCredential`, `verifyCredential`: bounded parsing, secure digest comparison, never log arguments.
- `resolveAgentContext`: derive stable agent/session/key IDs; do not trust tool-supplied identity.
- `assertCurrentAuthorization`: recheck key/agent/session state inside each transaction.
- `assertCurrentProfileForMutation`: enforce observed profile version for new content mutations.
- `withReadSnapshot` and `withImmediateTransaction`: close transactions before returning; no async work inside callbacks.
- `canonicalizeMutationPayload`: deterministic JSON, validated/sorted set-like ID arrays, explicit defaults, no credential included.
- `findReplayOrRejectConflict`: same actor/operation/key plus same semantic hash replays; different hash conflicts.
- `commitMutationReceipt`: store small safe result IDs/revisions/counts in the same transaction as the mutation.
- `canReadMessage`/`selectVisibleMessages`: the shared canonical visibility predicate used by every content read.
- `resolveReplyContext`: authorize parent and derive root/conversation.
- `validateMentionAndRequestTargets`: enforce destination membership and target caps.
- `computeAttentionRecipients`: deterministic fan-out and reason ORing; excludes sender.
- `assembleMessageDtos`: fetch children for an already-authorized bounded ID set and redact hidden references.
- `recordReturnedItems`: insert session delivery receipts only for actual returned attention items.
- `encodeCursor`/`decodeCursor`: strict version/scope/agent/membership validation and decimal integer handling.
- `applyPageByteBudget`: finish only at a complete item boundary; never advance beyond a dropped item.
- `consumeQuota`: atomic write quota accounting; replay does not create another send quota charge.
- `writeAuditEvent`: fixed allowed fields only; never generic request/response serialization.
- `normalizeServiceError`: stable code, safe message, retryability, optional retry delay/current revision.

## 13 Query and update reference

Repository implementations should give these queries clear names and test them independently. Bind all parameters. Integers used as cursors should be bound as driver-supported 64-bit integers rather than lossy JavaScript numbers.

### 13.1 One canonical message authorization predicate

For an authenticated `:agent_id`, a message is visible only when:

```sql
(m.channel_kind = 'dm' AND
  (m.author_agent_id = :agent_id OR m.dm_recipient_agent_id = :agent_id))
OR
(m.channel_kind = 'room' AND EXISTS (
  SELECT 1 FROM room_memberships rm
  WHERE rm.room_id = m.room_id AND rm.agent_id = :agent_id
    AND rm.left_at_ms IS NULL AND m.message_seq > rm.joined_after_seq
))
```

Put the expression in one repository helper/view-query builder with fixed SQL, not hand-copied variants that gradually diverge. Do not create a SQL view with a client-controlled Agent ID. A `getMessage` query adds `m.message_id=:message_id`; a file query joins its message then applies the same predicate.

For an inaccessible or unknown message, room, file, or thread anchor, return the same `NOT_FOUND_OR_FORBIDDEN` result. Do not reveal another agent's private resource existence through error differences.

### 13.2 Conversation and thread selectors

```sql
-- Room history: :membership_id is derived from the current authenticated membership.
SELECT m.* FROM messages m
JOIN room_memberships rm
  ON rm.room_id = m.room_id AND rm.membership_id = :membership_id
WHERE m.channel_kind = 'room' AND m.room_id = :room_id
  AND rm.agent_id = :agent_id AND rm.left_at_ms IS NULL
  AND m.message_seq > rm.joined_after_seq
  AND m.message_seq > :after AND m.message_seq <= :upper
ORDER BY m.message_seq ASC LIMIT :limit_plus_one;

-- DM history: the caller is explicitly one of the two participants.
SELECT m.* FROM messages m
WHERE m.channel_kind = 'dm'
  AND ((m.author_agent_id = :agent_id AND m.dm_recipient_agent_id = :peer_id)
    OR (m.author_agent_id = :peer_id AND m.dm_recipient_agent_id = :agent_id))
  AND m.message_seq > :after AND m.message_seq <= :upper
ORDER BY m.message_seq ASC LIMIT :limit_plus_one;

-- Thread family candidate predicate, combined with the canonical visibility predicate:
-- (m.message_seq = :derived_root OR m.thread_root_seq = :derived_root)
-- AND m.message_seq > :after AND m.message_seq <= :upper
-- ORDER BY m.message_seq ASC LIMIT :limit_plus_one
```

For the first page, capture the maximum under the same scope and visibility predicate; `COALESCE(MAX(...),0)` handles an empty stream. Subsequent pages retain the captured upper. Do not return `SELECT *` rows directly even where repository examples select them.

### 13.3 Unread counts and pending requests

The unread count is `COUNT(*)` over `attention_items JOIN messages` using the exact inbox access predicate and `acked_at_ms IS NULL`. Group by `m.channel_kind` for DM/room counts. Count each attention item once, regardless of reason bits. Separate per-reason diagnostics can overlap and must be labeled as such.

Incoming response counts join `reply_requests rr` to `messages m`, require `rr.recipient_agent_id=:agent_id`, apply canonical visibility, and group by `rr.status`. An ACK never removes a pending request. Removing room access hides it from the recipient's counts; it does not fabricate a declined or completed response.

For outgoing request browsing, require `m.author_agent_id=:agent_id`, apply visibility, and keyset on the pair:

```sql
(m.message_seq > :after_seq OR
 (m.message_seq = :after_seq AND rr.recipient_agent_id > :after_recipient))
AND m.message_seq <= :upper_seq
```

Order by `m.message_seq, rr.recipient_agent_id`, retaining both fields in the next cursor. Response messages remain the immutable change record; current declaration lists must be refreshed to see corrections to old requests.

### 13.4 Directory projection

```sql
SELECT a.agent_id, a.display_name, a.last_check_in_at_ms,
       d.public_role, d.public_summary, d.capabilities_json, d.revision
FROM agent_directory d JOIN agents a ON a.agent_id = d.agent_id
WHERE d.listed = 1 AND a.status = 'active'
  AND (:query = '' OR a.display_name LIKE :escaped_pattern ESCAPE '\'
       OR d.public_role LIKE :escaped_pattern ESCAPE '\')
ORDER BY a.display_name COLLATE NOCASE, a.agent_id
LIMIT :limit;
```

Add the matching two-column keyset predicate for subsequent pages. Bind the escaped pattern; do not concatenate input into SQL. An exact directory get adds `a.agent_id=:target_id` and keeps `listed=1`.

Self-update uses `WHERE agent_id=:authenticated_agent_id AND revision=:expected_revision`, increments revision, and never includes `listed` in its SET clause. Owner publication uses a separate prepared statement that can set `listed` and has the same CAS guard.

### 13.5 Current rooms and pinned brief

```sql
SELECT r.room_id, r.slug, r.display_name, r.archived,
       rm.membership_id, rm.joined_after_seq, rm.follow_mode, rm.preference_revision,
       COALESCE((SELECT MAX(b.revision) FROM room_brief_versions b
                 WHERE b.room_id = r.room_id), 0) AS brief_revision
FROM room_memberships rm JOIN rooms r ON r.room_id = rm.room_id
WHERE rm.agent_id = :agent_id AND rm.left_at_ms IS NULL
  AND r.room_id > :after_room_id
ORDER BY r.room_id LIMIT :limit_plus_one;

SELECT * FROM room_brief_versions
WHERE room_id = :authorized_room_id ORDER BY revision DESC LIMIT 1;
```

Room listing is a browse list, not an arrival stream. A new membership can have a room UUID lexically before the current cursor; start a fresh list after Prime or membership changes. Message/inbox lossless cursors always use monotonic sequences, never room UUID order.

### 13.6 Response declaration CAS

After validating the request recipient and inserting the new response message:

```sql
UPDATE reply_requests
SET status = :status, revision = revision + 1,
    latest_response_message_seq = :response_message_seq, updated_at_ms = :now
WHERE message_seq = :request_message_seq
  AND recipient_agent_id = :authenticated_agent_id
  AND revision = :expected_revision;
```

Exactly one row must change or the entire transaction rolls back, including the response message and its attention rows. Under `BEGIN IMMEDIATE`, reading the expected revision before insertion is serialized, but retain the CAS WHERE clause as a safety check.

### 13.7 File access report CAS

If there is no existing report and expected revision is zero, insert revision 1 with the current authenticated agent/session. Otherwise:

```sql
UPDATE file_access_reports
SET revision = revision + 1, access_status = :status,
    reported_by_session_id = :session_id, reported_at_ms = :now
WHERE file_id = :file_id AND agent_id = :authenticated_agent_id
  AND revision = :expected_revision;
```

Exactly one changed row is required. There is no parameter for reporting another recipient's access.

### 13.8 Quota updates

Use separate bucket keys for authenticated request traffic and logical message writes, including both key and stable-agent limits. A new key must not bypass the agent-level write cap.

```sql
INSERT INTO rate_limit_buckets (bucket_key, window_start_ms, used_count)
VALUES (:bucket_key, :window_start_ms, 1)
ON CONFLICT(bucket_key, window_start_ms) DO UPDATE
SET used_count = used_count + 1
WHERE used_count < :limit
RETURNING used_count;
```

No returned row means the quota is exhausted. For multiple relevant buckets, check/increment in one transaction so a rejected operation does not partially consume a logical-write quota. Count ordinary HTTP attempts separately from logical sends; an idempotent replay can still be throttled as a request, but must not consume a second logical-send quota.

### 13.9 Diagnostics

Owner diagnostics may group `audit_events` by operation, outcome, error code, agent, session, profile version, and time window. Success rate must be defined as successful attempts divided by recorded attempts, with replays separately visible. Counts of stored messages and attention rows come from their authoritative tables, not inferred from request logs.

```sql
SELECT operation, outcome, COUNT(*) AS attempts, SUM(replayed) AS replays,
       AVG(duration_ms) AS mean_duration_ms, SUM(result_count) AS result_count
FROM audit_events
WHERE occurred_at_ms >= :since AND occurred_at_ms < :until
GROUP BY operation, outcome ORDER BY operation, outcome;
```

No body text, payload values, private instructions, checkpoint summaries, URLs, key hashes, raw keys, or HTTP authorization headers enter logs or this table. Build diagnostics with an explicit field allowlist, not a redaction regex applied after serializing an entire request.

## 14 Transactions, retries, and errors

### 14.1 Mutation wrapper

Every normal mutation follows this order:

1. Strictly validate the input schema and caps, with credentials excluded from any validation error text.
2. Authenticate and apply a bounded pre-service request limit.
3. Start `BEGIN IMMEDIATE` and revalidate key/agent/session state.
4. Check current access to relevant resources. A cached idempotency result must not bypass a revoked membership or credential.
5. Compute the canonical semantic payload hash, excluding `box_key`, derived identity/session/time, and the idempotency key itself.
6. Look up `(actor_scope, operation, idempotency_key)`, where actor scope is `agent:<stable UUID>` or `owner`.
7. If found with matching hash, record a metadata-only replay audit event and return its safe receipt after current authorization checks. Preserve the original author's session and the first ACK provenance. If the hash differs, return `IDEMPOTENCY_CONFLICT` without a mutation.
8. For a new mutation, enforce destination state, CAS expectations, and applicable logical-write quotas. Require profile freshness for `message_send`, `request_respond`, `checkpoint_save`, `directory_update_self`, and `room_brief_update`. ACK, file-access reporting, and follow-preference changes remain usable without a profile refresh because they record read/access/preferences rather than new instruction-bearing content.
9. Make all domain writes, write a safe receipt and successful audit event, and commit.
10. Return only after commit. If the HTTP response is lost, a retry with the same ID recovers the committed receipt.

Do not use `INSERT OR REPLACE` for domain rows: it can delete/reinsert data and undermine foreign keys and provenance. Use deliberate INSERT, guarded UPDATE, or narrowly defined UPSERT.

Idempotency records store only IDs, revisions, counts, and timestamps needed to replay mutation outcomes. They do not store complete message/profile content or a credential. Initial v1 keeps them for the life of the associated domain data; there is no short TTL that silently allows an old send to duplicate. Explicit owner retention changes are a later design.

Two different keys for the same agent share the same mutation namespace. Replaying a known logical send from a replacement session can return the original receipt if currently authorized. Independently intended sends need different mutation IDs even if their text is identical.

### 14.2 Busy, crash, and uncertain results

SQLite writer contention is expected to be small but must be handled. Use a bounded busy timeout and a small jittered retry budget for `SQLITE_BUSY` around the **entire transaction**, not individual statements. Never keep a transaction open while waiting. A client retry keeps its same idempotency key.

- Failure before commit: all domain writes and the receipt roll back together.
- Commit succeeds but response is lost: retry returns the stored receipt.
- Two concurrent requests use the same key and same payload: one creates the result; the other replays it.
- Same key, different payload: conflict; never choose one silently.
- Disk full/I/O error: fail the write and expose a safe operational error. Do not claim persistence.
- A failed audit insert inside a successful-mutation transaction rolls back that mutation. Read-attempt audit failure is logged as a content-free operational fault and must not fabricate a successful audit record.
- A process crash releases locks. Startup performs migration/integrity checks as configured before becoming ready.

### 14.3 Error envelope

Use MCP-compliant tool errors with structured fields `{code, message, retryable, retry_after_ms?, current_revision?}` and a short text explanation. Do not leak SQL, paths, stack traces, body snippets, secret-bearing values, or another agent's resource details.

| Code | Meaning | Caller action |
| --- | --- | --- |
| `AUTH_FAILED` | Invalid/revoked/expired key or disabled agent | Ask owner for a valid key; do not guess |
| `NOT_PRIMED` | Valid key has no logical session yet | Call Prime |
| `PROFILE_OUTDATED` | A new content mutation used an old loaded profile | Read current profile/Prime, then intentionally retry |
| `NOT_FOUND_OR_FORBIDDEN` | Resource absent or inaccessible | Stop relying on that reference |
| `ROOM_ARCHIVED` | Room content is frozen | Read existing content; owner may unarchive |
| `INVALID_ARGUMENT` | Shape, URL, target, or type invalid | Correct input; don't retry unchanged |
| `LIMIT_EXCEEDED` | Message/file/member/byte cap exceeded | Reduce the bounded operation |
| `REVISION_CONFLICT` | CAS lost | Read current state, merge intentionally, new mutation ID |
| `IDEMPOTENCY_CONFLICT` | Mutation ID reused for a different semantic request | New ID only for a genuinely new operation |
| `CURSOR_INVALID` | Wrong scope/agent/epoch/version or malformed cursor | Start a fresh authorized scan |
| `RATE_LIMITED` | Request or logical-write quota exceeded | Wait for indicated window; retain mutation ID |
| `TEMPORARILY_UNAVAILABLE` | Busy/temporary operational failure | Bounded retry with same mutation ID |
| `STORAGE_FAILURE` | Disk/integrity/I/O failure | Stop claiming writes succeeded; owner investigates |

Do not save transient failures as successful idempotency receipts. An explicit failed compare-and-swap makes no domain change; it does not poison a mutation ID forever, but a changed payload must use a new ID once any success was committed.

## 15 Operating limits, privacy, and observability

### 15.1 Initial bounded defaults

These are implementation defaults to tune from measurements, not platform claims or paid service tiers. Store limits in validated configuration, publish relevant limits in Prime, and test boundary values.

| Limit | Initial value |
| --- | --- |
| HTTP request body | 128 KiB |
| Tool response body | 256 KiB including structured result and text summary |
| Message Markdown | 16 KiB UTF-8 |
| Structured message payload | 8 KiB UTF-8, object root, depth at most 8 |
| Entire message including file metadata | 64 KiB UTF-8 |
| Files per message | 10 |
| Mentions / requested recipients | 20 each, deduplicated |
| Members per room | 100 |
| Current rooms per agent | 100 |
| Active keys per agent | 50 |
| Typical page size / maximum row count | 20 / 50, also subject to byte cap |
| Explicit ACK batch | 100 items |
| Tool requests per key | 120/minute |
| Tool requests per stable agent | 300/minute |
| New message writes per stable agent | 30/minute |
| Directory search query | 120 characters |
| Owner instructions / soul text | 32 KiB each |
| Expected-tools / deliverables / schedules JSON | 8 KiB each |
| Checkpoint summary / state | 16 KiB each |
| Pinned room brief | 16 KiB |

Validate byte limits with UTF-8 byte length, not JavaScript character count. Reject excessive JSON nesting and dangerous parser keys such as `__proto__` where applicable; never merge untrusted objects into prototypes/configuration. A single largest legal message must fit in a result page; page budgeting must reserve envelope overhead.

Rate limiting before authentication uses a bounded in-memory or reverse-proxy IP limiter with trusted-proxy configuration and no raw IP in content logs. Authenticated key/agent buckets are durable. A restart must not erase logical-write quotas. Do not let a caller create arbitrary bucket names or an unbounded in-memory map.

### 15.2 Privacy and secret handling

- Do not log request/response bodies at the SDK, Express, reverse proxy, tracing collector, or error reporter.
- Disable generic tool-call argument tracing in service-owned infrastructure. Test it rather than assuming a logging setting works.
- Treat Box Keys as credentials even when they appear in a tool argument. Do not pass them into profile/message services after context resolution.
- Minimize raw-key lifetime in memory. Do not promise secure zeroization of JavaScript strings.
- Reject recognizable Box Key token patterns in message text, public directory content, checkpoint text/JSON, profile fields, brief text, and file metadata to reduce accidental forwarding. This does not detect every other kind of secret.
- Store the SQLite file and backups with restrictive OS access; SQLite does not provide application-level at-rest encryption by default. Use encrypted disk/backups if required.
- The trusted owner can inspect all database content. This is not end-to-end encryption between agents.
- Do not collect real-world personal data, browser cookies, host credentials, provider API keys, or private file access tokens just to identify an agent.
- Never copy private profile content into public cards, room membership summaries, errors, metrics, or exports.
- Explain that chat-host transcript retention and file-sharing permissions are outside the service's control.

### 15.3 Health and diagnostics

Provide minimal `/health/live` and `/health/ready` endpoints. Liveness reveals only process availability. Readiness confirms configured database access and completed migration compatibility without returning paths, credentials, profiles, or table contents. Owner diagnostics remain local CLI commands in v1.

Track safe operational counters: authenticated/failed attempts, stored messages, attention rows, ACKs, response declarations, idempotent replays/conflicts, CAS conflicts, rate-limit rejections, database busy/IO errors, latency, page bytes, and active/revoked/expired key counts. Distinguish a key's stored status from its derived effective expiry state.

Audit attribution records agent, key ID, session, and observed profile version where available. Client host/label remains self-reported. Public last check-in comes from Prime and is never converted into an “online” presence indicator.

### 15.4 Backup and restore gate

Before any production data is relied upon:

1. Create a consistent backup through the database library/SQLite backup mechanism.
2. Record database schema version, migration checksums, creation time, and backup SHA-256 in a separate local manifest.
3. Restore into a different temporary path, never over the live file.
4. Run `PRAGMA integrity_check` and `PRAGMA foreign_key_check`.
5. Open it with the pinned application version and verify sample owner-visible counts and invariants without sending messages.
6. Document the offline restore steps, ownership/file permissions, and how the original live database is preserved before replacement.
7. Verify revoked keys remain revoked after restoring the selected backup. A backup predating a revocation can resurrect that key's recorded state; the owner must reapply revocations before reopening access, or revoke all restored keys and issue fresh ones.

That last point is a release requirement, not an optional operational footnote.

## 16 Build from the finished product backwards

### 16.1 Release artifacts

The finished v1 repository should contain:

- Runnable Node/TypeScript MCP server with exact dependency lockfile and Node version declaration.
- The full migration plus future migration/checksum machinery.
- Local owner CLI and safe first-run instructions.
- README focused on ordinary chat usage, per-chat Box Keys, Prime, inbox polling, and explicit ACKs.
- An owner-profile file example, checkpoint example, and room-brief example with no real credentials.
- Unit, database-integration, concurrency, security, and MCP contract tests.
- A real-host compatibility report for the targeted ChatGPT and Claude surfaces/accounts.
- A deployment example using durable disk, TLS, a non-root service account, and redacted logging.
- Backup/restore and key-compromise runbooks.
- A short architecture decision record for the explicit tool-argument credential tradeoff and room epoch policy.

No production key, personal conversation content, SQLite production database, or secret-bearing `.env` file belongs in Git.

### 16.2 Stage 0 Prove the ordinary-chat connection

**Outcome:** The proposed integration can actually be used from the user's ordinary target chat tabs.

Build only a tiny tools-only MCP spike with a fake `agent_prime`/identity echo. Confirm the selected pinned SDK, Streamable HTTP mode, and supported protocol compatibility with an MCP test client. Then manually connect from the actual ChatGPT and Claude surfaces intended for use, because host support/configuration can differ by product, account, and release.

Demonstrate two tabs using one shared MCP connection with different tool-argument test keys and no identity bleed. Confirm tool schemas and structured output work, and document what each host stores/displays in traces. The server's identity must come from each call's key, not whichever tab primed most recently.

**Exit gate:** Real-host evidence or a clearly recorded blocker. Do not promise the finished ordinary-chat experience from a standalone SDK test alone. A compatibility blocker must not lead to silently changing the product into separate per-tab MCP installations.

### 16.3 Stage 1 Durable identity and direct inbox

**Outcome:** The first usable product: Prime, send a DM, poll the inbox, explicitly ACK it, and resume after restart. Ship this private core for hands-on use before adding the remaining v1 features.

Implement configuration, database open/migrations, prepared SQL, safe integer conversion, owner agent/key CLI, authentication, minimal Prime/session mapping with empty profile v1, canonical DM send, idempotency, inbox listing, explicit ACKs, message get, and safe diagnostics. This initial tool surface is deliberately small: `agent_prime`, `message_send` for DMs, `inbox_list`, `inbox_ack`, and `message_get`. The full schema may be migrated at the start, but unbuilt later tools remain unregistered; empty later-feature tables create no setup burden. Implement revocation and restart persistence now, not after a UI exists.

**Exit gate:** Two-agent DM, same-agent two-session ACK semantics, lost-response retry, author-spoof rejection, expired/revoked key rejection, and restart durability all pass. DDL/FK/integrity tests pass. No raw key appears in logs.

### 16.4 Stage 2 Shared rooms and correct attention

**Outcome:** The inbox works for shared collaboration without duplicated or leaking history.

Implement owner rooms/memberships, epoch access, room history, follow preferences, structured mentions, replies/thread reads, bounded synchronous fan-out, and all pagination rules. Reuse one authorization predicate everywhere.

**Exit gate:** Membership history/revocation/rejoin cases, all four follow modes, reason deduplication, inaccessible ancestors, sparse sequences, byte-limited pagination, and concurrent inserts/ACKs pass. Reject cross-room and cross-DM-pair replies.

### 16.5 Stage 3 Full reusable profiles and Prime

**Outcome:** The same stable agent can resume in a fresh chat without losing its owner's definition.

Complete owner profile editing/history, private profile load, session-observed versions, profile freshness checks, explicit public directory projection, CAS checkpoints, expected-tools/deliverables/schedule definitions, room references and unread counts in Prime.

**Exit gate:** Owner-only profile mutation, private/public separation, concurrent checkpoint conflict, stale profile handling, two different Box Keys mapping to the same profile/inbox, and no scheduler/tool-execution side effects all pass.

### 16.6 Stage 4 Useful collaboration details

**Outcome:** Agents can make requests and share results without a workflow engine.

Implement response requests/declarations, recipient file access reports, versioned file metadata, pinned room briefs with CAS, and bounded thread exports. Keep each feature tied to existing canonical messages and access rules.

**Exit gate:** ACK versus work declaration distinction, exact-recipient authorization, response idempotency/CAS, no notification loops, no file fetching, no secret URLs, brief conflicts, and export revocation tests pass.

### 16.7 Stage 5 Operational hardening and release

**Outcome:** The private installation is dependable and understandable.

Complete rate limits, every error envelope, HTTP body/response limits, metadata-only audit retention, graceful shutdown, WAL/backups, offline restore, deployment runbook, dependency/security review, and real-host regression tests. Run the final acceptance story with nonsecret test data in the target environment.

**Exit gate:** Every release-blocking test below passes, dependencies are pinned, backup restoration is proven, and the owner can create/revoke/replace a key without touching SQL. Publish the server only after an explicit deployment decision; this plan itself performs no deployment.

### 16.8 Keep scope proportional

Stages are delivery gates, not estimates. Do not spend time on branding, an admin dashboard, OAuth onboarding, sockets, push, agents that run autonomously, or D1 before the direct inbox is working. Build the contracts and tests once; avoid an abstraction layer for every hypothetical future backend.

If a feature strains the single-process limits, measure the bottleneck first. A personal installation can operate comfortably within modest member/page caps without introducing distributed queues or a workflow engine. Performance claims require measurement on the selected deployment.

## 17 Test plan and release gates

Use Node's test runner or one small pinned test framework. Use real temporary SQLite files for database/concurrency tests; in-memory databases alone do not test WAL, filesystem errors, restart, or multi-connection behavior. Inject the clock and random-ID source in tests. No test uses a real user's keys or content.

### 17.1 Schema and migration tests

1. Execute the entire DDL against a fresh supported SQLite database; assert all 20 application tables and expected indexes/triggers exist.
2. Run `PRAGMA foreign_key_check` and `PRAGMA integrity_check` after realistic fixture inserts.
3. Reject malformed enum values, non-object payloads, non-array profile fields, invalid paired NULLs, over-byte-limit content, and missing foreign parents.
4. Reject an author/session pair from different agents and a room author membership from another agent/room.
5. Reject duplicate active memberships, duplicate session per key, and duplicate attention per recipient/message.
6. Confirm message/profile/brief immutability triggers fire.
7. Reapply a known migration safely through the migration runner; reject altered checksums and unsupported future schema versions.
8. Simulate failure midway through migration and verify rollback leaves a usable prior schema.

### 17.2 Identity and credential tests

9. A public UUID or readable name never authenticates or creates a key.
10. Two keys for one agent create two sessions and share one inbox/profile/checkpoint.
11. Repeated/concurrent Prime using one key creates exactly one session.
12. Labels/host strings cannot select an agent, override key identity, or alter another session.
13. Unknown, malformed, expired, revoked, and disabled credentials produce safe generic auth errors.
14. Expiry equality (`expires_at_ms == now`) is expired; no-expiry keys remain valid until revoked.
15. Revoke one key; the other key for that agent continues working. Revoke-all blocks all old keys.
16. Revoke during a concurrent operation and verify the defined authorization/commit linearization; no subsequent snapshot accepts the key.
17. Agent disable/enable behavior and the difference from irreversible key revocation are explicit and tested.
18. Key issue/replacement stores only a digest; lost one-time output cannot be recovered from database, logs, audit, or idempotency receipts.
19. Reusing a transport connection or protocol session across tabs never mixes authenticated contexts.

### 17.3 Messaging and retry tests

20. Store one DM and one attention row atomically; author is server-derived.
21. Reject supplied author/session/time/profile/notification fields through strict input schemas.
22. Same mutation ID and canonical payload under concurrency produce one message and one receipt.
23. Same ID with different text, recipient, file metadata, or response targets conflicts.
24. Lost HTTP response after commit replays the same message ID; failure before commit leaves no partial message or attention.
25. Replaying from another valid session of the same agent preserves original author provenance.
26. Cross-agent reuse of the same mutation UUID does not collide because actor scopes differ.
27. A revoked key or removed room member cannot replay old receipts to recover unauthorized content.
28. Reject self-DMs, invalid targets, oversized bodies, invalid JSON, excessive nesting, oversized lists, and total-envelope overflow without partial inserts.
29. Retry transient database busy failures as a whole transaction; never duplicate a send or double-charge its logical write quota.

### 17.4 Room history and access tests

30. A newly joined member sees only messages after its serialized join boundary.
31. A removed member cannot read even its own old room posts through message get, room history, inbox, counts, thread read/export, request browsing/response, file metadata/reports, or brief read/update.
32. Rejoining creates a new epoch and does not resurrect earlier attention/history. A cursor from the old epoch is rejected.
33. Joining concurrently with a send yields one well-defined ordering; no boundary race leaks a pre-join message.
34. Removing concurrently with send/mention/response yields either authorized commit before removal or rejection after it, never partial routing.
35. Another current member still sees authorized room history; one agent's removal does not erase the shared conversation.
36. Mention/request of a nonmember, former member, disabled agent, or sender rejects the entire send.
37. Cross-room replies and replies between different DM pairs fail.
38. A visible reply with an invisible root returns no hidden ancestor body, author, file link, or identifying metadata.
39. Current brief visibility for new members is intentional; historical brief versions remain owner-only.
40. Archive rules permit authorized history/ACKs but reject new room content and membership additions.

### 17.5 Attention and read semantics tests

41. Cover every cell of the four-mode follow matrix and each reason bit.
42. A message matching follow, mention, reply, and response request produces one row with ORed reasons.
43. Sender never receives its own attention; ordinary textual `@name` does not notify.
44. Mute suppresses even response-request attention while leaving manual history access intact.
45. Changing follow preference affects future sends only.
46. Reading/listing/Prime/export does not ACK or complete work.
47. ACK only explicit returned-to-this-session IDs; an unseen ID, other agent's ID, or inaccessible room row causes atomic batch failure.
48. Two sessions can receive the same unread item. First ACK wins provenance; second explicit ACK is safely already-ACKed.
49. ACKed items remain in history; pending response requests remain pending.
50. Receipt upserts and page assembly do not record unreturned or byte-truncated items as delivered.

### 17.6 Pagination and concurrency tests

51. Seed sparse message/inbox sequences interleaved across agents/rooms; enumerate all eligible rows with no omission or duplicate within a stable scan.
52. A full first page must not advance to MAX; verify all intermediate pages are returned.
53. Insert more messages between pages; old-snapshot pages stop at their upper, then the next poll receives new rows.
54. Exhaust an empty filtered page and verify safe resume at the captured upper.
55. Byte-cap a page before its row cap; next cursor resumes after the last actually returned item.
56. ACK intermediate rows from a second session while paging; the unread result follows shared state without losing canonical history.
57. Revoke access while paging; subsequent pages must not expose hidden rows or cached content.
58. Reject wrong-agent/filter/room/membership cursors and invalid 64-bit values.
59. Test sequences above JavaScript's safe integer range without roundoff or duplicate cursor values.
60. Outgoing response requests sharing one message sequence paginate on both sequence and recipient ID.
61. A new session starts a fresh unread scan even if a saved checkpoint contains a later cursor.
62. New eligible inbox rows cannot appear below an exhausted cursor through follow changes or membership rejoin.

### 17.7 Profiles, checkpoints, and public directory tests

63. Only owner CLI can append a profile version; agent tools cannot rewrite `soul.md` or owner instructions.
64. Current profile lookup returns the highest committed version, with stable historical versions unchanged.
65. Two owner writes with one expected profile version yield one append and one conflict.
66. Two sessions saving the same checkpoint revision yield one save and one conflict; no silent merge/overwrite.
67. A new owner profile makes old-session content mutations require refresh; reads and ACKs remain available.
68. Prime/profile refresh updates the seen version without erasing the checkpoint; old-profile checkpoint mismatch is explicit.
69. Directory opt-out excludes search/get, while a known UUID remains a DM address as documented.
70. Private instructions, schedules, checkpoint text, and expected-tool details do not appear in public directory projections or diagnostics.
71. Agent self-update cannot change opt-in, stable ID, name, or another agent's card.
72. Last check-in is a timestamp and capability claims are labeled self-declared; no online assertion.
73. Schedule definitions remain inert through startup, Prime, profile update, restart, and every tool call.

### 17.8 Requests, briefs, files, and exports

74. Only the exact requested recipient may report a declaration; the same stable agent's other valid session may do so.
75. Response CAS conflict rolls back its new canonical message and attention rows.
76. Response retries create one response message and retain the same declaration revision.
77. `result_ready` does not ACK, verify a result, or create an automatic follow-on request.
78. All ACKs, delivery receipts, file reports, failures, and brief updates create zero automatic messages. A response declaration creates exactly its one explicitly requested canonical response.
79. Concurrent pinned-brief edits with one expected revision yield one append and one conflict.
80. File references never invoke fetch, DNS, download, upload, or preview code; assert no outbound request from the service.
81. Reject signed/query-bearing URLs, URL credentials, non-HTTPS schemes, data URLs, embedded bytes/base64 attachment fields, and obvious private literal endpoints.
82. Only a currently authorized nonauthor recipient/viewer can report its own file access; no sender assertion for another agent.
83. Other recipients cannot see each other's file reports; author sees reports only while authorized to the message.
84. Export contains exactly the currently authorized message set and explicitly marks incomplete pagination.
85. Export excludes private profiles, credentials/digests, checkpoints, hidden ancestors, and unauthorized file reports.
86. Revocation halfway through export blocks the next chunk.

### 17.9 Operational and security tests

87. Capture logs, traces, error responses, audit rows, and idempotency rows; assert sentinel test secrets, bodies, URLs, and private instructions are absent.
88. Secret-looking key text in message/profile/directory/checkpoint/brief/file fields is rejected safely without echoing it.
89. Unknown keys and malformed bodies hit bounded pre-auth limits without unbounded memory growth.
90. Agent write caps survive a restart and cannot be bypassed by another key for the same agent.
91. Boundary caps account for multibyte Unicode and full output envelope overhead.
92. Simulate disk full, DB lock contention, missing persistent mount, corrupted backup, and failed migration. Never report a failed write as stored.
93. Graceful shutdown stops accepting new work and lets committed operations finish without extending a transaction across async work.
94. Backup/restore preserves IDs, messages, shared ACKs, profile/checkpoint revisions, idempotency receipts, and revocation state from that backup.
95. A pre-revocation backup cannot be restored and exposed without the documented key-revocation reconciliation step.
96. Host/origin protections, malformed HTTP/MCP handling, request limits, and reverse-proxy trust behavior are tested against the pinned SDK integration.
97. A malicious message instructing an agent to reveal keys, change profiles, grant access, or auto-send does not cause any server action; tool descriptions clearly mark message content as untrusted.
98. Database tests run with foreign keys enabled on every connection, including owner CLI operations and fixtures.
99. Every public tool is exercised through a real MCP client, not only direct service calls.
100. The finished acceptance story passes in the actual ordinary-chat hosts intended for use, with separate per-tab test keys and no identity bleed.

### 17.10 Property and stress checks

In addition to named tests, generate randomized sequences of joins, removals, rejoins, sends, follow changes, reads, ACKs, retries, and checkpoint saves across several agents and sessions. Compare database outputs to a simple in-memory reference model for current access and attention eligibility. Assert one canonical message per committed logical mutation, one attention row per agent/message, no unauthorized result, and monotonic cursor progress.

Run a modest burst test at the configured room/member/message caps. Record observed latency, busy errors, event-loop delay, database/WAL growth, and page sizes. Set a measured acceptable baseline for the chosen host rather than inventing throughput guarantees.

## 18 Future Worker and D1 option

A Cloudflare Worker/D1 variant is a **separate future adapter and qualification project**. The Node service's `better-sqlite3` process and durable local database file cannot simply be copied into a Worker and expected to persist there.

D1 exposes its own database binding and query/batch API. Its transaction model and runtime constraints must be examined directly; do not assume the Node callback transaction wrapper or `BEGIN IMMEDIATE` flow ports unchanged. [Official D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)

Before claiming support, requalify:

- Credential hashing, safe logging, tool schemas, and supported MCP transport integration in the Worker runtime.
- Every schema feature, foreign key, JSON check, trigger, migration, and integer serialization behavior.
- Atomic send plus attention fan-out plus idempotency receipt under D1's actual supported operations.
- CAS and owner membership changes without a read/modify/write race.
- Auth revocation and room access under the chosen consistency/read routing behavior.
- Cursor commit ordering, concurrent writes, backup/restore, rate limiting, and byte/time limits.
- The full test matrix against the adapter, especially membership history and idempotent retries.

If those semantics require redesign or additional coordination, document that cost before choosing the variant. Do not add D1 abstractions, Cloudflare resources, credentials, or deployment steps to the initial build merely because the future option exists.

## 19 Related work and build decisions

The [jackie-hash/AgentWire project](https://github.com/jackie-hash/AgentWire) documents a self-hosted agent communication hub with direct/group messaging, inbox/history commands, and SQLite-backed storage. That is useful adjacent work to inspect for product lessons; it is not a security or compatibility endorsement, and this plan does not depend on its code. The design here specifically prioritizes ordinary chat tabs on one shared MCP connection, owner-provisioned stable identities, a different private Box Key per chat, reusable private owner profiles, and explicit inbox/read semantics.

The decisions ready for implementation are:

1. Messaging/inbox first, with reusable profiles completed as a first-class v1 feature.
2. One private single-owner Node service and one durable local SQLite database.
3. Explicit per-tool Box Key for the lightweight shared-connector prototype, with the transcript-exposure caveat.
4. Owner-only provisioning and profile administration through a CLI.
5. One stable agent with multiple separately revocable session keys and shared read state.
6. Current-membership/epoch room access; no historical access restoration on rejoin.
7. Immutable canonical messages, synchronous attention fan-out, explicit item ACKs, and lossless bounded keyset scans.
8. Profile/checkpoint/brief revisions and idempotency as core correctness requirements.
9. File references and recipient self-reports only; no file hosting or URL fetching.
10. No AI runtime, automatic wake, scheduler, workflow engine, or Cloudflare deployment in the first build.

The remaining implementation-time decisions are deliberately narrow: exact dependency/Node versions, the actual persistent host, tested chat-host compatibility, and any operator-adjusted limits. None changes the public-ID/private-key separation or the authorization/pagination invariants.

## 20 Handoff checklist

Before implementation begins:

- [ ] Confirm the target ordinary ChatGPT and Claude surfaces for Stage 0.
- [ ] Pick an available persistent Node deployment environment when deployment is actually authorized.
- [ ] Select exact supported dependency versions from official registries/docs and commit a lockfile.
- [ ] Extract section 5 into the first SQL migration and validate it against the selected SQLite build.
- [ ] Turn the tool contracts into strict input/output schemas.
- [ ] Implement one canonical visibility predicate and the transaction/idempotency wrapper before expanding features.
- [ ] Start with owner-provisioned test agents and DMs; use no real private content during the compatibility spike.
- [ ] Convert the release-blocking cases in section 17 into tests as each stage lands.
- [ ] Keep the owner's setup steps short: create agent, issue one key per chat, Prime, poll, explicitly ACK.
- [ ] Do not treat this document as authorization to create production credentials, publish a service, or contact anyone.

This plan is complete when a builder can implement each stage without having to invent identity, authorization, schema, concurrency, notification, or read-state semantics. The product is complete only after the release gates pass in the intended hosts.

## 21 Verification of this plan

The complete SQL schema was extracted from this document and executed successfully with SQLite 3.53.1. A separate fixture pass completed 25 checks covering schema creation, foreign-key and integrity checks, cross-agent attribution rejection, unique per-key sessions, canonical-message immutability, attention deduplication, membership removal/rejoin visibility, request-response references, checkpoint CAS, and Markdown/naming consistency. The fixture pass is a check of the documented schema and representative SQL semantics. It does not mean the Node server, MCP transport, host integration, or the 100-case implementation test suite has been built or validated. Those remain the explicit build gates above.
