import type { Core } from './core.js';
import type { AgentContext, Row } from '../types.js';
export declare function inboxList(core: Core, c: AgentContext, p: any): {
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
export declare function validateAck(core: Core, c: AgentContext, p: any): Row[];
export declare function inboxAck(core: Core, c: AgentContext, p: any): {
    acked_count: number;
    already_acked_count: number;
    acked_inbox_seqs: string[];
    already_acked_inbox_seqs: string[];
};
export declare function requestsList(core: Core, c: AgentContext, p: any): {
    current_state_browser: boolean;
    server_time: string;
    has_more: boolean;
    next_cursor: string;
    resume_cursor: null;
    upper: string;
    items: any[];
} | {
    current_state_browser: boolean;
    server_time: string;
    has_more: boolean;
    next_cursor: null;
    resume_cursor: string;
    upper: string;
    items: any[];
};
