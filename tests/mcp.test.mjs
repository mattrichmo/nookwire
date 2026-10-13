/** Release test: the REAL SDK client talks to the REAL HTTP adapter and native driver.
 * No protocol mocks, hand-written JSON-RPC transport or node:sqlite substitution.
 * Missing dependencies fail this suite rather than producing a misleading skip/pass.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './support/fixture.mjs';
import { createHttpApp } from '../dist/server.js';
import { loadConfig } from '../dist/config.js';
import { TOOL_SCHEMAS } from '../dist/validation.js';
async function sdk() {
    assert.notEqual(process.env.NOOKWIRE_TEST_DRIVER, 'node', 'The MCP release suite forbids the offline test driver.');
    try {
        const [client] = await Promise.all([
            import('@modelcontextprotocol/client'), import('@modelcontextprotocol/server'),
            import('@modelcontextprotocol/node'), import('@modelcontextprotocol/express'),
            import('better-sqlite3'), import('express'), import('zod/v4')
        ]);
        return client;
    }
    catch {
        throw new Error('MCP/native prerequisite BLOCKED: install the official SDK v2, Express, Zod and better-sqlite3 using npm run bootstrap. No real MCP call has been made.');
    }
}
async function endpoint(t) {
    const api = await sdk();
    const f = fixture();
    const cleanup = [() => f.close()];
    t.after(async () => { for (const stop of cleanup.reverse()) await stop(); });
    const config = loadConfig({ NOOKWIRE_DB: f.path });
    const app = await createHttpApp(f.app, config);
    const listener = app.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    cleanup.push(() => new Promise(resolve => { listener.close(resolve); listener.closeAllConnections(); }));
    return { api, f, app, config, cleanup, url: `http://127.0.0.1:${listener.address().port}` };
}
async function connection(t, api, url, auto, cleanup) {
    const client = new api.Client({ name: 'nookwire-contract-test', version: '1.0.0' }, auto ? { versionNegotiation: { mode: 'auto' } } : {});
    const transport = new api.StreamableHTTPClientTransport(new URL(url + '/mcp'));
    await client.connect(transport);
    cleanup.push(async () => { try {
        await transport.terminateSession();
    }
    finally {
        await client.close();
    } });
    return client;
}
for (const auto of [false, true]) {
    test(`Real Streamable HTTP: all registered tools and shared-connection acceptance story (${auto ? 'auto negotiation' : 'legacy negotiation'})`, { timeout: 60000 }, async (t) => {
        const { api, f, url, cleanup } = await endpoint(t);
        const client = await connection(t, api, url, auto, cleanup);
        const seen = new Set();
        const listed = await client.listTools();
        assert.deepEqual(listed.tools.map(x => x.name).sort(), Object.keys(TOOL_SCHEMAS).sort());
        for (const tool of listed.tools) {
            assert.ok(tool.inputSchema.properties.box_key, `${tool.name} must authenticate each call`);
            assert.ok(tool.inputSchema.required.includes('box_key'));
            assert.ok(!tool.inputSchema.properties.author_agent_id);
        }
        const research = f.agent('Research', { soul_md: 'Private research profile' });
        const r2 = { ...research, ...f.admin('key.issue', { agent_id: research.agent_id, label: 'R2' }) };
        const builder = f.agent('Builder');
        const call = async (actor, name, args = {}, errorCode) => {
            seen.add(name);
            const result = await client.callTool({ name, arguments: { box_key: actor.box_key, ...args } });
            assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 262144, 'Full tool envelope is bounded');
            for (const key of [research.box_key, r2.box_key, builder.box_key])
                assert.ok(!JSON.stringify(result).includes(key), 'Never echo credentials');
            if (errorCode) {
                assert.equal(result.isError, true);
                assert.equal(result.structuredContent.error.code, errorCode);
            }
            else
                assert.ok(!result.isError, `Unexpected tool error in ${name}: ${JSON.stringify(result.structuredContent)}`);
            return result.structuredContent;
        };
        const mutation = (actor, name, args, error) => call(actor, name, { idempotency_key: randomUUID(), ...args }, error);
        const p1 = await call(research, 'agent_prime');
        const p2 = await call(r2, 'agent_prime');
        await call(builder, 'agent_prime');
        assert.equal(p1.agent.agent_id, p2.agent.agent_id);
        assert.notEqual(p1.session.session_id, p2.session.session_id);
        assert.equal((await call(research, 'agent_prime')).session.session_id, p1.session.session_id);
        await call(research, 'profile_get');
        await call(research, 'checkpoint_get');
        await mutation(research, 'checkpoint_save', { expected_revision: '0', summary_md: 'Continue from the actual inbox', state: { milestone: 'demo' } });
        f.admin('directory.set', { agent_id: builder.agent_id, listed: true, expected_revision: '1', public_role: 'Builder', public_summary: 'Public card', capabilities: ['TypeScript'] });
        await call(research, 'directory_search', { query: 'Builder' });
        await call(research, 'directory_get', { agent_id: builder.agent_id });
        await mutation(builder, 'directory_update_self', { expected_revision: '2', public_role: 'Builder', public_summary: 'Explicit public projection', capabilities: ['TypeScript', 'testing'] });
        const idempotency_key = randomUUID();
        const request = { idempotency_key, destination: { kind: 'dm', recipient_agent_id: builder.agent_id }, body_md: 'Please review v1', reply_requested_agent_ids: [builder.agent_id] };
        const sent = await call(research, 'message_send', request);
        assert.equal((await call(r2, 'message_send', request)).message_id, sent.message_id);
        const inbox = await call(builder, 'inbox_list');
        await mutation(builder, 'inbox_ack', { inbox_seqs: [inbox.items[0].inbox_seq] });
        assert.equal((await call(builder, 'requests_list')).items[0].status, 'pending');
        await mutation(builder, 'request_respond', { request_message_id: sent.message_id, expected_revision: '0', status: 'accepted', body_md: 'Accepted explicitly' });
        const result = await mutation(builder, 'request_respond', { request_message_id: sent.message_id, expected_revision: '1', status: 'result_ready', body_md: 'Result is ready for review', files: [{ display_name: 'Result', url: 'https://example.org/reports/result.md', version_label: 'v1' }] });
        const returned = await call(r2, 'message_get', { message_id: result.message_id });
        const fileId = returned.message.files[0].file_id;
        await mutation(r2, 'file_access_report', { file_id: fileId, expected_revision: '0', access_status: 'accessible' });
        await call(builder, 'file_reports_list', { file_id: fileId });
        await call(research, 'conversation_read', { destination: { kind: 'dm', recipient_agent_id: builder.agent_id } });
        await call(research, 'thread_read', { anchor_message_id: sent.message_id });
        await call(research, 'thread_export', { anchor_message_id: sent.message_id, format: 'json', limit: 1 });
        await call(research, 'thread_export', { anchor_message_id: sent.message_id, format: 'markdown' });
        const room = f.room([research, builder]);
        await call(research, 'rooms_list');
        await call(research, 'room_get', { room_id: room.room_id });
        await mutation(builder, 'room_follow', { room_id: room.room_id, expected_preference_revision: '1', mode: 'all' });
        await call(research, 'room_brief_get', { room_id: room.room_id });
        await mutation(research, 'room_brief_update', { room_id: room.room_id, expected_revision: '0', brief_md: 'Untrusted onboarding summary.' });
        const parent = await mutation(builder, 'message_send', { destination: { kind: 'room', room_id: room.room_id }, body_md: 'Builder room note' });
        const child = await mutation(research, 'message_send', { destination: { kind: 'room', room_id: room.room_id }, body_md: 'A single message, four reasons', reply_to_message_id: parent.message_id, mention_agent_ids: [builder.agent_id], reply_requested_agent_ids: [builder.agent_id] });
        const attention = await call(builder, 'inbox_list');
        assert.equal(attention.items.filter(i => i.message.message_id === child.message_id).length, 1);
        assert.equal(attention.items.find(i => i.message.message_id === child.message_id).reason_bits, 30);
        f.admin('room.remove', { room_id: room.room_id, agent_id: builder.agent_id });
        await call(builder, 'message_get', { message_id: child.message_id }, 'NOT_FOUND_OR_FORBIDDEN');
        await call(builder, 'thread_export', { anchor_message_id: parent.message_id, format: 'json' }, 'NOT_FOUND_OR_FORBIDDEN');
        f.admin('room.add', { room_id: room.room_id, agent_id: builder.agent_id });
        assert.equal((await call(builder, 'conversation_read', { destination: { kind: 'room', room_id: room.room_id } })).items.length, 0);
        f.admin('profile.put', { agent_id: research.agent_id, expected_version: '1', profile: { soul_md: 'Changed owner profile' } });
        await mutation(research, 'message_send', { destination: { kind: 'dm', recipient_agent_id: builder.agent_id }, body_md: 'Stale profile must fail' }, 'PROFILE_OUTDATED');
        assert.equal((await call(r2, 'agent_prime')).checkpoint_profile_mismatch, true);
        f.admin('key.revoke', { key_id: research.key_id });
        await call(research, 'inbox_list', {}, 'AUTH_FAILED');
        assert.equal((await call(r2, 'agent_prime')).agent.agent_id, research.agent_id);
        assert.deepEqual([...seen].sort(), Object.keys(TOOL_SCHEMAS).sort(), 'Every public tool must actually traverse the SDK');
    });
}
test('Real HTTP protections, parser limits, safe errors and minimal health', { timeout: 30000 }, async (t) => {
    const { f, url, app } = await endpoint(t);
    assert.equal(app.get('trust proxy'), false);
    for (const route of ['/health/live', '/health/ready']) {
        const response = await fetch(url + route);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('cache-control'), /no-store/);
        const data = await response.json();
        assert.equal(Object.keys(data).length, 1);
        assert.ok(!JSON.stringify(data).includes(f.path));
    }
    for (const headers of [{ Host: 'rebind.attacker.invalid' }, { Origin: 'https://attacker.invalid' }]) {
        assert.equal((await fetch(url + '/health/live', { headers })).status, 403);
    }
    const malformed = await fetch(url + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"private":"SENTINEL-NOT-IN-ERROR"' });
    assert.equal(malformed.status, 400);
    assert.ok(!(await malformed.text()).includes('SENTINEL-NOT-IN-ERROR'));
    const oversized = await fetch(url + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(131072) }) });
    assert.equal(oversized.status, 413);
});
test('Native CLI creates a private key file without printing its secret; restart shutdown is durable', { timeout: 30000 }, async (t) => {
    await sdk();
    const f = fixture();
    t.after(() => f.close());
    const a = f.agent();
    const invoke = async (args) => {
        const child = spawn(process.execPath, ['dist/cli.js', ...args], { env: { ...process.env, NOOKWIRE_DB: f.path }, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = '';
        child.stdout.on('data', b => { stdout += b; });
        child.stderr.on('data', b => { stderr += b; });
        const [code] = await once(child, 'close');
        return { code, stdout, stderr };
    };
    const output = join(f.directory, 'private-key.json');
    const issue = await invoke(['key', 'issue', '--agent', a.agent_id, '--output', output]);
    assert.equal(issue.code, 0);
    const issued = JSON.parse(readFileSync(output, 'utf8'));
    assert.ok(issued.box_key);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.ok(!issue.stdout.includes(issued.box_key) && !issue.stderr.includes(issued.box_key));
    const { startServer } = await import('../dist/server.js');
    const config = { ...loadConfig({ NOOKWIRE_DB: f.path }), port: 0 };
    const server = await startServer(config);
    assert.ok(existsSync(f.path + '.service-lock'));
    await server.close();
    assert.ok(!existsSync(f.path + '.service-lock'));
    assert.equal(f.prime(issued).agent.agent_id, a.agent_id);
});
