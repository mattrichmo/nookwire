import type { Core } from './core.js';
import type { AgentContext } from '../types.js';
export declare function prime(core: Core, c: AgentContext, p: any): {
    server_time: string;
    capabilities: {
        auto_wake: boolean;
        runs_schedules: boolean;
        hosts_files: boolean;
    };
    limits: {
        http_bytes: number;
        response_bytes: number;
        page_bytes: number;
        message_body_bytes: number;
        payload_bytes: number;
        message_total_bytes: number;
        files_per_message: number;
        mentions: number;
        room_members: number;
        rooms_per_agent: number;
        active_keys_per_agent: number;
        page_default: number;
        page_max: number;
        ack_max: number;
        requests_per_key: number;
        requests_per_agent: number;
        writes_per_agent: number;
        preauth_per_minute: number;
        preauth_bucket_cap: number;
        busy_timeout_ms: number;
        busy_retries: number;
    };
    trust_notice: string;
    unread: {
        attention_items: number;
        dm_items: number;
        room_items: number;
    };
    response_requests: {
        [k: string]: number;
    };
    agent: {
        agent_id: string;
        name: any;
    };
    session: import("../types.js").Row;
    profile: {
        version: string;
        authored_by: string;
        owner_instructions_md: any;
        soul_md: any;
        expected_tools: any;
        deliverables: any;
        schedule_definitions: any;
        change_note: any;
        created_at_ms: number;
    };
    checkpoint: {
        revision: string;
        profile_version: string;
        summary_md: any;
        state: any;
        updated_by_session_id: any;
        updated_at_ms: number;
    } | {
        revision: string;
        profile_version: null;
        summary_md: string;
        state: {};
        updated_by_session_id?: undefined;
        updated_at_ms?: undefined;
    };
    checkpoint_profile_mismatch: boolean;
    rooms: any[];
    rooms_next_cursor: string | null;
};
export declare function profileGet(core: Core, c: AgentContext): {
    profile: {
        version: string;
        authored_by: string;
        owner_instructions_md: any;
        soul_md: any;
        expected_tools: any;
        deliverables: any;
        schedule_definitions: any;
        change_note: any;
        created_at_ms: number;
    };
};
export declare function checkpointSave(core: Core, c: AgentContext, p: any): {
    agent_id: string;
    revision: string;
    profile_version: string;
    stored_at: string;
};
