/** Strict outbound contracts. No repository row is allowed to drift into a tool result.
 * These checks run before the service transaction commits, including retrieval receipts.
 */
import { fail } from './types.js';
import { DEFAULT_LIMITS } from './config.js';
import { sequence, uuidPattern, validateJson, safeUrl } from './util.js';
import { validateProfile } from './validation.js';
type Check = (value: any) => boolean;
const text: Check = v => typeof v === 'string';
const bool: Check = v => typeof v === 'boolean';
const integer: Check = v => Number.isSafeInteger(v) && v >= 0;
const seq: Check = v => { try {
    sequence(v);
    return true;
}
catch {
    return false;
} };
const uuid: Check = v => typeof v === 'string' && uuidPattern.test(v);
const timestamp: Check = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
const literal = (...values: any[]): Check => v => values.includes(v);
const nullable = (check: Check): Check => v => v === null || check(v);
const array = (check: Check, max: number): Check => v => Array.isArray(v) && v.length <= max && v.every(check);
function object(required: Record<string, Check>, optional: Record<string, Check> = {}): Check {
    return value => !!value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).every(k => Object.hasOwn(required, k) || Object.hasOwn(optional, k))
        && Object.entries(required).every(([k, check]) => Object.hasOwn(value, k) && check(value[k]))
        && Object.entries(optional).every(([k, check]) => !Object.hasOwn(value, k) || check(value[k]));
}
const json = (max: number): Check => value => {
    try {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return false;
        validateJson(value, max);
        return true;
    }
    catch {
        return false;
    }
};
const mode = literal('all', 'mentions', 'replies', 'mute');
const status = literal('pending', 'accepted', 'needs_context', 'declined', 'result_ready');
const declaration = literal('accepted', 'needs_context', 'declined', 'result_ready');
const identity = object({ agent_id: uuid, name: text });
const report = object({ agent_id: uuid, revision: seq, access_status: literal('accessible', 'inaccessible'), reported_by_session_id: uuid, reported_at_ms: integer, self_reported: literal(true) }, { file_id: uuid });
const profile: Check = value => {
    const shape = object({ version: seq, authored_by: literal('owner'), owner_instructions_md: text, soul_md: text, expected_tools: array(v => !!v, 40), deliverables: array(v => !!v, 20), schedule_definitions: array(v => !!v, 20), change_note: text, created_at_ms: integer });
    if (!shape(value))
        return false;
    try {
        const { version, authored_by, created_at_ms, ...body } = value;
        validateProfile(body);
        return true;
    }
    catch {
        return false;
    }
};
const checkpoint = object({ revision: seq, profile_version: nullable(seq), summary_md: text, state: json(16384) }, { updated_by_session_id: uuid, updated_at_ms: integer });
const roomRef = object({ room_id: uuid, slug: text, name: text, archived: bool, membership_id: seq, joined_after_seq: seq, follow_mode: mode, preference_revision: seq, brief_revision: seq });
const card = object({ agent_id: uuid, name: text, listed: bool, public_role: text, public_summary: text, capabilities: array(text, 32), self_declared: literal(true), revision: seq, last_check_in_at_ms: nullable(integer) });
const file = object({ file_id: uuid, display_name: text, url: v => { try {
        safeUrl(v);
        return true;
    }
    catch {
        return false;
    } }, media_type: nullable(text), version_label: nullable(text), content_sha256: nullable(text), commit_hash: nullable(text), versioned: bool, access_reports_has_more: bool, access_reports_next_cursor: nullable(text), access_reports: array(report, 3) });
const requestReference = object({ recipient_agent_id: uuid, status, revision: seq, latest_response_message_id: nullable(uuid), self_declared: literal(true) });
const message = object({ message_id: uuid, message_seq: seq, channel_kind: literal('dm', 'room'), room_id: nullable(uuid), dm_recipient_agent_id: nullable(uuid), author: object({ agent_id: uuid, name: text, session_id: uuid, profile_version: seq }), body_md: text, payload: nullable(json(8192)), created_at_ms: integer, created_at: timestamp, reply_to_message_id: nullable(uuid), thread_root_message_id: nullable(uuid), parent_context_available: bool, response_to_request_message_id: nullable(uuid), response_status: nullable(declaration), mention_agent_ids: array(uuid, 20), response_requests: array(requestReference, 20), files: array(file, 10), content_trust: text });
const pageFields = { has_more: bool, next_cursor: nullable(text), resume_cursor: nullable(text), upper: seq };
const browseFields = { has_more: bool, next_cursor: nullable(text) };
const receiptFields = { message_id: uuid, message_seq: seq, stored_at: timestamp, attention_recipient_count: integer, response_request_count: integer };
const replay = { replayed: bool };
const brief = object({ room_id: uuid, revision: seq, brief_md: text }, { author_kind: literal('owner', 'agent'), author_agent_id: nullable(uuid), author_session_id: nullable(uuid), created_at_ms: integer, content_trust: text });
const inboxItem = object({ inbox_seq: seq, reason_bits: v => integer(v) && v >= 1 && v <= 31, reasons: array(literal('direct', 'room_follow', 'mention', 'reply', 'reply_requested'), 5), acked_at_ms: nullable(integer), acked_by_session_id: nullable(uuid), message });
const requestItem = object({ request_message_id: uuid, message_seq: seq, recipient_agent_id: uuid, status, revision: seq, updated_at_ms: integer, latest_response_message_id: nullable(uuid), self_declared: literal(true), request: message });
export const OUTPUT_CHECKS: Record<string, Check> = {
    agent_prime: object({ agent: identity, session: object({ session_id: uuid, key_id: uuid }), profile, checkpoint, checkpoint_profile_mismatch: bool, rooms: array(roomRef, 50), rooms_next_cursor: nullable(text), unread: object({ attention_items: integer, dm_items: integer, room_items: integer }), response_requests: object({ pending: integer, accepted: integer, needs_context: integer }), server_time: timestamp, capabilities: object({ auto_wake: literal(false), runs_schedules: literal(false), hosts_files: literal(false) }), limits: object(Object.fromEntries(Object.keys(DEFAULT_LIMITS).map(k => [k, integer]))), trust_notice: text }),
    profile_get: object({ profile }), checkpoint_get: object({ checkpoint }),
    checkpoint_save: object({ agent_id: uuid, revision: seq, profile_version: seq, stored_at: timestamp }, replay),
    directory_search: object({ items: array(card, 50), ...browseFields, browsing_only: literal(true) }),
    directory_get: object({ agent: card }),
    directory_update_self: object({ agent_id: uuid, revision: seq, listed: bool, current_public_projection: card }, replay),
    rooms_list: object({ items: array(roomRef, 50), ...browseFields }),
    room_get: object({ room_id: uuid, slug: text, name: text, description: text, archived: bool, membership: object({ membership_id: seq, joined_after_seq: seq, follow_mode: mode, preference_revision: seq }), members: array(identity, 100) }),
    room_follow: object({ room_id: uuid, membership_id: seq, mode, preference_revision: seq }, replay),
    room_brief_get: brief,
    room_brief_update: object({ room_id: uuid, revision: seq, author_agent_id: uuid, author_session_id: uuid, stored_at: timestamp }, replay),
    message_send: object(receiptFields, replay),
    message_get: object({ message }),
    conversation_read: object({ items: array(message, 50), ...pageFields, server_time: timestamp }),
    thread_read: object({ items: array(message, 50), ...pageFields, server_time: timestamp }),
    inbox_list: object({ items: array(inboxItem, 50), ...pageFields, server_time: timestamp }),
    inbox_ack: object({ acked_count: integer, already_acked_count: integer, acked_inbox_seqs: array(seq, 100), already_acked_inbox_seqs: array(seq, 100) }, replay),
    requests_list: object({ items: array(requestItem, 50), ...pageFields, current_state_browser: literal(true), server_time: timestamp }),
    request_respond: object({ ...receiptFields, request_message_id: uuid, status: declaration, revision: seq, self_declared: literal(true) }, replay),
    file_access_report: object({ file_id: uuid, agent_id: uuid, revision: seq, access_status: literal('accessible', 'inaccessible'), reported_by_session_id: uuid, reported_at_ms: integer, self_reported: literal(true) }, replay),
    file_reports_list: object({ items: array(report, 50), ...browseFields, current_state_browser: literal(true) }),
    thread_export: value => object({ export_schema_version: literal('1'), exported_at: timestamp, format: literal('json', 'markdown'), partial: bool, ...pageFields, server_time: timestamp }, value?.format === 'json' ? { items: array(message, 50) } : { content: text })(value) && (value.format === 'json' ? Array.isArray(value.items) : typeof value.content === 'string')
};
export function validateToolOutput(name: string, value: unknown): void {
    if (!OUTPUT_CHECKS[name]?.(value))
        fail('STORAGE_FAILURE');
}
