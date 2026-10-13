import { REASONS } from './core.js';
import { fail } from '../types.js';
import { sequence, iso } from '../util.js';
import { inboxVisibility, messageVisibility, visibilityBindings } from '../repositories/visibility.js';
import { decodeCursor, encodeCursor, budget, pageCursors } from './pagination.js';
export function inboxList(core, c, p) {
    const unread = p.unread_only ?? true, cursor = decodeCursor(p.cursor, 'inbox', c.agent_id, { unread_only: unread }), limit = Math.min(p.limit ?? 20, core.limits.page_max);
    const upper = cursor.upper ?? String(core.r.scalar('SELECT COALESCE(MAX(inbox_seq),0) FROM attention_items WHERE agent_id=?', c.agent_id));
    if (sequence(cursor.after) > sequence(upper))
        fail('CURSOR_INVALID');
    const rows = core.r.all(`SELECT i.inbox_seq,i.reason_bits,i.acked_at_ms,i.acked_by_session_id,m.* FROM attention_items i JOIN messages m ON m.message_seq=i.message_seq WHERE i.agent_id=? AND i.inbox_seq>? AND i.inbox_seq<=? AND (?=0 OR i.acked_at_ms IS NULL) AND ${inboxVisibility} ORDER BY i.inbox_seq LIMIT ?`, c.agent_id, sequence(cursor.after), sequence(upper), unread ? 1 : 0, limit + 1);
    const page = budget(rows, limit, core.limits.page_bytes, row => ({ inbox_seq: String(row.inbox_seq), reason_bits: Number(row.reason_bits), reasons: Object.entries(REASONS).filter(([bit]) => (Number(row.reason_bits) & Number(bit)) !== 0).map(([, name]) => name), acked_at_ms: row.acked_at_ms === null ? null : Number(row.acked_at_ms), acked_by_session_id: row.acked_by_session_id, message: core.messageDto(c, row) }));
    core.recordReturned(c, page.rows);
    return { items: page.items, ...pageCursors(cursor, upper, page.rows.at(-1)?.inbox_seq?.toString(), page.has_more), server_time: iso(core.now()) };
}
export function validateAck(core, c, p) {
    return p.inbox_seqs.map((id) => {
        const i = core.attention(c, sequence(id));
        if (!core.r.one('SELECT 1 FROM session_deliveries WHERE session_id=? AND agent_id=? AND inbox_seq=?', c.session_id, c.agent_id, sequence(id)))
            fail('NOT_FOUND_OR_FORBIDDEN');
        return i;
    });
}
export function inboxAck(core, c, p) {
    const rows = validateAck(core, c, p), acked = [], already = [];
    for (const row of rows) {
        if (row.acked_at_ms !== null) {
            already.push(String(row.inbox_seq));
            continue;
        }
        core.r.run('UPDATE attention_items SET acked_at_ms=?,acked_by_session_id=? WHERE agent_id=? AND inbox_seq=? AND acked_at_ms IS NULL', core.now(), c.session_id, c.agent_id, row.inbox_seq);
        acked.push(String(row.inbox_seq));
    }
    return { acked_count: acked.length, already_acked_count: already.length, acked_inbox_seqs: acked, already_acked_inbox_seqs: already };
}
export function requestsList(core, c, p) {
    const direction = p.direction ?? 'incoming', scope = { direction, status: p.status ?? null };
    const cursor = decodeCursor(p.cursor, 'requests', c.agent_id, scope), limit = Math.min(p.limit ?? 20, core.limits.page_max);
    const where = `${direction === 'incoming' ? 'rr.recipient_agent_id=?' : 'm.author_agent_id=?'} AND ${messageVisibility()} AND (? IS NULL OR rr.status=?)`;
    const binds = [c.agent_id, ...visibilityBindings(c.agent_id), p.status ?? null, p.status ?? null];
    const upper = cursor.upper ?? String(core.r.scalar(`SELECT COALESCE(MAX(m.message_seq),0) FROM reply_requests rr JOIN messages m ON m.message_seq=rr.message_seq WHERE ${where}`, ...binds));
    if (sequence(cursor.after) > sequence(upper))
        fail('CURSOR_INVALID');
    const rows = core.r.all(`SELECT m.*,rr.recipient_agent_id,rr.status AS declaration_status,rr.revision AS declaration_revision,rr.latest_response_message_seq,rr.updated_at_ms AS declaration_updated_at_ms FROM reply_requests rr JOIN messages m ON m.message_seq=rr.message_seq WHERE ${where} AND (m.message_seq>? OR (m.message_seq=? AND rr.recipient_agent_id>?)) AND m.message_seq<=? ORDER BY m.message_seq,rr.recipient_agent_id LIMIT ?`, ...binds, sequence(cursor.after), sequence(cursor.after), cursor.tie ?? '', sequence(upper), limit + 1);
    const page = budget(rows, limit, core.limits.page_bytes, row => ({ request_message_id: row.message_id, message_seq: String(row.message_seq), recipient_agent_id: row.recipient_agent_id, status: row.declaration_status, revision: String(row.declaration_revision), updated_at_ms: Number(row.declaration_updated_at_ms), latest_response_message_id: row.latest_response_message_seq === null ? null : core.visible(c, row.latest_response_message_seq)?.message_id ?? null, self_declared: true, request: core.messageDto(c, row) }));
    const last = page.rows.at(-1);
    const pagination = pageCursors(cursor, upper, last?.message_seq?.toString(), page.has_more, last?.recipient_agent_id);
    if (!page.has_more) {
        const { upper: ignored, ...resume } = cursor;
        pagination.resume_cursor = encodeCursor({ ...resume, after: upper, tie: '\uffff' });
    }
    return { items: page.items, ...pagination, current_state_browser: true, server_time: iso(core.now()) };
}
//# sourceMappingURL=inbox.js.map