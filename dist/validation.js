import { fail } from './types.js';
import { assertNoCredentials, bytes, sequence, safeUrl, uuidPattern, validateJson, canonical } from './util.js';
const str = (maxLength, minLength = 0) => ({ type: 'string', maxLength, minLength });
const text = (maxBytes, minLength = 0) => ({ type: 'string', maxBytes, minLength });
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const arr = (items, maxItems, defaults = false, uniqueItems = false) => ({ type: 'array', items, maxItems, uniqueItems, ...(defaults ? { default: [] } : {}) });
const enumeration = (...values) => ({ type: 'string', enum: values });
const uuid = { type: 'string', format: 'uuid' };
const revision = { type: 'string', format: 'sequence', description: 'Nonnegative 64-bit decimal string. Never use a floating-point number.' };
const mutation = { type: 'string', minLength: 1, maxLength: 80, pattern: '^[A-Za-z0-9._:-]+$' };
const credential = { type: 'string', maxLength: 100, description: 'Private per-chat Box Key. Never forward this key to another tool or message.' };
const paging = { cursor: { ...str(4096), description: 'Opaque cursor. Omit for a fresh scan.' }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 } };
const modes = enumeration('all', 'mentions', 'replies', 'mute');
const declarations = enumeration('accepted', 'needs_context', 'declined', 'result_ready');
const statuses = enumeration('pending', 'accepted', 'needs_context', 'declined', 'result_ready');
const file = obj({ display_name: str(200, 1), url: { ...str(2048, 9), format: 'https-reference' }, media_type: str(120), version_label: str(120, 1), content_sha256: { ...str(64, 64), pattern: '^[0-9a-fA-F]{64}$' }, commit_hash: { ...str(64, 7), pattern: '^[0-9a-fA-F]{7,64}$' } }, ['display_name', 'url']);
const files = arr(file, 10, true);
export const PROFILE_SCHEMA = obj({
    owner_instructions_md: { ...text(32768), default: '' }, soul_md: { ...text(32768), default: '' },
    expected_tools: arr(obj({ name: str(120, 1), required: { type: 'boolean' }, purpose: str(500), host_requirement: str(300) }, ['name', 'required', 'purpose']), 40, true),
    deliverables: arr(obj({ name: str(120, 1), format: str(80), acceptance_criteria: arr(str(300), 10) }, ['name', 'acceptance_criteria']), 20, true),
    schedule_definitions: arr(obj({ name: str(120, 1), timezone: { ...str(100, 1), format: 'timezone' }, expression: str(300, 1), intended_action: str(500), execution: enumeration('external') }), 20, true),
    change_note: { ...str(512), default: '' }
}, []);
const publicFields = { public_role: { ...str(256), default: '' }, public_summary: { ...str(2048), default: '' }, capabilities: arr(str(80, 1), 32, true, true) };
const destination = { oneOf: [obj({ kind: enumeration('dm'), recipient_agent_id: uuid }), obj({ kind: enumeration('room'), room_id: uuid })] };
function tool(properties, required = []) { return obj({ box_key: credential, ...properties }, ['box_key', ...required]); }
export const TOOL_SCHEMAS = {
    agent_prime: tool({ client_label: { ...str(80), default: '' }, client_host: { ...str(80), default: '' } }),
    profile_get: tool({}), checkpoint_get: tool({}),
    checkpoint_save: tool({ expected_revision: revision, summary_md: text(16384), state: { type: 'object', additionalProperties: true, jsonLimit: 16384 }, idempotency_key: mutation }, ['expected_revision', 'summary_md', 'state', 'idempotency_key']),
    directory_search: tool({ query: { ...str(120), default: '' }, ...paging }),
    directory_get: tool({ agent_id: uuid }, ['agent_id']),
    directory_update_self: tool({ expected_revision: revision, ...publicFields, idempotency_key: mutation }, ['expected_revision', 'public_role', 'public_summary', 'capabilities', 'idempotency_key']),
    rooms_list: tool(paging), room_get: tool({ room_id: uuid }, ['room_id']),
    room_follow: tool({ room_id: uuid, expected_preference_revision: revision, mode: modes, idempotency_key: mutation }, ['room_id', 'expected_preference_revision', 'mode', 'idempotency_key']),
    room_brief_get: tool({ room_id: uuid }, ['room_id']),
    room_brief_update: tool({ room_id: uuid, expected_revision: revision, brief_md: text(16384), idempotency_key: mutation }, ['room_id', 'expected_revision', 'brief_md', 'idempotency_key']),
    message_send: tool({ destination, body_md: text(16384, 1), payload: { type: 'object', additionalProperties: true, jsonLimit: 8192 }, reply_to_message_id: uuid, mention_agent_ids: arr(uuid, 20, true, true), reply_requested_agent_ids: arr(uuid, 20, true, true), files, idempotency_key: mutation }, ['destination', 'body_md', 'idempotency_key']),
    message_get: tool({ message_id: uuid }, ['message_id']),
    conversation_read: tool({ destination, ...paging }, ['destination']),
    thread_read: tool({ anchor_message_id: uuid, ...paging }, ['anchor_message_id']),
    inbox_list: tool({ unread_only: { type: 'boolean', default: true }, ...paging }),
    inbox_ack: tool({ inbox_seqs: { ...arr(revision, 100, false, true), minItems: 1 }, idempotency_key: mutation }, ['inbox_seqs', 'idempotency_key']),
    requests_list: tool({ direction: { ...enumeration('incoming', 'outgoing'), default: 'incoming' }, status: statuses, ...paging }),
    request_respond: tool({ request_message_id: uuid, expected_revision: revision, status: declarations, body_md: text(16384, 1), files, idempotency_key: mutation }, ['request_message_id', 'expected_revision', 'status', 'body_md', 'idempotency_key']),
    file_access_report: tool({ file_id: uuid, expected_revision: revision, access_status: enumeration('accessible', 'inaccessible'), idempotency_key: mutation }, ['file_id', 'expected_revision', 'access_status', 'idempotency_key']),
    file_reports_list: tool({ file_id: uuid, ...paging }, ['file_id']),
    thread_export: tool({ anchor_message_id: uuid, format: enumeration('json', 'markdown'), ...paging }, ['anchor_message_id', 'format'])
};
const owner = (props, required, write = true) => obj({ ...props, ...(write ? { idempotency_key: mutation } : {}) }, [...required, ...(write ? ['idempotency_key'] : [])]);
export const OWNER_SCHEMAS = {
    'agent.create': owner({ name: str(80, 1), profile: { ...PROFILE_SCHEMA, default: {} } }, ['name']),
    'agent.list': owner({ limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 }, after_agent_id: uuid }, [], false),
    'agent.show': owner({ agent_id: uuid }, ['agent_id'], false),
    'agent.rename': owner({ agent_id: uuid, name: str(80, 1) }, ['agent_id', 'name']),
    'agent.status': owner({ agent_id: uuid, status: enumeration('active', 'disabled') }, ['agent_id', 'status']),
    'key.issue': owner({ agent_id: uuid, label: { ...str(80), default: '' }, expires_at_ms: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER } }, ['agent_id']),
    'key.replace': owner({ key_id: uuid, label: { ...str(80), default: '' }, expires_at_ms: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER } }, ['key_id']),
    'key.list': owner({ agent_id: uuid }, ['agent_id'], false),
    'key.revoke': owner({ key_id: uuid }, ['key_id']),
    'key.revoke-all': owner({ agent_id: uuid }, ['agent_id']),
    'session.list': owner({ agent_id: uuid }, ['agent_id'], false),
    'profile.show': owner({ agent_id: uuid, version: revision }, ['agent_id'], false),
    'profile.history': owner({ agent_id: uuid, after_version: { ...revision, default: '0' }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 } }, ['agent_id'], false),
    'profile.put': owner({ agent_id: uuid, expected_version: revision, profile: PROFILE_SCHEMA }, ['agent_id', 'expected_version', 'profile']),
    'directory.set': owner({ agent_id: uuid, listed: { type: 'boolean' }, expected_revision: revision, ...publicFields }, ['agent_id', 'listed', 'expected_revision', 'public_role', 'public_summary', 'capabilities']),
    'room.create': owner({ slug: { ...str(80, 1), pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }, name: str(80, 1), description: { ...str(2048), default: '' } }, ['slug', 'name']),
    'room.list': owner({ after_room_id: uuid, limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }, [], false),
    'room.edit': owner({ room_id: uuid, name: str(80, 1), description: str(2048), archived: { type: 'boolean' } }, ['room_id']),
    'room.add': owner({ room_id: uuid, agent_id: uuid, mode: { ...modes, default: 'mentions' } }, ['room_id', 'agent_id']),
    'room.remove': owner({ room_id: uuid, agent_id: uuid }, ['room_id', 'agent_id']),
    'room.members': owner({ room_id: uuid, history: { type: 'boolean', default: false }, after_membership_id: { ...revision, default: '0' }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 100 } }, ['room_id'], false),
    'room.brief.put': owner({ room_id: uuid, expected_revision: revision, brief_md: text(16384) }, ['room_id', 'expected_revision', 'brief_md']),
    'room.brief.history': owner({ room_id: uuid, after_revision: { ...revision, default: '0' }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 } }, ['room_id'], false),
    'audit.events': owner({ since_ms: { type: 'integer', minimum: 0, default: 0 }, until_ms: { type: 'integer', minimum: 0, default: Number.MAX_SAFE_INTEGER }, operation: str(80), agent_id: uuid, after_audit_seq: { ...revision, default: '0' }, limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 } }, [], false),
    'audit.stats': owner({ since_ms: { type: 'integer', minimum: 0, default: 0 }, until_ms: { type: 'integer', minimum: 0, default: Number.MAX_SAFE_INTEGER } }, [], false),
    'db.maintenance': owner({ audit_before_ms: { type: 'integer', minimum: 0 }, receipts_before_ms: { type: 'integer', minimum: 0 }, rates_before_ms: { type: 'integer', minimum: 0 } }, [])
};
function validate(schema, value) {
    if (value === undefined) {
        if ('default' in schema)
            return validate({ ...schema, default: undefined }, structuredClone(schema.default));
        return undefined;
    }
    if (schema.oneOf) {
        const matches = [];
        for (const variant of schema.oneOf) {
            try {
                matches.push(validate(variant, value));
            }
            catch { }
        }
        if (matches.length !== 1)
            fail('INVALID_ARGUMENT');
        return matches[0];
    }
    if (schema.enum && !schema.enum.includes(value))
        fail('INVALID_ARGUMENT');
    if (schema.type === 'string') {
        if (typeof value !== 'string')
            fail('INVALID_ARGUMENT');
        if (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity))
            fail('INVALID_ARGUMENT');
        if (schema.maxBytes && bytes(value) > schema.maxBytes)
            fail('LIMIT_EXCEEDED');
        if (schema.pattern && !new RegExp(schema.pattern).test(value))
            fail('INVALID_ARGUMENT');
        if (schema.format === 'uuid') {
            if (!uuidPattern.test(value))
                fail('INVALID_ARGUMENT');
            value = value.toLowerCase();
        }
        if (schema.format === 'sequence')
            sequence(value);
        if (schema.format === 'https-reference')
            safeUrl(value);
        if (schema.format === 'timezone') {
            try {
                new Intl.DateTimeFormat('en', { timeZone: value });
            }
            catch {
                fail('INVALID_ARGUMENT');
            }
        }
        return value;
    }
    if (schema.type === 'integer') {
        if (!Number.isSafeInteger(value) || value < (schema.minimum ?? 0) || value > (schema.maximum ?? Number.MAX_SAFE_INTEGER))
            fail('INVALID_ARGUMENT');
        return value;
    }
    if (schema.type === 'boolean') {
        if (typeof value !== 'boolean')
            fail('INVALID_ARGUMENT');
        return value;
    }
    if (schema.type === 'array') {
        if (!Array.isArray(value) || value.length > (schema.maxItems ?? Infinity) || value.length < (schema.minItems ?? 0))
            fail('INVALID_ARGUMENT');
        const result = value.map(x => validate(schema.items, x));
        if (schema.uniqueItems) {
            if (new Set(result.map(canonical)).size !== result.length)
                fail('INVALID_ARGUMENT');
            result.sort();
        }
        return result;
    }
    if (schema.type === 'object') {
        if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
            fail('INVALID_ARGUMENT');
        if (schema.jsonLimit) {
            validateJson(value, schema.jsonLimit);
            return JSON.parse(canonical(value));
        }
        const props = schema.properties ?? {};
        if (schema.additionalProperties === false && Object.keys(value).some(k => !Object.hasOwn(props, k)))
            fail('INVALID_ARGUMENT');
        for (const k of schema.required ?? [])
            if (!Object.hasOwn(value, k))
                fail('INVALID_ARGUMENT');
        const result = {};
        for (const [k, s] of Object.entries(props)) {
            const v = validate(s, value[k]);
            if (v !== undefined)
                result[k] = v;
        }
        return result;
    }
    fail('INVALID_ARGUMENT');
}
export function validateProfile(value) {
    const p = validate(PROFILE_SCHEMA, value);
    assertNoCredentials(p);
    // Reserve Prime space for checkpoint, room references and envelope, including JSON escaping.
    if (bytes(p) > 114688)
        fail('LIMIT_EXCEEDED');
    for (const k of ['expected_tools', 'deliverables', 'schedule_definitions'])
        if (bytes(p[k]) > 8192)
            fail('LIMIT_EXCEEDED');
    return p;
}
export function validateInput(name, input, isOwner = false) {
    const schema = (isOwner ? OWNER_SCHEMAS : TOOL_SCHEMAS)[name];
    if (!schema)
        fail('INVALID_ARGUMENT');
    // Malformed credential errors must never include a value or a schema-generated snippet.
    if (!isOwner && (typeof input?.box_key !== 'string' || input.box_key.length > 100))
        fail('AUTH_FAILED');
    const value = validate(schema, input);
    const { box_key, ...content } = value;
    assertNoCredentials(content);
    if (content.capabilities && bytes(content.capabilities) > 4096)
        fail('LIMIT_EXCEEDED');
    if (content.profile)
        content.profile = validateProfile(content.profile);
    if (name === 'message_send' || name === 'request_respond') {
        if (bytes(content) > 65536)
            fail('LIMIT_EXCEEDED');
        for (const f of value.files ?? [])
            if ((name === 'request_respond' && value.status === 'result_ready' || /\b(final|versioned|deliverable)\b/i.test(f.display_name)) && !(f.version_label || f.content_sha256 || f.commit_hash))
                fail('INVALID_ARGUMENT');
    }
    return isOwner ? content : { ...content, box_key };
}
/** Strip implementation-only extensions to produce a standard JSON Schema for the official SDK. */
export function publicSchema(schema) {
    const out = {};
    for (const [k, v] of Object.entries(schema)) {
        if (['maxBytes', 'jsonLimit'].includes(k))
            continue;
        if (k === 'format' && !['uuid'].includes(String(v)))
            continue;
        if (k === 'properties')
            out[k] = Object.fromEntries(Object.entries(v).map(([n, s]) => [n, publicSchema(s)]));
        else if (k === 'items')
            out[k] = publicSchema(v);
        else if (k === 'oneOf')
            out[k] = v.map(publicSchema);
        else
            out[k] = v;
    }
    if (schema.jsonLimit)
        out.additionalProperties = true;
    return out;
}
//# sourceMappingURL=validation.js.map