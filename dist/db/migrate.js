import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { sha256 } from '../util.js';
export function migrationFiles(directory = fileURLToPath(new URL('./migrations/', import.meta.url))) {
    return readdirSync(directory).filter(n => /^\d{3}\.sql$/.test(n)).sort().map(name => ({ name, version: Number(name.slice(0, 3)), sql: readFileSync(join(directory, name), 'utf8') }));
}
export function migrate(repo, directory) {
    const files = migrationFiles(directory);
    if (!files.length || files.some((f, i) => f.version !== i + 1))
        throw new Error('Migration history must be contiguous and start at one.');
    const exists = repo.one("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'");
    const applied = exists ? repo.all('SELECT version,name,checksum_sha256 FROM schema_migrations ORDER BY version') : [];
    for (let i = 0; i < applied.length; i++) {
        const row = applied[i], f = files[i];
        if (!f || Number(row.version) !== f.version || row.name !== f.name || row.checksum_sha256 !== sha256(f.sql))
            throw new Error('Unknown or modified migration history; refusing startup.');
    }
    for (const f of files.slice(applied.length))
        repo.immediate(() => {
            repo.db.exec(f.sql);
            repo.run('INSERT INTO schema_migrations(version,name,checksum_sha256,applied_at_ms) VALUES(?,?,?,?)', f.version, f.name, sha256(f.sql), Date.now());
        });
}
//# sourceMappingURL=migrate.js.map