import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync, cpSync, mkdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { fixture, mid, expectCode } from './support/fixture.mjs';
import { driver } from './support/driver.mjs';
import { openDatabase, Repo } from '../dist/db/open.js';
import { migrate } from '../dist/db/migrate.js';
import { backupDatabase, verifyPath, verifyRepo, restoreDatabase, acquireServiceLock } from '../dist/db/operations.js';
import { Nookwire } from '../dist/services/runtime.js';
const setup = (t, o) => { const f = fixture(o); t.after(() => f.close()); return f; };
const pair = f => { const a = f.agent('Research'), b = f.agent('Builder'); f.prime(a); f.prime(b); return [a, b]; };
test('Exact 20-table schema, STRICT tables, JSON, indexes, triggers, WAL and foreign keys', t => { const f = setup(t); assert.equal(f.r.scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"), 20n); assert.equal(f.r.scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='trigger'"), 9n); assert.equal(f.r.one('PRAGMA journal_mode').journal_mode, 'wal'); assert.equal(f.r.one('PRAGMA foreign_keys').foreign_keys, 1n); assert.equal(f.r.one('PRAGMA synchronous').synchronous, 2n); assert.equal(f.r.one("SELECT json_valid('{}') j").j, 1n); assert.equal(f.r.all('PRAGMA table_list').filter(x => x.name === 'messages')[0].strict, 1n); assert.equal(verifyRepo(f.r).integrity, 'ok'); });
test('Schema rejects cross-agent attribution, bad payload root, duplicate sessions and paired NULL errors', t => { const f = setup(t), [a, b] = pair(f), pa = f.prime(a), pb = f.prime(b); const insert = (session, payload) => f.r.run("INSERT INTO messages(message_id,channel_kind,dm_recipient_agent_id,author_agent_id,author_session_id,author_profile_version,body_md,payload_json,created_at_ms) VALUES(?,'dm',?,?,?,?,?,?,?)", mid(), b.agent_id, a.agent_id, session, 1, 'body', payload, f.clock.now()); assert.throws(() => insert(pb.session.session_id, '{}')); assert.throws(() => insert(pa.session.session_id, '[]')); f.send(a, b); assert.throws(() => f.r.run('UPDATE attention_items SET acked_at_ms=?', f.clock.now())); assert.throws(() => f.r.run('INSERT INTO agent_sessions SELECT ?,key_id,agent_id,client_label,client_host,profile_version_seen,created_at_ms,last_primed_at_ms,last_used_at_ms,closed_at_ms FROM agent_sessions LIMIT 1', mid())); assert.throws(() => f.r.run("UPDATE messages SET body_md='changed'")); assert.throws(() => f.r.run('DELETE FROM messages')); });
test('Reapply known migration safely and reject changed checksums', t => { const f = setup(t); migrate(f.r); assert.equal(f.r.scalar('SELECT COUNT(*) FROM schema_migrations'), 1n); const directory = join(f.directory, 'migrations'); cpSync(new URL('../dist/db/migrations/', import.meta.url), directory, { recursive: true }); writeFileSync(join(directory, '001.sql'), readFileSync(join(directory, '001.sql'), 'utf8') + '\n-- altered\n'); assert.throws(() => migrate(f.r, directory)); assert.equal(verifyRepo(f.r).integrity, 'ok'); });
test('Unsupported future migration is rejected without executing it', t => { const f = setup(t); f.r.run('INSERT INTO schema_migrations(version,name,checksum_sha256,applied_at_ms) VALUES(999,?,?,?)', '999.sql', '0'.repeat(64), f.clock.now()); assert.throws(() => migrate(f.r)); f.r.run('DELETE FROM schema_migrations WHERE version=999'); assert.equal(verifyRepo(f.r).integrity, 'ok'); });
test('Failed second migration rolls back only that migration completely', t => { const f = setup(t), directory = join(f.directory, 'migrations'); cpSync(new URL('../dist/db/migrations/', import.meta.url), directory, { recursive: true }); writeFileSync(join(directory, '002.sql'), 'CREATE TABLE should_rollback(x TEXT) STRICT; SELECT missing_function();'); assert.throws(() => migrate(f.r, directory)); assert.equal(f.r.one("SELECT name FROM sqlite_master WHERE name='should_rollback'"), undefined); assert.equal(f.r.scalar('SELECT COUNT(*) FROM schema_migrations'), 1n); assert.equal(verifyRepo(f.r).integrity, 'ok'); });
test('Failed success-audit write rolls back message attention receipt and write quota', t => { const f = setup(t), [a, b] = pair(f), original = f.r.run.bind(f.r); f.r.run = (sql, ...p) => { if (sql.startsWith('INSERT INTO audit_events') && p[5] === 'message_send' && p[6] === 'success') {
    const e = new Error('injected');
    e.code = 'SQLITE_IOERR';
    throw e;
} return original(sql, ...p); }; try {
    expectCode(assert, () => f.send(a, b), 'STORAGE_FAILURE');
}
finally {
    f.r.run = original;
} assert.equal(f.r.scalar('SELECT COUNT(*) FROM messages'), 0n); assert.equal(f.r.scalar('SELECT COUNT(*) FROM attention_items'), 0n); assert.equal(f.r.scalar("SELECT COUNT(*) FROM idempotency_records WHERE operation='message_send'"), 0n); assert.equal(f.r.scalar("SELECT COALESCE(SUM(used_count),0) FROM rate_limit_buckets WHERE bucket_key LIKE 'write:%'"), 0n); });
test('Injected disk-full write fails safely and retry uses the same logical ID', t => { const f = setup(t), [a, b] = pair(f), id = mid(), original = f.r.run.bind(f.r); f.r.run = (sql, ...p) => { if (sql.startsWith('INSERT INTO messages')) {
    const e = new Error('SQL text and path must not escape');
    e.code = 'SQLITE_FULL';
    throw e;
} return original(sql, ...p); }; try {
    expectCode(assert, () => f.send(a, b, 'retry', { idempotency_key: id }), 'STORAGE_FAILURE');
}
finally {
    f.r.run = original;
} const done = f.send(a, b, 'retry', { idempotency_key: id }); assert.equal(done.replayed, false); assert.equal(f.r.scalar('SELECT COUNT(*) FROM messages'), 1n); });
test('Failure after fan-out but before receipt leaves no partial effects', t => { const f = setup(t), [a, b] = pair(f), id = mid(), original = f.r.run.bind(f.r); f.r.run = (sql, ...p) => { if (sql.startsWith('INSERT INTO idempotency_records') && p[1] === 'message_send')
    throw new Error('receipt failure'); return original(sql, ...p); }; try {
    expectCode(assert, () => f.send(a, b, 'atomic', { idempotency_key: id }), 'STORAGE_FAILURE');
}
finally {
    f.r.run = original;
} assert.equal(f.r.scalar('SELECT COUNT(*) FROM messages'), 0n); assert.equal(f.r.scalar('SELECT COUNT(*) FROM attention_items'), 0n); f.send(a, b, 'atomic', { idempotency_key: id }); assert.equal(f.r.scalar('SELECT COUNT(*) FROM messages'), 1n); });
test('Logical-write quotas survive restart and another key cannot bypass them', t => { const f = setup(t, { limits: { writes_per_agent: 2 } }), [a, b] = pair(f), id = mid(), a2 = { ...a, ...f.admin('key.issue', { agent_id: a.agent_id }) }; f.prime(a2); f.send(a, b, 'one', { idempotency_key: id }); f.send(a, b, 'two'); f.restart(); assert.equal(f.send(a2, b, 'one', { idempotency_key: id }).replayed, true); expectCode(assert, () => f.send(a2, b, 'three'), 'RATE_LIMITED'); f.tick(60000); f.send(a2, b, 'three'); assert.equal(f.r.scalar('SELECT COUNT(*) FROM messages'), 3n); });
test('Quotas are per-key and stable-agent for ordinary requests', t => { const f = setup(t, { limits: { requests_per_key: 2, requests_per_agent: 3 } }), a = f.agent(), a2 = { ...a, ...f.admin('key.issue', { agent_id: a.agent_id }) }; f.prime(a); f.call(a, 'checkpoint_get'); expectCode(assert, () => f.call(a, 'checkpoint_get'), 'RATE_LIMITED'); f.prime(a2); expectCode(assert, () => f.call(a2, 'checkpoint_get'), 'RATE_LIMITED'); });
test('Active key and room membership limits enforced', t => { const f = setup(t, { limits: { active_keys_per_agent: 1, room_members: 2, rooms_per_agent: 1 } }), [a, b] = pair(f), d = f.agent(); expectCode(assert, () => f.admin('key.issue', { agent_id: a.agent_id }), 'LIMIT_EXCEEDED'); const room = f.room([a, b]); expectCode(assert, () => f.admin('room.add', { room_id: room.room_id, agent_id: d.agent_id }), 'LIMIT_EXCEEDED'); const other = f.admin('room.create', { slug: 'other', name: 'Other' }); expectCode(assert, () => f.admin('room.add', { room_id: other.room_id, agent_id: a.agent_id }), 'LIMIT_EXCEEDED'); const current = f.admin('room.add', { room_id: room.room_id, agent_id: a.agent_id }); assert.equal(current.already_member, true); });
test('Backup verifies and preserves IDs ACKs profiles checkpoints receipts and revoked key state', async (t) => { const f = setup(t), [a, b] = pair(f), msg = f.send(a, b), mail = f.call(b, 'inbox_list'); f.mutation(b, 'inbox_ack', { inbox_seqs: [mail.items[0].inbox_seq] }); f.mutation(a, 'checkpoint_save', { expected_revision: '0', summary_md: 'checkpoint', state: {} }); f.admin('key.revoke', { key_id: a.key_id }); const backup = join(f.directory, 'backup.sqlite'), manifest = await backupDatabase(f.r, backup); assert.equal(manifest.format, 'nookwire-backup-v1'); const verified = verifyPath(backup, driver); assert.equal(verified.counts.messages, 1); assert.equal(verified.counts.revoked_keys, 1); const restored = openDatabase(backup, { driver }); try {
    assert.equal(restored.one('SELECT message_id FROM messages').message_id, msg.message_id);
    assert.equal(restored.scalar('SELECT COUNT(*) FROM attention_items WHERE acked_at_ms IS NOT NULL'), 1n);
    assert.equal(restored.scalar('SELECT COUNT(*) FROM agent_checkpoints'), 1n);
    assert.equal(restored.scalar("SELECT COUNT(*) FROM idempotency_records WHERE operation='message_send'"), 1n);
}
finally {
    restored.db.close();
} assert.equal(statSync(backup).mode & 0o777, 0o600); });
test('Offline restore revokes every restored active key including pre-revocation backups', async (t) => { const f = setup(t), [a, b] = pair(f); f.send(a, b); const backup = join(f.directory, 'old.sqlite'); await backupDatabase(f.r, backup); f.admin('key.revoke', { key_id: a.key_id }); const target = join(f.directory, 'restored.sqlite'), result = await restoreDatabase(backup, target, driver); assert.equal(result.all_restored_keys_revoked, true); assert.equal(result.newly_revoked_keys, 2); const r = openDatabase(target, { driver }); try {
    const app = new Nookwire(r);
    expectCode(assert, () => app.call('agent_prime', { box_key: a.box_key }), 'AUTH_FAILED');
    expectCode(assert, () => app.call('agent_prime', { box_key: b.box_key }), 'AUTH_FAILED');
    assert.equal(r.scalar('SELECT COUNT(*) FROM messages'), 1n);
}
finally {
    r.db.close();
} });
test('Restore refuses active service lock, corrupt backup and preserves existing destination', async (t) => { const f = setup(t), [a, b] = pair(f); f.send(a, b); const backup = join(f.directory, 'good.sqlite'); await backupDatabase(f.r, backup); const target = join(f.directory, 'target.sqlite'); const old = openDatabase(target, { driver }); old.db.close(); const unlock = acquireServiceLock(target); await assert.rejects(() => restoreDatabase(backup, target, driver)); unlock(); const result = await restoreDatabase(backup, target, driver); assert.equal(existsSync(result.pre_restore_backup), true); assert.equal(verifyPath(result.pre_restore_backup, driver).counts.messages, 0); writeFileSync(backup, Buffer.from('corrupted')); await assert.rejects(() => restoreDatabase(backup, target, driver)); assert.equal(verifyPath(target, driver).counts.messages, 1); });
test('Service lock is exclusive and missing durable directory is rejected', t => { const f = setup(t), release = acquireServiceLock(f.path); assert.throws(() => acquireServiceLock(f.path)); release(); assert.throws(() => openDatabase(join(f.directory, 'missing', 'db.sqlite'), { driver })); });
test('Maintenance prunes only explicitly old audit/quota and obsolete receipts, not history', t => { const f = setup(t), [a, b] = pair(f); f.send(a, b, 'read'); f.send(a, b, 'unread'); const p = f.call(b, 'inbox_list'); f.mutation(b, 'inbox_ack', { inbox_seqs: [p.items[0].inbox_seq] }); f.tick(120000); const result = f.admin('db.maintenance', { audit_before_ms: f.clock.now(), rates_before_ms: f.clock.now() - 60000, receipts_before_ms: f.clock.now() }); assert.equal(result.pruned_obsolete_receipts, 1); assert.equal(f.r.scalar('SELECT COUNT(*) FROM session_deliveries'), 1n); assert.equal(f.r.scalar('SELECT COUNT(*) FROM messages'), 2n); assert.equal(f.r.scalar('SELECT COUNT(*) FROM profile_versions'), 2n); assert.equal(f.r.scalar("SELECT COUNT(*) FROM idempotency_records WHERE operation='message_send'"), 2n); assert.equal(f.admin('audit.stats').stored_messages, 2); });
test('Bulk ACK is atomic when one item belongs to a different agent', t => { const f = setup(t), [a, b] = pair(f); f.send(a, b); f.send(b, a); const p = f.call(b, 'inbox_list'), other = f.call(a, 'inbox_list'); expectCode(assert, () => f.mutation(b, 'inbox_ack', { inbox_seqs: [p.items[0].inbox_seq, other.items[0].inbox_seq] }), 'NOT_FOUND_OR_FORBIDDEN'); assert.equal(f.r.scalar('SELECT COUNT(*) FROM attention_items WHERE acked_at_ms IS NOT NULL'), 0n); });
test('Room target validation rejects former disabled nonmember and self recipients as a whole', t => { const f = setup(t), [a, b] = pair(f), d = f.agent(), room = f.room([a, b]); for (const target of [a.agent_id, d.agent_id])
    expectCode(assert, () => f.post(a, room, 'bad', { mention_agent_ids: [target] }), 'INVALID_ARGUMENT'); f.admin('agent.status', { agent_id: b.agent_id, status: 'disabled' }); expectCode(assert, () => f.post(a, room, 'bad', { mention_agent_ids: [b.agent_id] }), 'INVALID_ARGUMENT'); f.admin('agent.status', { agent_id: b.agent_id, status: 'active' }); f.admin('room.remove', { room_id: room.room_id, agent_id: b.agent_id }); expectCode(assert, () => f.post(a, room, 'bad', { mention_agent_ids: [b.agent_id] }), 'INVALID_ARGUMENT'); assert.equal(f.r.scalar('SELECT COUNT(*) FROM messages'), 0n); });
test('Bounded file report previews expose explicit continuation and preserve privacy', t => { const f = setup(t), author = f.agent('Author'), viewers = Array.from({ length: 7 }, (_, i) => f.agent('Viewer ' + i)); f.prime(author); for (const v of viewers)
    f.prime(v); const room = f.room([author, ...viewers]), m = f.post(author, room, 'reference', { files: [{ display_name: 'ref', url: 'https://example.com/ref' }] }), file = f.call(author, 'message_get', { message_id: m.message_id }).message.files[0]; for (const v of viewers)
    f.mutation(v, 'file_access_report', { file_id: file.file_id, expected_revision: '0', access_status: 'accessible' }); const preview = f.call(author, 'message_get', { message_id: m.message_id }).message.files[0]; assert.equal(preview.access_reports.length, 3); assert.equal(preview.access_reports_has_more, true); let cursor, all = []; do {
    const p = f.call(author, 'file_reports_list', { file_id: file.file_id, limit: 2, ...(cursor ? { cursor } : {}) });
    all.push(...p.items);
    cursor = p.next_cursor;
} while (cursor); assert.equal(all.length, 7); assert.equal(f.call(viewers[0], 'file_reports_list', { file_id: file.file_id }).items.length, 1); f.admin('room.remove', { room_id: room.room_id, agent_id: author.agent_id }); expectCode(assert, () => f.call(author, 'file_reports_list', { file_id: file.file_id }), 'NOT_FOUND_OR_FORBIDDEN'); });
test('Seeded randomized joins removals sends follow ACK retries checkpoint saves match a reference model', t => { const f = setup(t), [a, b] = pair(f), room = f.room([a, b]); let seed = 0x12345678, joined = true, epoch = 1, mode = 'all', high = 0n, checkpoint = 0; const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed; }; const model = [], sends = []; for (let i = 0; i < 180; i++) {
    const op = rand() % 8;
    if (op === 0 || op === 1) {
        const mentioned = joined && (rand() % 2 === 0), id = mid(), m = f.post(a, room, 'message ' + i, { idempotency_key: id, ...(mentioned ? { mention_agent_ids: [b.agent_id] } : {}) });
        high = BigInt(m.message_seq);
        sends.push({ id, body: 'message ' + i, mentioned });
        let bits = joined && mode === 'all' ? 2 : 0;
        if (joined && mentioned && (mode === 'all' || mode === 'mentions'))
            bits |= 4;
        if (bits)
            model.push({ seq: m.message_seq, epoch, acked: false, bits });
    }
    else if (op === 2 && joined) {
        f.admin('room.remove', { room_id: room.room_id, agent_id: b.agent_id });
        joined = false;
    }
    else if (op === 3 && !joined) {
        f.admin('room.add', { room_id: room.room_id, agent_id: b.agent_id, mode: 'all' });
        joined = true;
        epoch++;
        mode = 'all';
    }
    else if (op === 4 && joined) {
        const row = f.call(b, 'room_get', { room_id: room.room_id });
        mode = ['all', 'mentions', 'replies', 'mute'][rand() % 4];
        f.mutation(b, 'room_follow', { room_id: room.room_id, expected_preference_revision: row.membership.preference_revision, mode });
    }
    else if (op === 5) {
        const page = f.call(b, 'inbox_list', { limit: 50 }), expected = joined ? model.filter(x => x.epoch === epoch && !x.acked) : [];
        assert.deepEqual(page.items.map(x => [x.message.message_seq, x.reason_bits]), expected.map(x => [x.seq, x.bits]));
        if (page.items.length) {
            f.mutation(b, 'inbox_ack', { inbox_seqs: page.items.map(x => x.inbox_seq) });
            for (const x of expected)
                x.acked = true;
        }
    }
    else if (op === 6) {
        f.mutation(b, 'checkpoint_save', { expected_revision: String(checkpoint), summary_md: 'checkpoint ' + i, state: { step: i } });
        checkpoint++;
    }
    else if (sends.length) {
        const last = sends.at(-1);
        f.post(a, room, last.body, { idempotency_key: last.id, ...(last.mentioned ? { mention_agent_ids: [b.agent_id] } : {}) });
    }
    assert.equal(f.r.scalar('SELECT COUNT(*) FROM messages'), BigInt(sends.length));
    assert.equal(f.r.scalar('SELECT COUNT(*) FROM attention_items WHERE agent_id=?', b.agent_id), BigInt(model.length));
} assert.equal(verifyRepo(f.r).integrity, 'ok'); });
