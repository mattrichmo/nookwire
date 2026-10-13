import type { Core } from './core.js';
import type { AgentContext } from '../types.js';
export declare function messageMarkdown(m: any): string;
export declare function messagePage(core: Core, c: AgentContext, p: any, kind: 'conversation' | 'thread' | 'export'): {
    content: string;
    server_time: string;
    has_more: boolean;
    next_cursor: string;
    resume_cursor: null;
    upper: string;
    export_schema_version: string;
    exported_at: string;
    format: any;
    partial: boolean;
} | {
    items: any[];
    server_time: string;
    has_more: boolean;
    next_cursor: string;
    resume_cursor: null;
    upper: string;
    export_schema_version: string;
    exported_at: string;
    format: any;
    partial: boolean;
} | {
    content: string;
    server_time: string;
    has_more: boolean;
    next_cursor: null;
    resume_cursor: string;
    upper: string;
    export_schema_version: string;
    exported_at: string;
    format: any;
    partial: boolean;
} | {
    items: any[];
    server_time: string;
    has_more: boolean;
    next_cursor: null;
    resume_cursor: string;
    upper: string;
    export_schema_version: string;
    exported_at: string;
    format: any;
    partial: boolean;
} | {
    server_time: string;
    has_more: boolean;
    next_cursor: string;
    resume_cursor: null;
    upper: string;
    items: any[];
} | {
    server_time: string;
    has_more: boolean;
    next_cursor: null;
    resume_cursor: string;
    upper: string;
    items: any[];
};
