import type { Core } from './core.js';
import type { AgentContext } from '../types.js';
export declare function listRooms(core: Core, c: AgentContext, p: any): {
    items: any[];
    has_more: boolean;
    next_cursor: string | null;
};
export declare function roomGet(core: Core, c: AgentContext, p: any): {
    room_id: any;
    slug: any;
    name: any;
    description: any;
    archived: boolean;
    membership: {
        membership_id: string;
        joined_after_seq: string;
        follow_mode: any;
        preference_revision: string;
    };
    members: {
        agent_id: any;
        name: any;
    }[];
};
export declare function roomFollow(core: Core, c: AgentContext, p: any): {
    room_id: any;
    membership_id: string;
    mode: any;
    preference_revision: string;
};
export declare function briefUpdate(core: Core, c: AgentContext, p: any): {
    room_id: any;
    revision: string;
    author_agent_id: string;
    author_session_id: string;
    stored_at: string;
};
