import { createRequire } from 'node:module';
import { isMainThread } from 'node:worker_threads';
import { dirname } from 'node:path';
import { chmodSync, existsSync, lstatSync, accessSync, constants } from 'node:fs';
import type { Database, Bind, Row } from '../types.js';
import { migrate } from './migrate.js';
const require = createRequire(import.meta.url);
export class Repo {
    constructor(public readonly db: Database, public readonly path: string, public readonly retries = 2) { }
    one(sql: string, ...values: Bind[]): Row | undefined { return this.db.prepare(sql).get(...values); }
    all(sql: string, ...values: Bind[]): Row[] { return this.db.prepare(sql).all(...values); }
    run(sql: string, ...values: Bind[]) { return this.db.prepare(sql).run(...values); }
    scalar(sql: string, ...values: Bind[]): bigint { const row = this.one(sql, ...values); return BigInt(row ? Object.values(row)[0] ?? 0 : 0); }
    immediate<T>(action: () => T): T {
        for (let attempt = 0;; attempt++) {
            let begun = false;
            try {
                this.db.exec('BEGIN IMMEDIATE');
                begun = true;
                const result = action();
                if (result && typeof (result as any).then === 'function')
                    throw new Error('Asynchronous transaction callbacks are forbidden.');
                this.db.exec('COMMIT');
                return result;
            }
            catch (error) {
                if (begun) {
                    try {
                        this.db.exec('ROLLBACK');
                    }
                    catch { }
                }
                const code = (error as any)?.code ?? '';
                if ((!code.includes('BUSY') && !code.includes('LOCKED')) || attempt >= this.retries)
                    throw error;
                // The transaction is CLOSED while waiting. Bounded synchronous SQLite service only.
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5 + Math.floor(Math.random() * 12));
            }
        }
    }
}
export function configure(db: Database, timeout = 500): void {
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=${Math.trunc(timeout)};`);
    const row = db.prepare("SELECT json_valid('{}') AS j").get();
    if (Number(row?.j) !== 1)
        throw new Error('SQLite JSON support is required.');
}
export function openDatabase(path: string, options: {
    timeout?: number;
    migrations?: string;
    driver?: (path: string) => Database;
} = {}): Repo {
    const dir = dirname(path);
    if (!existsSync(dir) || !lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink())
        throw new Error('Durable database directory must already exist.');
    accessSync(dir, constants.W_OK);
    if (existsSync(path) && lstatSync(path).isSymbolicLink())
        throw new Error('Refusing a symlink database.');
    if (isMainThread)
        process.umask(0o077);
    let db: Database;
    if (options.driver)
        db = options.driver(path);
    else {
        const BetterSqlite = require('better-sqlite3');
        db = new BetterSqlite(path);
        (db as any).defaultSafeIntegers(true);
    }
    try {
        configure(db, options.timeout);
        const repo = new Repo(db, path);
        migrate(repo, options.migrations);
        chmodSync(path, 0o600);
        if (repo.one('PRAGMA quick_check')?.quick_check !== 'ok' || repo.all('PRAGMA foreign_key_check').length)
            throw new Error('Database validation failed.');
        return repo;
    }
    catch (e) {
        db.close();
        throw e;
    }
}
