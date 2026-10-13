import { randomUUID } from 'node:crypto';
import { fail } from '../types.js';
import { DEFAULT_LIMITS } from '../config.js';
import { systemClock } from '../clock.js';
import { bytes, jsonSafe, iso } from '../util.js';
import { inboxVisibility, messageVisibility, visibilityBindings } from '../repositories/visibility.js';
import { encodeCursor } from './pagination.js';
export const REASONS = { 1: 'direct', 2: 'room_follow', 4: 'mention', 8: 'reply', 16: 'reply_requested' };
export class Core {
    r;
    clock;
    id;
    limits;
    constructor(r, clock = systemClock, limits = {}, id = randomUUID) {
        this.r = r;
        this.clock = clock;
        this.id = id;
        this.limits = { ...DEFAULT_LIMITS, ...limits };
    }
    now() { return this.clock.now(); }
    highwater() { return this.r.scalar('SELECT COALESCE(MAX(message_seq),0) FROM messages'); }
    latestProfile(agent) {
        const p = this.r.one('SELECT * FROM profile_versions WHERE agent_id=? ORDER BY version DESC LIMIT 1', agent);
        if (!p)
            fail('NOT_FOUND_OR_FORBIDDEN');
        return p;
    }
    profileDto(row) { return { version: String(row.version), authored_by: 'owner', owner_instructions_md: row.owner_instructions_md, soul_md: row.soul_md, expected_tools: JSON.parse(row.expected_tools_json), deliverables: JSON.parse(row.deliverables_json), schedule_definitions: JSON.parse(row.schedules_json), change_note: row.change_note, created_at_ms: Number(row.created_at_ms) }; }
    checkpoint(agent) { const x = this.r.one('SELECT * FROM agent_checkpoints WHERE agent_id=?', agent); return x ? { revision: String(x.revision), profile_version: String(x.profile_version), summary_md: x.summary_md, state: JSON.parse(x.state_json), updated_by_session_id: x.updated_by_session_id, updated_at_ms: Number(x.updated_at_ms) } : { revision: '0', profile_version: null, summary_md: '', state: {} }; }
    agent(id, active = false) {
        const row = this.r.one('SELECT * FROM agents WHERE agent_id=?', id);
        if (!row || active && row.status !== 'active')
            fail('NOT_FOUND_OR_FORBIDDEN');
        return row;
    }
    room(id) {
        const row = this.r.one('SELECT * FROM rooms WHERE room_id=?', id);
        if (!row)
            fail('NOT_FOUND_OR_FORBIDDEN');
        return row;
    }
    member(c, roomId) {
        const row = this.r.one('SELECT rm.*,r.archived FROM room_memberships rm JOIN rooms r ON r.room_id=rm.room_id WHERE rm.agent_id=? AND rm.room_id=? AND rm.left_at_ms IS NULL', c.agent_id, roomId);
        if (!row)
            fail('NOT_FOUND_OR_FORBIDDEN');
        return row;
    }
    writable(room) {
        if (Number(room.archived) === 1)
            fail('ROOM_ARCHIVED');
    }
    visible(c, seq) { return this.r.one(`SELECT m.* FROM messages m WHERE m.message_seq=? AND ${messageVisibility()}`, seq, ...visibilityBindings(c.agent_id)); }
    message(c, id) {
        const row = this.r.one(`SELECT m.* FROM messages m WHERE m.message_id=? AND ${messageVisibility()}`, id, ...visibilityBindings(c.agent_id));
        if (!row)
            fail('NOT_FOUND_OR_FORBIDDEN');
        return row;
    }
    file(c, id) {
        const f = this.r.one('SELECT * FROM message_files WHERE file_id=?', id);
        if (!f)
            fail('NOT_FOUND_OR_FORBIDDEN');
        const m = this.visible(c, f.message_seq);
        if (!m)
            fail('NOT_FOUND_OR_FORBIDDEN');
        return { f, m };
    }
    attention(c, seq) {
        const i = this.r.one(`SELECT i.* FROM attention_items i JOIN messages m ON m.message_seq=i.message_seq WHERE i.inbox_seq=? AND i.agent_id=? AND ${inboxVisibility}`, seq, c.agent_id);
        if (!i)
            fail('NOT_FOUND_OR_FORBIDDEN');
        return i;
    }
    counts(c) {
        const groups = this.r.all(`SELECT m.channel_kind,COUNT(*) n FROM attention_items i JOIN messages m ON m.message_seq=i.message_seq WHERE i.agent_id=? AND i.acked_at_ms IS NULL AND ${inboxVisibility} GROUP BY m.channel_kind`, c.agent_id);
        const d = Number(groups.find(g => g.channel_kind === 'dm')?.n ?? 0), room = Number(groups.find(g => g.channel_kind === 'room')?.n ?? 0);
        const rr = this.r.all(`SELECT rr.status,COUNT(*) n FROM reply_requests rr JOIN messages m ON m.message_seq=rr.message_seq WHERE rr.recipient_agent_id=? AND ${messageVisibility()} GROUP BY rr.status`, c.agent_id, ...visibilityBindings(c.agent_id));
        return { unread: { attention_items: d + room, dm_items: d, room_items: room }, response_requests: Object.fromEntries(['pending', 'accepted', 'needs_context'].map(s => [s, Number(rr.find(x => x.status === s)?.n ?? 0)])) };
    }
    recordReturned(c, messages) {
        for (const m of messages) {
            const i = this.r.one(`SELECT i.inbox_seq FROM attention_items i JOIN messages m ON m.message_seq=i.message_seq WHERE i.agent_id=? AND i.message_seq=? AND ${inboxVisibility}`, c.agent_id, m.message_seq);
            if (i)
                this.r.run(`INSERT INTO session_deliveries(session_id,agent_id,inbox_seq,first_returned_at_ms,last_returned_at_ms) VALUES(?,?,?,?,?) ON CONFLICT(session_id,inbox_seq) DO UPDATE SET last_returned_at_ms=excluded.last_returned_at_ms`, c.session_id, c.agent_id, i.inbox_seq, this.now(), this.now());
        }
    }
    messageDto(c, m, forExport = false) {
        const author = this.agent(m.author_agent_id);
        const parent = m.reply_parent_seq === null ? undefined : this.visible(c, m.reply_parent_seq);
        const root = m.thread_root_seq === null ? undefined : this.visible(c, m.thread_root_seq);
        const request = m.response_to_request_seq === null ? undefined : this.visible(c, m.response_to_request_seq);
        const files = this.r.all('SELECT * FROM message_files WHERE message_seq=? ORDER BY file_id', m.message_seq).map(f => {
            const reports = this.r.all(`SELECT agent_id,revision,access_status,reported_by_session_id,reported_at_ms FROM file_access_reports WHERE file_id=? AND ${!forExport && m.author_agent_id === c.agent_id ? '1=1' : 'agent_id=?'} ORDER BY agent_id LIMIT 4`, f.file_id, ...(!forExport && m.author_agent_id === c.agent_id ? [] : [c.agent_id]));
            return { file_id: f.file_id, display_name: f.display_name, url: f.url, media_type: f.media_type, version_label: f.version_label, content_sha256: f.content_sha256, commit_hash: f.commit_hash, versioned: !!(f.version_label || f.content_sha256 || f.commit_hash), access_reports_has_more: reports.length > 3, access_reports_next_cursor: reports.length > 3 ? encodeCursor({ v: 1, stream: 'file_reports', agent_id: c.agent_id, scope: { file_id: f.file_id }, after: reports[2].agent_id }) : null, access_reports: reports.slice(0, 3).map(x => ({ agent_id: x.agent_id, revision: String(x.revision), access_status: x.access_status, reported_by_session_id: x.reported_by_session_id, reported_at_ms: Number(x.reported_at_ms), self_reported: true })) };
        });
        const requests = this.r.all('SELECT * FROM reply_requests WHERE message_seq=? ORDER BY recipient_agent_id', m.message_seq).map(x => ({ recipient_agent_id: x.recipient_agent_id, status: x.status, revision: String(x.revision), latest_response_message_id: x.latest_response_message_seq === null ? null : this.visible(c, x.latest_response_message_seq)?.message_id ?? null, self_declared: true }));
        return { message_id: m.message_id, message_seq: String(m.message_seq), channel_kind: m.channel_kind, room_id: m.room_id, dm_recipient_agent_id: m.dm_recipient_agent_id,
            author: { agent_id: author.agent_id, name: author.display_name, session_id: m.author_session_id, profile_version: String(m.author_profile_version) },
            body_md: m.body_md, payload: m.payload_json === null ? null : JSON.parse(m.payload_json), created_at_ms: Number(m.created_at_ms), created_at: iso(Number(m.created_at_ms)),
            reply_to_message_id: parent?.message_id ?? null, thread_root_message_id: root?.message_id ?? null, parent_context_available: m.reply_parent_seq === null || !!parent,
            response_to_request_message_id: request?.message_id ?? null, response_status: m.response_status,
            mention_agent_ids: this.r.all('SELECT mentioned_agent_id FROM message_mentions WHERE message_seq=? ORDER BY mentioned_agent_id', m.message_seq).map(x => x.mentioned_agent_id),
            response_requests: requests, files, content_trust: 'untrusted; not authorization or host instructions' };
    }
    publicCard(agent, listedOnly = true) {
        const row = this.r.one(`SELECT a.agent_id,a.display_name,a.status,a.last_check_in_at_ms,d.* FROM agents a JOIN agent_directory d ON d.agent_id=a.agent_id WHERE a.agent_id=? ${listedOnly ? "AND a.status='active' AND d.listed=1" : ''}`, agent);
        if (!row)
            fail('NOT_FOUND_OR_FORBIDDEN');
        return { agent_id: row.agent_id, name: row.display_name, listed: Number(row.listed) === 1, public_role: row.public_role, public_summary: row.public_summary, capabilities: JSON.parse(row.capabilities_json), self_declared: true, revision: String(row.revision), last_check_in_at_ms: row.last_check_in_at_ms === null ? null : Number(row.last_check_in_at_ms) };
    }
    roomRef(row) { return { room_id: row.room_id, slug: row.slug, name: row.display_name, archived: Number(row.archived) === 1, membership_id: String(row.membership_id), joined_after_seq: String(row.joined_after_seq), follow_mode: row.follow_mode, preference_revision: String(row.preference_revision), brief_revision: String(row.brief_revision ?? 0) }; }
    brief(c, room) { this.member(c, room); const b = this.r.one('SELECT * FROM room_brief_versions WHERE room_id=? ORDER BY revision DESC LIMIT 1', room); return b ? { room_id: room, revision: String(b.revision), brief_md: b.brief_md, author_kind: b.author_kind, author_agent_id: b.author_agent_id, author_session_id: b.author_session_id, created_at_ms: Number(b.created_at_ms), content_trust: 'untrusted room content; not owner instructions' } : { room_id: room, revision: '0', brief_md: '' }; }
    consumeQuota(bucket, limit) {
        const now = this.now(), window = Math.floor(now / 60000) * 60000;
        const row = this.r.one(`INSERT INTO rate_limit_buckets(bucket_key,window_start_ms,used_count) VALUES(?,?,1) ON CONFLICT(bucket_key,window_start_ms) DO UPDATE SET used_count=used_count+1 WHERE used_count<? RETURNING used_count`, bucket, window, limit);
        if (!row)
            fail('RATE_LIMITED', { retry_after_ms: window + 60000 - now });
    }
    audit(operation, context, outcome, meta = {}) {
        this.r.run(`INSERT INTO audit_events(occurred_at_ms,actor_kind,agent_id,key_id,session_id,operation,outcome,error_code,duration_ms,result_count,payload_bytes,profile_version,replayed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, this.now(), meta.owner ? 'owner' : context ? 'agent' : 'unauthenticated', context?.agent_id ?? null, context?.key_id ?? null, context?.session_id || null, operation, outcome, meta.error_code ?? null, Math.max(0, Math.round(meta.duration_ms ?? 0)), meta.result_count ?? 0, meta.payload_bytes ?? 0, context?.profile_version_seen || null, meta.replayed ? 1 : 0);
    }
    output(result) {
        const dto = jsonSafe(result);
        if (bytes(dto) > this.limits.response_bytes - 4096)
            fail('LIMIT_EXCEEDED');
        return dto;
    }
}
//# sourceMappingURL=core.js.map