import { fail } from '../types.js';
import { assertRevision, canonical, iso, sequence } from '../util.js';
import { decodeCursor, encodeCursor, budget } from './pagination.js';
export function computeReasons(mode, mentioned, replied, requested) {
    if (mode === 'mute')
        return 0;
    let bits = mode === 'all' ? 2 : 0;
    if (mentioned && (mode !== 'replies' || requested))
        bits |= 4;
    if (replied)
        bits |= 8;
    if (requested)
        bits |= 16;
    return bits;
}
/** Every insert, synchronous fan-out, request row and receipt is committed by the outer transaction. */
export function sendMessage(core, c, p, response) {
    const dest = p.destination, mentions = p.mention_agent_ids ?? [], requested = p.reply_requested_agent_ids ?? [];
    const room = dest.kind === 'room' ? core.member(c, dest.room_id) : null;
    let members = [];
    if (room) {
        core.writable(room);
        members = core.r.all(`SELECT rm.*,a.status FROM room_memberships rm JOIN agents a ON a.agent_id=rm.agent_id WHERE rm.room_id=? AND rm.left_at_ms IS NULL ORDER BY rm.agent_id LIMIT ?`, dest.room_id, core.limits.room_members + 1);
        if (members.length > core.limits.room_members)
            fail('LIMIT_EXCEEDED');
    }
    else {
        if (dest.recipient_agent_id === c.agent_id)
            fail('INVALID_ARGUMENT');
        core.agent(dest.recipient_agent_id, true);
    }
    for (const target of [...mentions, ...requested]) {
        if (target === c.agent_id)
            fail('INVALID_ARGUMENT');
        if (room) {
            if (!members.some(m => m.agent_id === target && m.status === 'active'))
                fail('INVALID_ARGUMENT');
        }
        else if (target !== dest.recipient_agent_id)
            fail('INVALID_ARGUMENT');
    }
    if (room && requested.some(id => !mentions.includes(id)))
        fail('INVALID_ARGUMENT');
    let parent;
    if (p.reply_to_message_id) {
        parent = core.message(c, p.reply_to_message_id);
        if (dest.kind === 'room' ? parent.channel_kind !== 'room' || parent.room_id !== dest.room_id : parent.channel_kind !== 'dm' || ![parent.author_agent_id, parent.dm_recipient_agent_id].includes(c.agent_id) || ![parent.author_agent_id, parent.dm_recipient_agent_id].includes(dest.recipient_agent_id))
            fail('INVALID_ARGUMENT');
    }
    core.consumeQuota(`write:agent:${c.agent_id}`, core.limits.writes_per_agent);
    const id = core.id(), now = core.now();
    const insert = core.r.run(`INSERT INTO messages(message_id,channel_kind,room_id,dm_recipient_agent_id,author_agent_id,author_session_id,author_membership_id,author_profile_version,body_md,payload_json,reply_parent_seq,thread_root_seq,response_to_request_seq,response_status,created_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, dest.kind, room ? dest.room_id : null, room ? null : dest.recipient_agent_id, c.agent_id, c.session_id, room?.membership_id ?? null, c.profile_version_seen, p.body_md, p.payload === undefined ? null : canonical(p.payload), parent?.message_seq ?? null, parent ? (parent.thread_root_seq ?? parent.message_seq) : null, response?.request.message_seq ?? null, response?.status ?? null, now);
    const seq = BigInt(insert.lastInsertRowid);
    for (const target of mentions)
        core.r.run('INSERT INTO message_mentions(message_seq,mentioned_agent_id) VALUES(?,?)', seq, target);
    for (const target of requested)
        core.r.run('INSERT INTO reply_requests(message_seq,recipient_agent_id,updated_at_ms) VALUES(?,?,?)', seq, target, now);
    for (const f of p.files ?? [])
        core.r.run('INSERT INTO message_files(file_id,message_seq,display_name,url,media_type,version_label,content_sha256,commit_hash,created_at_ms) VALUES(?,?,?,?,?,?,?,?,?)', core.id(), seq, f.display_name, f.url, f.media_type ?? null, f.version_label ?? null, f.content_sha256?.toLowerCase() ?? null, f.commit_hash?.toLowerCase() ?? null, now);
    let recipients = 0;
    if (!room) {
        let bits = 1;
        if (mentions.includes(dest.recipient_agent_id))
            bits |= 4;
        if (parent?.author_agent_id === dest.recipient_agent_id)
            bits |= 8;
        if (requested.includes(dest.recipient_agent_id))
            bits |= 16;
        core.r.run('INSERT INTO attention_items(agent_id,message_seq,reason_bits,created_at_ms) VALUES(?,?,?,?)', dest.recipient_agent_id, seq, bits, now);
        recipients = 1;
    }
    else
        for (const m of members) {
            if (m.agent_id === c.agent_id || m.status !== 'active')
                continue;
            const bits = computeReasons(m.follow_mode, mentions.includes(m.agent_id), parent?.author_agent_id === m.agent_id, requested.includes(m.agent_id));
            if (bits) {
                core.r.run('INSERT INTO attention_items(agent_id,message_seq,room_id,membership_id,reason_bits,created_at_ms) VALUES(?,?,?,?,?,?)', m.agent_id, seq, dest.room_id, m.membership_id, bits, now);
                recipients++;
            }
        }
    return { message_id: id, message_seq: String(seq), stored_at: iso(now), attention_recipient_count: recipients, response_request_count: requested.length };
}
export function requestRespond(core, c, p) {
    const request = core.message(c, p.request_message_id);
    const row = core.r.one('SELECT * FROM reply_requests WHERE message_seq=? AND recipient_agent_id=?', request.message_seq, c.agent_id);
    if (!row)
        fail('NOT_FOUND_OR_FORBIDDEN');
    assertRevision(row.revision, p.expected_revision);
    const dest = request.channel_kind === 'room' ? { kind: 'room', room_id: request.room_id } : { kind: 'dm', recipient_agent_id: request.author_agent_id };
    const response = sendMessage(core, c, { destination: dest, body_md: p.body_md, files: p.files, reply_to_message_id: request.message_id }, { request, status: p.status });
    const changes = core.r.run('UPDATE reply_requests SET status=?,revision=revision+1,latest_response_message_seq=?,updated_at_ms=? WHERE message_seq=? AND recipient_agent_id=? AND revision=?', p.status, sequence(response.message_seq), core.now(), request.message_seq, c.agent_id, sequence(p.expected_revision));
    if (Number(changes.changes) !== 1)
        fail('REVISION_CONFLICT');
    return { ...response, request_message_id: request.message_id, status: p.status, revision: String(BigInt(row.revision) + 1n), self_declared: true };
}
export function fileReport(core, c, p) {
    const { f, m } = core.file(c, p.file_id);
    if (m.author_agent_id === c.agent_id)
        fail('NOT_FOUND_OR_FORBIDDEN');
    const old = core.r.one('SELECT * FROM file_access_reports WHERE file_id=? AND agent_id=?', p.file_id, c.agent_id);
    assertRevision(old?.revision ?? 0n, p.expected_revision);
    if (!old)
        core.r.run('INSERT INTO file_access_reports(file_id,agent_id,revision,access_status,reported_by_session_id,reported_at_ms) VALUES(?,?,1,?,?,?)', f.file_id, c.agent_id, p.access_status, c.session_id, core.now());
    else if (Number(core.r.run('UPDATE file_access_reports SET revision=revision+1,access_status=?,reported_by_session_id=?,reported_at_ms=? WHERE file_id=? AND agent_id=? AND revision=?', p.access_status, c.session_id, core.now(), f.file_id, c.agent_id, sequence(p.expected_revision)).changes) !== 1)
        fail('REVISION_CONFLICT');
    return { file_id: f.file_id, agent_id: c.agent_id, revision: String(BigInt(old?.revision ?? 0n) + 1n), access_status: p.access_status, reported_by_session_id: c.session_id, reported_at_ms: core.now(), self_reported: true };
}
/** Explicit extension: bounds report children without making a maximum-sized message unreadable. */
export function fileReportsList(core, c, p) {
    const { f, m } = core.file(c, p.file_id), cursor = decodeCursor(p.cursor, 'file_reports', c.agent_id, { file_id: f.file_id }, false);
    const limit = Math.min(p.limit ?? 20, core.limits.page_max), author = m.author_agent_id === c.agent_id;
    const candidates = core.r.all(`SELECT * FROM file_access_reports WHERE file_id=? AND agent_id>? ${author ? '' : 'AND agent_id=?'} ORDER BY agent_id LIMIT ?`, f.file_id, cursor.after, ...(author ? [] : [c.agent_id]), limit + 1);
    const page = budget(candidates, limit, core.limits.page_bytes, x => ({ file_id: x.file_id, agent_id: x.agent_id, revision: String(x.revision), access_status: x.access_status, reported_by_session_id: x.reported_by_session_id, reported_at_ms: Number(x.reported_at_ms), self_reported: true }));
    return { items: page.items, has_more: page.has_more, next_cursor: page.has_more ? encodeCursor({ ...cursor, after: page.rows.at(-1).agent_id }) : null, current_state_browser: true };
}
//# sourceMappingURL=messages.js.map