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
export declare class ServiceError extends Error {
    readonly code: ErrorCode;
    readonly details: {
        current_revision?: string;
        retry_after_ms?: number;
    };
    constructor(code: ErrorCode, details?: {
        current_revision?: string;
        retry_after_ms?: number;
    });
    dto(): {
        current_revision?: string;
        retry_after_ms?: number;
        code: ErrorCode;
        message: string;
        retryable: boolean;
    };
}
export declare function fail(code: ErrorCode, details?: {
    current_revision?: string;
    retry_after_ms?: number;
}): never;
export declare function normalizeError(error: unknown): ServiceError;
