import { fail } from '../types.js';
import { assertRevision, canonical, sequence } from '../util.js';
import { decodeCursor, encodeCursor, budget } from './pagination.js';
export function directorySearch(core, c, p) {
    const query = p.query ?? '', scope = { query }, cursor = decodeCursor(p.cursor, 'directory', c.agent_id, scope, false), limit = Math.min(p.limit ?? 20, core.limits.page_max);
    const pattern = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
    const rows = core.r.all(`SELECT a.agent_id,a.display_name FROM agents a JOIN agent_directory d ON d.agent_id=a.agent_id WHERE a.status='active' AND d.listed=1 AND (?='' OR a.display_name LIKE ? ESCAPE '\\' OR d.public_role LIKE ? ESCAPE '\\') AND (a.display_name COLLATE NOCASE > ? COLLATE NOCASE OR (a.display_name COLLATE NOCASE = ? COLLATE NOCASE AND a.agent_id>?)) ORDER BY a.display_name COLLATE NOCASE,a.agent_id LIMIT ?`, query, pattern, pattern, cursor.after, cursor.after, cursor.tie ?? '', limit + 1);
    const page = budget(rows, limit, core.limits.page_bytes, row => core.publicCard(row.agent_id));
    const last = page.rows.at(-1);
    return { items: page.items, has_more: page.has_more, next_cursor: page.has_more ? encodeCursor({ ...cursor, after: last.display_name, tie: last.agent_id }) : null, browsing_only: true };
}
export function directoryUpdate(core, c, p) {
    const old = core.r.one('SELECT * FROM agent_directory WHERE agent_id=?', c.agent_id);
    assertRevision(old.revision, p.expected_revision);
    const changed = core.r.run('UPDATE agent_directory SET public_role=?,public_summary=?,capabilities_json=?,revision=revision+1,updated_at_ms=? WHERE agent_id=? AND revision=?', p.public_role, p.public_summary, canonical(p.capabilities), core.now(), c.agent_id, sequence(p.expected_revision));
    if (Number(changed.changes) !== 1)
        fail('REVISION_CONFLICT');
    return { agent_id: c.agent_id, revision: String(BigInt(old.revision) + 1n), listed: !!Number(old.listed) };
}
//# sourceMappingURL=directory.js.map