/** Values crossing the repository boundary. SQLite integers stay bigint until DTO assembly. */
export type Bind = string | number | bigint | null;
export type Row = Record<string, any>;
export interface Statement {
    get(...values: Bind[]): Row | undefined;
    all(...values: Bind[]): Row[];
    run(...values: Bind[]): {
        changes: number | bigint;
        lastInsertRowid: number | bigint;
    };
}
export interface Database {
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
    backup?(destination: string): Promise<unknown>;
}
export interface AgentContext {
    readonly agent_id: string;
    readonly key_id: string;
    readonly session_id: string;
    readonly profile_version_seen: bigint;
}
export interface OwnerContext {
    readonly kind: 'owner';
}
export interface Clock {
    now(): number;
}
export type ErrorCode = 'AUTH_FAILED' | 'NOT_PRIMED' | 'PROFILE_OUTDATED' | 'NOT_FOUND_OR_FORBIDDEN' | 'ROOM_ARCHIVED' | 'INVALID_ARGUMENT' | 'LIMIT_EXCEEDED' | 'REVISION_CONFLICT' | 'IDEMPOTENCY_CONFLICT' | 'CURSOR_INVALID' | 'RATE_LIMITED' | 'TEMPORARILY_UNAVAILABLE' | 'STORAGE_FAILURE';
const messages: Record<ErrorCode, string> = {
    AUTH_FAILED: 'Authentication failed. Ask the owner for a valid Box Key.',
    NOT_PRIMED: 'Call agent_prime before using this tool.',
    PROFILE_OUTDATED: 'Load the current profile with profile_get or agent_prime, then intentionally retry.',
    NOT_FOUND_OR_FORBIDDEN: 'The requested resource is unavailable or inaccessible.',
    ROOM_ARCHIVED: 'The room is archived; new room content is frozen.',
    INVALID_ARGUMENT: 'The supplied input does not satisfy the tool contract.',
    LIMIT_EXCEEDED: 'A bounded content, membership, or response limit was exceeded.',
    REVISION_CONFLICT: 'Read current state, merge deliberately, and retry with a new mutation ID.',
    IDEMPOTENCY_CONFLICT: 'This mutation ID already identifies a different committed request.',
    CURSOR_INVALID: 'The cursor is malformed or belongs to a different scope. Start a fresh scan.',
    RATE_LIMITED: 'The request or logical-write quota is exhausted.',
    TEMPORARILY_UNAVAILABLE: 'Storage is temporarily busy. Retry the whole operation with the same mutation ID.',
    STORAGE_FAILURE: 'Storage failed; the operation must not be treated as durably stored.'
};
export class ServiceError extends Error {
    constructor(public readonly code: ErrorCode, public readonly details: {
        current_revision?: string;
        retry_after_ms?: number;
    } = {}) {
        super(messages[code]);
        this.name = 'ServiceError';
    }
    dto() {
        return { code: this.code, message: this.message,
            retryable: this.code === 'RATE_LIMITED' || this.code === 'TEMPORARILY_UNAVAILABLE', ...this.details };
    }
}
export function fail(code: ErrorCode, details: {
    current_revision?: string;
    retry_after_ms?: number;
} = {}): never {
    throw new ServiceError(code, details);
}
export function normalizeError(error: unknown): ServiceError {
    if (error instanceof ServiceError)
        return error;
    const code = (error as {
        code?: string;
    })?.code ?? '';
    return new ServiceError(code.includes('BUSY') || code.includes('LOCKED') ? 'TEMPORARILY_UNAVAILABLE' : 'STORAGE_FAILURE');
}
