export interface Cursor {
    v: 1;
    stream: string;
    agent_id: string;
    scope: any;
    after: string;
    upper?: string;
    tie?: string;
}
export declare function encodeCursor(cursor: Cursor): string;
export declare function decodeCursor(value: string | undefined, stream: string, agent_id: string, scope: any, numeric?: boolean): Cursor;
export declare function budget<T>(candidates: T[], limit: number, maxBytes: number, convert: (row: T) => any): {
    items: any[];
    rows: T[];
    has_more: boolean;
};
export declare function pageCursors(cursor: Cursor, upper: string, last: string | undefined, more: boolean, tie?: string): {
    has_more: boolean;
    next_cursor: string;
    resume_cursor: null;
    upper: string;
} | {
    has_more: boolean;
    next_cursor: null;
    resume_cursor: string;
    upper: string;
};
