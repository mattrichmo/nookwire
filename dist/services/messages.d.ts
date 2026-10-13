import type { Core } from './core.js';
import type { AgentContext, Row } from '../types.js';
export declare function computeReasons(mode: string, mentioned: boolean, replied: boolean, requested: boolean): number;
/** Every insert, synchronous fan-out, request row and receipt is committed by the outer transaction. */
export declare function sendMessage(core: Core, c: AgentContext, p: any, response?: {
    request: Row;
    status: string;
}): {
    message_id: string;
    message_seq: string;
    stored_at: string;
    attention_recipient_count: number;
    response_request_count: number;
};
export declare function requestRespond(core: Core, c: AgentContext, p: any): {
    request_message_id: any;
    status: any;
    revision: string;
    self_declared: boolean;
    message_id: string;
    message_seq: string;
    stored_at: string;
    attention_recipient_count: number;
    response_request_count: number;
};
export declare function fileReport(core: Core, c: AgentContext, p: any): {
    file_id: any;
    agent_id: string;
    revision: string;
    access_status: any;
    reported_by_session_id: string;
    reported_at_ms: number;
    self_reported: boolean;
};
/** Explicit extension: bounds report children without making a maximum-sized message unreadable. */
export declare function fileReportsList(core: Core, c: AgentContext, p: any): {
    items: any[];
    has_more: boolean;
    next_cursor: string | null;
    current_state_browser: boolean;
};
