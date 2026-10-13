import { Core } from './core.js';
import { validateToolOutput } from '../output.js';
import { validateInput, TOOL_SCHEMAS } from '../validation.js';
import { verifyCredential } from '../auth/box-keys.js';
import type { AgentContext } from '../types.js';
import { fail, normalizeError } from '../types.js';
import { assertNoCredentials, bytes, canonical, sha256 } from '../util.js';
import { prime, profileGet, checkpointSave } from './profiles.js';
import { listRooms, roomGet, roomFollow, briefUpdate } from './rooms.js';
import { directorySearch, directoryUpdate } from './directory.js';
import { sendMessage, requestRespond, fileReport, fileReportsList } from './messages.js';
import { inboxList, inboxAck, requestsList, validateAck } from './inbox.js';
import { messagePage } from './exports.js';
const contentMutations = new Set(['message_send', 'request_respond', 'checkpoint_save', 'directory_update_self', 'room_brief_update']);
export class Nookwire extends Core {
    call(name: string, raw: unknown): any {
        const start = performance.now();
        let context: AgentContext | null = null;
        try {
            const p = validateInput(name, raw), { box_key, ...payload } = p;
            if (p.body_md !== undefined && bytes(p.body_md) > this.limits.message_body_bytes || p.payload !== undefined && bytes(p.payload) > this.limits.payload_bytes || (p.files?.length ?? 0) > this.limits.files_per_message || (p.mention_agent_ids?.length ?? 0) > this.limits.mentions || (p.reply_requested_agent_ids?.length ?? 0) > this.limits.mentions || (p.inbox_seqs?.length ?? 0) > this.limits.ack_max)
                fail('LIMIT_EXCEEDED');
            if ((name === 'message_send' || name === 'request_respond') && bytes(payload) > this.limits.message_total_bytes)
                fail('LIMIT_EXCEEDED');
            this.r.immediate(() => {
                context = verifyCredential(this.r, box_key, this.now(), name === 'agent_prime');
                this.consumeQuota(`request:key:${context.key_id}`, this.limits.requests_per_key);
                this.consumeQuota(`request:agent:${context.agent_id}`, this.limits.requests_per_agent);
            });
            return this.r.immediate(() => {
                context = verifyCredential(this.r, box_key, this.now(), name === 'agent_prime');
                const c = context;
                // Only authentication sees raw credentials. Domain handlers receive this frozen context.
                this.preflight(c, name, payload);
                let replay = false, result: any;
                if (payload.idempotency_key) {
                    const { idempotency_key, ...semantic } = payload, hash = sha256(canonical(semantic));
                    const receipt = this.r.one('SELECT payload_sha256,result_json FROM idempotency_records WHERE actor_scope=? AND operation=? AND idempotency_key=?', `agent:${c.agent_id}`, name, idempotency_key);
                    if (receipt) {
                        if (receipt.payload_sha256 !== hash)
                            fail('IDEMPOTENCY_CONFLICT');
                        result = JSON.parse(receipt.result_json);
                        this.authorizeReceipt(c, result);
                        replay = true;
                    }
                    else {
                        if (contentMutations.has(name)) {
                            const version = this.latestProfile(c.agent_id).version;
                            if (BigInt(version) !== c.profile_version_seen)
                                fail('PROFILE_OUTDATED', { current_revision: String(version) });
                        }
                        result = this.route(c, name, payload);
                        const safe = this.output(result);
                        if (bytes(safe) > 8192)
                            fail('LIMIT_EXCEEDED');
                        this.r.run('INSERT INTO idempotency_records(actor_scope,operation,idempotency_key,payload_sha256,result_json,created_at_ms) VALUES(?,?,?,?,?,?)', `agent:${c.agent_id}`, name, idempotency_key, hash, canonical(safe), this.now());
                    }
                }
                else
                    result = this.route(c, name, payload);
                this.r.run('UPDATE box_keys SET last_used_at_ms=? WHERE key_id=?', this.now(), c.key_id);
                if (c.session_id)
                    this.r.run('UPDATE agent_sessions SET last_used_at_ms=? WHERE session_id=?', this.now(), c.session_id);
                const auditContext = name === 'agent_prime' || name === 'profile_get' ? verifyCredential(this.r, box_key, this.now()) : c;
                this.audit(name, auditContext, 'success', { duration_ms: performance.now() - start, result_count: result.items?.length ?? 1, payload_bytes: bytes(payload), replayed: replay });
                if (name === 'directory_update_self')
                    result = { ...result, current_public_projection: this.publicCard(c.agent_id, false) };
                const dto = this.output({ ...result, ...(payload.idempotency_key ? { replayed: replay } : {}) });
                assertNoCredentials(dto);
                validateToolOutput(name, dto);
                return dto;
            });
        }
        catch (error) {
            const safe = normalizeError(error);
            try {
                this.r.immediate(() => this.audit(Object.hasOwn(TOOL_SCHEMAS, name) ? name : 'invalid_tool', context, 'failure', { error_code: safe.code, duration_ms: performance.now() - start }));
            }
            catch { /* No unsafe fallback logging or invented audit success. */ }
            throw safe;
        }
    }
    private preflight(c: AgentContext, name: string, p: any) {
        if (name === 'agent_prime')
            return;
        if (['room_follow', 'room_brief_update'].includes(name))
            this.member(c, p.room_id);
        if (name === 'message_send') {
            if (p.destination.kind === 'room')
                this.member(c, p.destination.room_id);
            if (p.reply_to_message_id)
                this.message(c, p.reply_to_message_id);
        }
        if (name === 'request_respond') {
            const request = this.message(c, p.request_message_id);
            if (!this.r.one('SELECT 1 FROM reply_requests WHERE message_seq=? AND recipient_agent_id=?', request.message_seq, c.agent_id))
                fail('NOT_FOUND_OR_FORBIDDEN');
        }
        if (name === 'file_access_report') {
            const { m } = this.file(c, p.file_id);
            if (m.author_agent_id === c.agent_id)
                fail('NOT_FOUND_OR_FORBIDDEN');
        }
        if (name === 'inbox_ack')
            validateAck(this, c, p);
    }
    private authorizeReceipt(c: AgentContext, receipt: any) {
        if (receipt.message_id)
            this.message(c, receipt.message_id);
        if (receipt.request_message_id)
            this.message(c, receipt.request_message_id);
        if (receipt.file_id)
            this.file(c, receipt.file_id);
        if (receipt.room_id) {
            const m = this.member(c, receipt.room_id);
            if (receipt.membership_id && String(m.membership_id) !== receipt.membership_id)
                fail('NOT_FOUND_OR_FORBIDDEN');
        }
    }
    private route(c: AgentContext, name: string, p: any): any {
        switch (name) {
            case 'agent_prime': return prime(this, c, p);
            case 'profile_get': return profileGet(this, c);
            case 'checkpoint_get': return { checkpoint: this.checkpoint(c.agent_id) };
            case 'checkpoint_save': return checkpointSave(this, c, p);
            case 'directory_search': return directorySearch(this, c, p);
            case 'directory_get': return { agent: this.publicCard(p.agent_id) };
            case 'directory_update_self': return directoryUpdate(this, c, p);
            case 'rooms_list': return listRooms(this, c, p);
            case 'room_get': return roomGet(this, c, p);
            case 'room_follow': return roomFollow(this, c, p);
            case 'room_brief_get': return this.brief(c, p.room_id);
            case 'room_brief_update': return briefUpdate(this, c, p);
            case 'message_send': return sendMessage(this, c, p);
            case 'message_get': {
                const m = this.message(c, p.message_id);
                const result = { message: this.messageDto(c, m) };
                this.recordReturned(c, [m]);
                return result;
            }
            case 'conversation_read': return messagePage(this, c, p, 'conversation');
            case 'thread_read': return messagePage(this, c, p, 'thread');
            case 'inbox_list': return inboxList(this, c, p);
            case 'inbox_ack': return inboxAck(this, c, p);
            case 'requests_list': return requestsList(this, c, p);
            case 'request_respond': return requestRespond(this, c, p);
            case 'file_access_report': return fileReport(this, c, p);
            case 'file_reports_list': return fileReportsList(this, c, p);
            case 'thread_export': return messagePage(this, c, p, 'export');
            default: fail('INVALID_ARGUMENT');
        }
    }
}
