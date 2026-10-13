import { fail } from '../types.js';
import { canonical, sequence, bytes } from '../util.js';
export interface Cursor {
    v: 1;
    stream: string;
    agent_id: string;
    scope: any;
    after: string;
    upper?: string;
    tie?: string;
}
export function encodeCursor(cursor: Cursor): string { return Buffer.from(canonical(cursor)).toString('base64url'); }
export function decodeCursor(value: string | undefined, stream: string, agent_id: string, scope: any, numeric = true): Cursor {
    const empty: Cursor = { v: 1, stream, agent_id, scope, after: numeric ? '0' : '' };
    if (!value)
        return empty;
    try {
        if (value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value))
            fail('CURSOR_INVALID');
        const c = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
        if (!c || Array.isArray(c) || Object.keys(c).some(k => !['v', 'stream', 'agent_id', 'scope', 'after', 'upper', 'tie'].includes(k)) || c.v !== 1 || c.stream !== stream || c.agent_id !== agent_id || canonical(c.scope) !== canonical(scope) || typeof c.after !== 'string' || c.after.length > 200 || (c.tie !== undefined && (typeof c.tie !== 'string' || c.tie.length > 200)))
            fail('CURSOR_INVALID');
        if (numeric) {
            const after = sequence(c.after);
            if (c.upper !== undefined && after > sequence(c.upper))
                fail('CURSOR_INVALID');
        }
        else if (c.upper !== undefined)
            fail('CURSOR_INVALID');
        return c;
    }
    catch {
        fail('CURSOR_INVALID');
    }
}
export function budget<T>(candidates: T[], limit: number, maxBytes: number, convert: (row: T) => any): {
    items: any[];
    rows: T[];
    has_more: boolean;
} {
    const items: any[] = [], rows: T[] = [];
    let used = 1024;
    for (const row of candidates) {
        if (items.length >= limit)
            return { items, rows, has_more: true };
        const item = convert(row), n = bytes(item) + 2;
        if (used + n > maxBytes) {
            if (items.length === 0)
                fail('LIMIT_EXCEEDED');
            return { items, rows, has_more: true };
        }
        items.push(item);
        rows.push(row);
        used += n;
    }
    return { items, rows, has_more: false };
}
export function pageCursors(cursor: Cursor, upper: string, last: string | undefined, more: boolean, tie?: string) {
    if (more)
        return { has_more: true, next_cursor: encodeCursor({ ...cursor, upper, after: last!, ...(tie ? { tie } : {}) }), resume_cursor: null, upper };
    const resume = { ...cursor, after: upper };
    delete resume.upper;
    delete resume.tie;
    return { has_more: false, next_cursor: null, resume_cursor: encodeCursor(resume), upper };
}
