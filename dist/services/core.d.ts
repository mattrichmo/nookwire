import type { AgentContext, Clock, Row } from '../types.js';
import type { Repo } from '../db/open.js';
import { type Config } from '../config.js';
export declare const REASONS: Record<number, string>;
export declare class Core {
    readonly r: Repo;
    readonly clock: Clock;
    readonly id: () => string;
    readonly limits: Config['limits'];
    constructor(r: Repo, clock?: Clock, limits?: Partial<Config['limits']>, id?: () => string);
    now(): number;
    highwater(): bigint;
    latestProfile(agent: string): Row;
    profileDto(row: Row): {
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
    checkpoint(agent: string): {
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
    agent(id: string, active?: boolean): Row;
    room(id: string): Row;
    member(c: AgentContext, roomId: string): Row;
    writable(room: Row): void;
    visible(c: AgentContext, seq: bigint | number): Row | undefined;
    message(c: AgentContext, id: string): Row;
    file(c: AgentContext, id: string): {
        f: Row;
        m: Row;
    };
    attention(c: AgentContext, seq: bigint): Row;
    counts(c: AgentContext): {
        unread: {
            attention_items: number;
            dm_items: number;
            room_items: number;
        };
        response_requests: {
            [k: string]: number;
        };
    };
    recordReturned(c: AgentContext, messages: Row[]): void;
    messageDto(c: AgentContext, m: Row, forExport?: boolean): {
        message_id: any;
        message_seq: string;
        channel_kind: any;
        room_id: any;
        dm_recipient_agent_id: any;
        author: {
            agent_id: any;
            name: any;
            session_id: any;
            profile_version: string;
        };
        body_md: any;
        payload: any;
        created_at_ms: number;
        created_at: string;
        reply_to_message_id: any;
        thread_root_message_id: any;
        parent_context_available: boolean;
        response_to_request_message_id: any;
        response_status: any;
        mention_agent_ids: any[];
        response_requests: {
            recipient_agent_id: any;
            status: any;
            revision: string;
            latest_response_message_id: any;
            self_declared: boolean;
        }[];
        files: {
            file_id: any;
            display_name: any;
            url: any;
            media_type: any;
            version_label: any;
            content_sha256: any;
            commit_hash: any;
            versioned: boolean;
            access_reports_has_more: boolean;
            access_reports_next_cursor: string | null;
            access_reports: {
                agent_id: any;
                revision: string;
                access_status: any;
                reported_by_session_id: any;
                reported_at_ms: number;
                self_reported: boolean;
            }[];
        }[];
        content_trust: string;
    };
    publicCard(agent: string, listedOnly?: boolean): {
        agent_id: any;
        name: any;
        listed: boolean;
        public_role: any;
        public_summary: any;
        capabilities: any;
        self_declared: boolean;
        revision: string;
        last_check_in_at_ms: number | null;
    };
    roomRef(row: Row): {
        room_id: any;
        slug: any;
        name: any;
        archived: boolean;
        membership_id: string;
        joined_after_seq: string;
        follow_mode: any;
        preference_revision: string;
        brief_revision: string;
    };
    brief(c: AgentContext, room: string): {
        room_id: string;
        revision: string;
        brief_md: any;
        author_kind: any;
        author_agent_id: any;
        author_session_id: any;
        created_at_ms: number;
        content_trust: string;
    } | {
        room_id: string;
        revision: string;
        brief_md: string;
        author_kind?: undefined;
        author_agent_id?: undefined;
        author_session_id?: undefined;
        created_at_ms?: undefined;
        content_trust?: undefined;
    };
    consumeQuota(bucket: string, limit: number): void;
    audit(operation: string, context: AgentContext | null, outcome: 'success' | 'failure', meta?: {
        owner?: boolean;
        error_code?: string;
        duration_ms?: number;
        result_count?: number;
        payload_bytes?: number;
        replayed?: boolean;
    }): void;
    output(result: any): any;
}
