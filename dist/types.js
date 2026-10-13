const messages = {
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
    code;
    details;
    constructor(code, details = {}) {
        super(messages[code]);
        this.code = code;
        this.details = details;
        this.name = 'ServiceError';
    }
    dto() {
        return { code: this.code, message: this.message,
            retryable: this.code === 'RATE_LIMITED' || this.code === 'TEMPORARILY_UNAVAILABLE', ...this.details };
    }
}
export function fail(code, details = {}) {
    throw new ServiceError(code, details);
}
export function normalizeError(error) {
    if (error instanceof ServiceError)
        return error;
    const code = error?.code ?? '';
    return new ServiceError(code.includes('BUSY') || code.includes('LOCKED') ? 'TEMPORARILY_UNAVAILABLE' : 'STORAGE_FAILURE');
}
//# sourceMappingURL=types.js.map