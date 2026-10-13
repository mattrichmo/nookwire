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
