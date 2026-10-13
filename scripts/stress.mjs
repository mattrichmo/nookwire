#!/usr/bin/env node
/** Bounded synthetic measurement, not a throughput guarantee. Temporary fixture only. */
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { statSync, existsSync } from 'node:fs';
import { fixture } from '../tests/support/fixture.mjs';
const f = fixture({ limits: { writes_per_agent: 30 } });
const histogram = monitorEventLoopDelay({ resolution: 10 });
const durations = [], pageSizes = [];
let busyErrors = 0;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
    const agents = Array.from({ length: 100 }, (_, i) => f.agent(`Synthetic ${String(i).padStart(3, '0')}`));
    for (const a of agents)
        f.prime(a);
    const room = f.room(agents);
    histogram.enable();
    await wait(25);
    const start = performance.now();
    for (let i = 0; i < 30; i++) {
        const before = performance.now();
        try {
            f.post(agents[0], room, `Synthetic bounded burst ${i}: ` + 'x'.repeat(2000));
        }
        catch (error) {
            if (error.code === 'TEMPORARILY_UNAVAILABLE')
                busyErrors++;
            else
                throw error;
        }
        durations.push(performance.now() - before);
    }
    const elapsed = performance.now() - start;
    await wait(25);
    let cursor;
    do {
        const page = f.call(agents[1], 'inbox_list', { ...(cursor ? { cursor } : {}) });
        pageSizes.push(Buffer.byteLength(JSON.stringify(page)));
        cursor = page.next_cursor;
    } while (cursor);
    histogram.disable();
    durations.sort((a, b) => a - b);
    const fileSize = path => existsSync(path) ? statSync(path).size : 0;
    const report = {
        measured_at: new Date().toISOString(),
        driver: process.env.NOOKWIRE_TEST_DRIVER === 'node' ? 'TEST-ONLY node:sqlite adapter; NOT production better-sqlite3' : 'better-sqlite3',
        node: process.versions.node, sqlite: f.r.one('SELECT sqlite_version() AS version').version,
        platform: process.platform, architecture: process.arch,
        fixture: { members: 100, sends: 30, recipients_per_message: 99, body_approx_bytes: 2030 },
        stored_messages: Number(f.r.scalar('SELECT COUNT(*) FROM messages')),
        attention_rows: Number(f.r.scalar('SELECT COUNT(*) FROM attention_items')),
        total_send_ms: elapsed, send_mean_ms: durations.reduce((a, b) => a + b, 0) / durations.length,
        send_p95_ms: durations[Math.ceil(durations.length * .95) - 1], send_max_ms: durations.at(-1),
        event_loop_delay_mean_ms: histogram.mean / 1e6, event_loop_delay_max_ms: histogram.max / 1e6,
        busy_errors: busyErrors, database_bytes: fileSize(f.path), wal_bytes: fileSize(f.path + '-wal'),
        page_bytes: pageSizes,
        qualification: 'Single synthetic local burst. No external host/network load or production SLA is inferred. Re-measure on the selected native production host.'
    };
    console.log(JSON.stringify(report, null, 2));
}
finally {
    histogram.disable();
    f.close();
}
