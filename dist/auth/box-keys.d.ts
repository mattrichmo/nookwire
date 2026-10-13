import type { Repo } from '../db/open.js';
import type { AgentContext } from '../types.js';
export declare function issueToken(keyId: string): string;
export declare function parseCredential(token: unknown): {
    keyId: string;
    digest: string;
};
/** Never return token/hash to domain services. This must run in the transaction that authorizes work. */
export declare function verifyCredential(repo: Repo, token: unknown, now: number, prime?: boolean): AgentContext;
