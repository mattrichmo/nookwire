import { createRequire } from 'node:module';
import { createReadStream, existsSync, lstatSync, openSync, closeSync, writeFileSync, readFileSync, rmSync, renameSync, copyFileSync, chmodSync, fsyncSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Repo as Repository } from './open.js';
import { migrationFiles } from './migrate.js';
import { sha256 } from '../util.js';
const require = createRequire(import.meta.url);
export function acquireServiceLock(dbPath) {
    const path = dbPath + '.service-lock';
    const fd = openSync(path, 'wx', 0o600);
    try {
        writeFileSync(fd, JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() }));
        fsyncSync(fd);
    }
    finally {
        closeSync(fd);
    }
    return () => rmSync(path, { force: true });
}
export async function hashFile(path) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path))
        hash.update(chunk);
    return hash.digest('hex');
}
export function verifyRepo(repo) {
    const integrity = repo.all('PRAGMA integrity_check');
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok' || repo.all('PRAGMA foreign_key_check').length)
        throw new Error('Backup/database integrity or foreign-key verification failed.');
    const files = migrationFiles(), rows = repo.all('SELECT * FROM schema_migrations ORDER BY version');
    if (rows.length !== files.length || rows.some((r, i) => Number(r.version) !== files[i].version || r.name !== files[i].name || r.checksum_sha256 !== sha256(files[i].sql)))
        throw new Error('Backup/database migration compatibility failed.');
    const checks = {
        room_author_epoch: `SELECT COUNT(*) FROM messages m JOIN room_memberships rm ON rm.membership_id=m.author_membership_id WHERE m.channel_kind='room' AND (m.message_seq<=rm.joined_after_seq OR (rm.left_after_seq IS NOT NULL AND m.message_seq>rm.left_after_seq))`,
        reply_order: `SELECT COUNT(*) FROM messages m WHERE m.reply_parent_seq>=m.message_seq OR m.thread_root_seq>=m.message_seq`,
        reply_root: `SELECT COUNT(*) FROM messages m JOIN messages p ON p.message_seq=m.reply_parent_seq WHERE m.thread_root_seq<>COALESCE(p.thread_root_seq,p.message_seq)`,
        reply_conversation: `SELECT COUNT(*) FROM messages m JOIN messages p ON p.message_seq=m.reply_parent_seq WHERE m.channel_kind<>p.channel_kind OR (m.channel_kind='room' AND m.room_id<>p.room_id) OR (m.channel_kind='dm' AND NOT ((m.author_agent_id=p.author_agent_id AND m.dm_recipient_agent_id=p.dm_recipient_agent_id) OR (m.author_agent_id=p.dm_recipient_agent_id AND m.dm_recipient_agent_id=p.author_agent_id)))`,
        attention_identity: `SELECT COUNT(*) FROM attention_items i JOIN messages m ON m.message_seq=i.message_seq WHERE i.agent_id=m.author_agent_id OR (m.channel_kind='dm' AND (i.agent_id<>m.dm_recipient_agent_id OR i.room_id IS NOT NULL)) OR (m.channel_kind='room' AND (i.room_id IS NULL OR i.room_id<>m.room_id))`,
        attention_epoch: `SELECT COUNT(*) FROM attention_items i JOIN messages m ON m.message_seq=i.message_seq JOIN room_memberships rm ON rm.membership_id=i.membership_id WHERE m.message_seq<=rm.joined_after_seq OR (rm.left_after_seq IS NOT NULL AND m.message_seq>rm.left_after_seq)`,
        response_identity: `SELECT COUNT(*) FROM messages m WHERE m.response_to_request_seq IS NOT NULL AND m.reply_parent_seq<>m.response_to_request_seq`,
        latest_response: `SELECT COUNT(*) FROM reply_requests rr JOIN messages m ON m.message_seq=rr.latest_response_message_seq WHERE m.response_to_request_seq<>rr.message_seq OR m.author_agent_id<>rr.recipient_agent_id OR m.response_status<>rr.status`,
        file_author_report: `SELECT COUNT(*) FROM file_access_reports f JOIN message_files mf ON mf.file_id=f.file_id JOIN messages m ON m.message_seq=mf.message_seq WHERE f.agent_id=m.author_agent_id`,
        closed_active_key: `SELECT COUNT(*) FROM agent_sessions s JOIN box_keys k ON k.key_id=s.key_id WHERE k.status='revoked' AND s.closed_at_ms IS NULL`
    };
    for (const sql of Object.values(checks))
        if (repo.scalar(sql) !== 0n)
            throw new Error('A fixture-free domain invariant failed.');
    return { integrity: 'ok', foreign_keys: 'ok', invariant_checks: Object.keys(checks), schema_version: String(rows.at(-1).version), migration_checksums: rows.map(x => ({ version: String(x.version), name: x.name, sha256: x.checksum_sha256 })), counts: { agents: Number(repo.scalar('SELECT COUNT(*) FROM agents')), messages: Number(repo.scalar('SELECT COUNT(*) FROM messages')), attention_items: Number(repo.scalar('SELECT COUNT(*) FROM attention_items')), revoked_keys: Number(repo.scalar("SELECT COUNT(*) FROM box_keys WHERE status='revoked'")) } };
}
export function verifyPath(path, driver) {
    if (!existsSync(path) || lstatSync(path).isSymbolicLink())
        throw new Error('Verification requires an existing regular backup/database.');
    const db = driver ? driver(path) : new (require('better-sqlite3'))(path, { readonly: true, fileMustExist: true });
    if (!driver)
        db.defaultSafeIntegers(true);
    try {
        db.exec('PRAGMA foreign_keys=ON');
        return verifyRepo(new Repository(db, path));
    }
    finally {
        db.close();
    }
}
export async function backupDatabase(repo, destination) {
    if (resolve(destination) === resolve(repo.path) || existsSync(destination) || existsSync(destination + '.manifest.json'))
        throw new Error('Backup destination and manifest must be new paths.');
    const fd = openSync(destination, 'wx', 0o600);
    closeSync(fd);
    try {
        if (!repo.db.backup)
            throw new Error('This database driver does not implement the consistent backup API.');
        await repo.db.backup(destination);
        chmodSync(destination, 0o600);
        // Use migration metadata from source. Verify the destination in the release/restore gate.
        const manifest = { format: 'nookwire-backup-v1', created_at: new Date().toISOString(), sha256: await hashFile(destination), schema_version: String(repo.scalar('SELECT MAX(version) FROM schema_migrations')), migration_checksums: repo.all('SELECT version,name,checksum_sha256 FROM schema_migrations ORDER BY version').map(x => ({ version: String(x.version), name: x.name, sha256: x.checksum_sha256 })), revocation_warning: 'This backup may predate a revocation. Offline restore revokes ALL restored active keys before exposing the database.' };
        writeFileSync(destination + '.manifest.json', JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        return manifest;
    }
    catch (e) {
        rmSync(destination, { force: true });
        throw e;
    }
}
export async function restoreDatabase(source, destination, driver) {
    if (resolve(source) === resolve(destination))
        throw new Error('Restore source and destination must differ.');
    const unlock = acquireServiceLock(destination);
    const stage = destination + '.restore-' + randomUUID();
    let preRestoreBackup = null;
    try {
        const manifest = JSON.parse(readFileSync(source + '.manifest.json', 'utf8'));
        if (manifest.format !== 'nookwire-backup-v1' || manifest.sha256 !== await hashFile(source))
            throw new Error('Backup checksum/manifest failed.');
        verifyPath(source, driver);
        if (existsSync(destination)) {
            if (lstatSync(destination).isSymbolicLink())
                throw new Error('Refusing symlink restore target.');
            const db = driver ? driver(destination) : new (require('better-sqlite3'))(destination);
            if (!driver)
                db.defaultSafeIntegers(true);
            try {
                db.exec('PRAGMA foreign_keys=ON');
                preRestoreBackup = destination + '.pre-restore-' + randomUUID() + '.sqlite';
                await backupDatabase(new Repository(db, destination), preRestoreBackup);
            }
            finally {
                db.close();
            }
        }
        copyFileSync(source, stage);
        chmodSync(stage, 0o600);
        const restored = driver ? driver(stage) : new (require('better-sqlite3'))(stage);
        if (!driver)
            restored.defaultSafeIntegers(true);
        let revoked = 0;
        try {
            restored.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; BEGIN IMMEDIATE');
            const now = Date.now();
            revoked = Number(restored.prepare("UPDATE box_keys SET status='revoked',revoked_at_ms=MAX(created_at_ms,?) WHERE status='active'").run(now).changes);
            restored.prepare('UPDATE agent_sessions SET closed_at_ms=MAX(created_at_ms,?) WHERE closed_at_ms IS NULL').run(now);
            restored.exec('COMMIT');
            verifyRepo(new Repository(restored, stage));
        }
        finally {
            restored.close();
        }
        const fd = openSync(stage, 'r');
        try {
            fsyncSync(fd);
        }
        finally {
            closeSync(fd);
        }
        // The offline lock excludes the supported service/restore entrypoints. Preserve old WAL data in the pre-restore backup first.
        rmSync(destination + '-wal', { force: true });
        rmSync(destination + '-shm', { force: true });
        renameSync(stage, destination);
        chmodSync(destination, 0o600);
        return { restored: true, all_restored_keys_revoked: true, newly_revoked_keys: revoked, pre_restore_backup: preRestoreBackup, verification: verifyPath(destination, driver) };
    }
    finally {
        rmSync(stage, { force: true });
        unlock();
    }
}
//# sourceMappingURL=operations.js.map