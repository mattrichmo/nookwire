/** Test-only adapter, NEVER imported by production. Makes offline core verification explicit. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export function nodeTestDriver(path) {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path);
    return {
        exec: sql => db.exec(sql), close: () => db.close(),
        async backup(destination) { const { rmSync } = require('node:fs'); rmSync(destination, { force: true }); db.prepare('VACUUM INTO ?').run(destination); },
        prepare(sql) { const s = db.prepare(sql); s.setReadBigInts(true); return { get: (...p) => s.get(...p), all: (...p) => s.all(...p), run: (...p) => s.run(...p) }; }
    };
}
export const driver = process.env.NOOKWIRE_TEST_DRIVER === 'node' ? nodeTestDriver : undefined;
