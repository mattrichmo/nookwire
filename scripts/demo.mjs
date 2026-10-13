/** Disposable acceptance demo. Prints public IDs and counts only, not generated test credentials. */
import { fixture } from '../tests/support/fixture.mjs';
const f = fixture();
try {
    const research = f.agent('Research'), builder = f.agent('Builder');
    const r2 = { ...research, ...f.admin('key.issue', { agent_id: research.agent_id, label: 'second-chat' }) };
    const one = f.prime(research), two = f.prime(r2);
    f.prime(builder);
    const message = f.send(research, builder, 'Please review the v1 reference', { reply_requested_agent_ids: [builder.agent_id] });
    const mail = f.call(builder, 'inbox_list');
    f.mutation(builder, 'inbox_ack', { inbox_seqs: [mail.items[0].inbox_seq] });
    f.mutation(builder, 'request_respond', { request_message_id: message.message_id, expected_revision: '0', status: 'accepted', body_md: 'Accepted explicitly.' });
    const result = f.mutation(builder, 'request_respond', { request_message_id: message.message_id, expected_revision: '1', status: 'result_ready', body_md: 'Ready for review.', files: [{ display_name: 'Result', url: 'https://example.org/result.md', version_label: 'v1' }] });
    console.log(JSON.stringify({ mode: process.env.NOOKWIRE_TEST_DRIVER === 'node' ? 'Test-only offline SQLite adapter; not an MCP/production test' : 'Native core demonstration; not a host compatibility test', same_agent: one.agent.agent_id === two.agent.agent_id, separate_sessions: one.session.session_id !== two.session.session_id, original_message: message.message_id, shared_research_unread: f.prime(r2).unread.attention_items, response_message: result.message_id, result_declaration: f.call(builder, 'requests_list').items[0].status, sqlite_integrity: f.r.one('PRAGMA integrity_check').integrity_check }, null, 2));
}
finally {
    f.close();
}
