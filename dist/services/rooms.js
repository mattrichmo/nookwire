import { fail } from '../types.js';
import { assertRevision, sequence, iso } from '../util.js';
import { decodeCursor, encodeCursor, budget } from './pagination.js';
export function listRooms(core, c, p) {
    const cursor = decodeCursor(p.cursor, 'rooms', c.agent_id, {}, false), limit = Math.min(p.limit ?? 20, core.limits.page_max);
    const candidates = core.r.all(`SELECT r.*,rm.membership_id,rm.joined_after_seq,rm.follow_mode,rm.preference_revision,COALESCE((SELECT MAX(b.revision) FROM room_brief_versions b WHERE b.room_id=r.room_id),0) brief_revision FROM room_memberships rm JOIN rooms r ON r.room_id=rm.room_id WHERE rm.agent_id=? AND rm.left_at_ms IS NULL AND r.room_id>? ORDER BY r.room_id LIMIT ?`, c.agent_id, cursor.after, limit + 1);
    const page = budget(candidates, limit, core.limits.page_bytes, row => core.roomRef(row));
    return { items: page.items, has_more: page.has_more, next_cursor: page.has_more ? encodeCursor({ ...cursor, after: page.rows.at(-1).room_id }) : null };
}
export function roomGet(core, c, p) {
    const member = core.member(c, p.room_id), room = core.room(p.room_id);
    return { room_id: room.room_id, slug: room.slug, name: room.display_name, description: room.description, archived: !!Number(room.archived), membership: { membership_id: String(member.membership_id), joined_after_seq: String(member.joined_after_seq), follow_mode: member.follow_mode, preference_revision: String(member.preference_revision) }, members: core.r.all(`SELECT a.agent_id,a.display_name FROM room_memberships rm JOIN agents a ON a.agent_id=rm.agent_id WHERE rm.room_id=? AND rm.left_at_ms IS NULL ORDER BY a.agent_id LIMIT ?`, p.room_id, core.limits.room_members).map(x => ({ agent_id: x.agent_id, name: x.display_name })) };
}
export function roomFollow(core, c, p) {
    const m = core.member(c, p.room_id);
    assertRevision(m.preference_revision, p.expected_preference_revision);
    const changed = core.r.run('UPDATE room_memberships SET follow_mode=?,preference_revision=preference_revision+1 WHERE membership_id=? AND agent_id=? AND left_at_ms IS NULL AND preference_revision=?', p.mode, m.membership_id, c.agent_id, sequence(p.expected_preference_revision));
    if (Number(changed.changes) !== 1)
        fail('REVISION_CONFLICT');
    return { room_id: p.room_id, membership_id: String(m.membership_id), mode: p.mode, preference_revision: String(BigInt(m.preference_revision) + 1n) };
}
export function briefUpdate(core, c, p) {
    const m = core.member(c, p.room_id);
    core.writable(m);
    const revision = core.r.scalar('SELECT COALESCE(MAX(revision),0) FROM room_brief_versions WHERE room_id=?', p.room_id);
    assertRevision(revision, p.expected_revision);
    core.r.run(`INSERT INTO room_brief_versions(room_id,revision,brief_md,author_kind,author_agent_id,author_session_id,created_at_ms) VALUES(?,?,?,'agent',?,?,?)`, p.room_id, revision + 1n, p.brief_md, c.agent_id, c.session_id, core.now());
    return { room_id: p.room_id, revision: String(revision + 1n), author_agent_id: c.agent_id, author_session_id: c.session_id, stored_at: iso(core.now()) };
}
//# sourceMappingURL=rooms.js.map