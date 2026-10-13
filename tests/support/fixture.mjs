import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../../dist/db/open.js';
import { Nookwire } from '../../dist/services/runtime.js';
import { OwnerService } from '../../dist/services/owner.js';
import { localOwnerContext } from '../../dist/auth/context.js';
import { driver } from './driver.mjs';
export const mid = () => randomUUID();
export function fixture(options = {}) {
    const directory = mkdtempSync(join(tmpdir(), 'nookwire-test-')), path = join(directory, 'test.sqlite');
    let now = 1791856800000;
    const clock = { now: () => now };
    let repo = openDatabase(path, { driver }), app = new Nookwire(repo, clock, { requests_per_key: 10000, requests_per_agent: 10000, writes_per_agent: 10000, ...options.limits }), owner = new OwnerService(app, localOwnerContext());
    const f = { directory, path, clock, get r() { return repo; }, get app() { return app; }, get owner() { return owner; },
        tick(ms = 1) { now += ms; }, setTime(ms) { now = ms; },
        admin(operation, p = {}) { return owner.call(operation, { ...p, ...(operation.endsWith('.list') || ['agent.show', 'profile.show', 'profile.history', 'room.members', 'room.brief.history', 'audit.events', 'audit.stats'].includes(operation) ? {} : { idempotency_key: p.idempotency_key ?? mid() }) }); },
        agent(name = 'Agent', profile = {}) { const a = f.admin('agent.create', { name, profile }); const k = f.admin('key.issue', { agent_id: a.agent_id }); return { ...a, ...k }; },
        prime(a, p = {}) { return app.call('agent_prime', { box_key: a.box_key, ...p }); },
        call(a, name, p = {}) { return app.call(name, { box_key: a.box_key, ...p }); },
        mutation(a, name, p = {}) { return f.call(a, name, { idempotency_key: mid(), ...p }); },
        send(a, b, body = 'Hello', p = {}) { return f.mutation(a, 'message_send', { destination: { kind: 'dm', recipient_agent_id: b.agent_id }, body_md: body, ...p }); },
        room(agents, modes = []) { const room = f.admin('room.create', { slug: 'room-' + mid(), name: 'Room' }); agents.forEach((a, i) => f.admin('room.add', { room_id: room.room_id, agent_id: a.agent_id, mode: modes[i] ?? 'all' })); return room; },
        post(a, room, body = 'Room post', p = {}) { return f.mutation(a, 'message_send', { destination: { kind: 'room', room_id: room.room_id }, body_md: body, ...p }); },
        restart() { repo.db.close(); repo = openDatabase(path, { driver }); app = new Nookwire(repo, clock, { requests_per_key: 10000, requests_per_agent: 10000, writes_per_agent: 10000, ...options.limits }); owner = new OwnerService(app, localOwnerContext()); },
        close() { try {
            repo.db.close();
        }
        finally {
            rmSync(directory, { recursive: true, force: true });
        } }
    };
    return f;
}
export function expectCode(assert, fn, code) { assert.throws(fn, e => e.code === code, `Expected ${code}`); }
