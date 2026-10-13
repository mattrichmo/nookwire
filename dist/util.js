import { createHash } from 'node:crypto';
import { fail } from './types.js';
export const MAX_I64 = 9223372036854775807n;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const tokenPattern = /box_v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{20,}/i;
export const bytes = (value) => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export function sequence(value) {
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(value))
        fail('INVALID_ARGUMENT');
    const n = BigInt(value);
    if (n > MAX_I64)
        fail('INVALID_ARGUMENT');
    return n;
}
export function canonical(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return '[' + value.map(canonical).join(',') + ']';
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
export function jsonSafe(value) {
    if (typeof value === 'bigint')
        return value.toString();
    if (Array.isArray(value))
        return value.map(jsonSafe);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]));
    return value;
}
export function assertNoCredentials(value) {
    if (tokenPattern.test(typeof value === 'string' ? value : JSON.stringify(value)))
        fail('INVALID_ARGUMENT');
}
const blockedFields = /^(?:__proto__|prototype|constructor|secret|secret[_-]?key|client[_-]?secret|private[_-]?key|api[_-]?key|box[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|credential[s]?|cookie[s]?|base64|attachment[s]?|binary|file_bytes|file_content|data_url)$/i;
export function validateJson(value, maxBytes, maxDepth = 8) {
    const walk = (v, depth) => {
        if (depth > maxDepth)
            fail('LIMIT_EXCEEDED');
        if (v === null || typeof v === 'boolean' || typeof v === 'string')
            return;
        if (typeof v === 'number') {
            if (!Number.isFinite(v))
                fail('INVALID_ARGUMENT');
            return;
        }
        if (!v || typeof v !== 'object' || (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v))))
            fail('INVALID_ARGUMENT');
        if (Array.isArray(v)) {
            for (const x of v)
                walk(x, depth + 1);
        }
        else
            for (const [k, x] of Object.entries(v)) {
                if (blockedFields.test(k))
                    fail('INVALID_ARGUMENT');
                walk(x, depth + 1);
            }
    };
    walk(value, 0);
    if (bytes(value) > maxBytes)
        fail('LIMIT_EXCEEDED');
    assertNoCredentials(value);
}
export function assertRevision(actual, expected) {
    if (BigInt(actual) !== sequence(expected))
        fail('REVISION_CONFLICT', { current_revision: String(actual) });
}
export function safeUrl(value) {
    let u;
    try {
        u = new URL(value);
    }
    catch {
        fail('INVALID_ARGUMENT');
    }
    if (!value.startsWith('https://') || u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || value.includes('?') || value.includes('#') || value.length > 2048 || /[\s\\]/.test(value))
        fail('INVALID_ARGUMENT');
    const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal'))
        fail('INVALID_ARGUMENT');
    if (h.includes(':')) { // conservative v1: reject all literal IPv6, including IPv4-mapped hosts
        fail('INVALID_ARGUMENT');
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
        const [a, b] = h.split('.').map(Number);
        if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)))
            fail('INVALID_ARGUMENT');
    }
    if (/(?:token|api[_-]?key|secret|signature|signed)[=/]|(?:ghp_|github_pat_|xox[baprs]-|sk_live_)/i.test(decodeURIComponentSafe(value)))
        fail('INVALID_ARGUMENT');
    assertNoCredentials(value);
    assertNoCredentials(decodeURIComponentSafe(value));
}
function decodeURIComponentSafe(s) {
    try {
        return decodeURIComponent(s);
    }
    catch {
        fail('INVALID_ARGUMENT');
    }
}
export function iso(ms) { return new Date(ms).toISOString(); }
//# sourceMappingURL=util.js.map