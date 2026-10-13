import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Repo } from '../db/open.js';
import type { AgentContext } from '../types.js';
import { fail } from '../types.js';
import { sha256, uuidPattern } from '../util.js';
export function issueToken(keyId: string) { return `box_v1.${keyId}.${randomBytes(32).toString('base64url')}`; }
export function parseCredential(token: unknown): {
    keyId: string;
    digest: string;
} {
    if (typeof token !== 'string' || token.length > 100)
        fail('AUTH_FAILED');
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'box_v1' || !uuidPattern.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2]) || Buffer.from(parts[2], 'base64url').toString('base64url') !== parts[2])
        fail('AUTH_FAILED');
    return { keyId: parts[1], digest: sha256(token) };
}
/** Never return token/hash to domain services. This must run in the transaction that authorizes work. */
export function verifyCredential(repo: Repo, token: unknown, now: number, prime = false): AgentContext {
    const { keyId, digest } = parseCredential(token);
    const row = repo.one(`SELECT k.*,a.status AS agent_status FROM box_keys k JOIN agents a ON a.agent_id=k.agent_id WHERE k.key_id=?`, keyId);
    const same = timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(row?.key_hash ?? '0'.repeat(64), 'hex'));
    if (!row || !same || row.status !== 'active' || row.agent_status !== 'active' || (row.expires_at_ms !== null && BigInt(row.expires_at_ms) <= BigInt(now)))
        fail('AUTH_FAILED');
    const session = repo.one('SELECT * FROM agent_sessions WHERE key_id=?', keyId);
    if (session?.closed_at_ms !== null && session?.closed_at_ms !== undefined)
        fail('AUTH_FAILED');
    if (!session && !prime)
        fail('NOT_PRIMED');
    return Object.freeze({ agent_id: row.agent_id, key_id: keyId, session_id: session?.session_id ?? '', profile_version_seen: BigInt(session?.profile_version_seen ?? 0) });
}
