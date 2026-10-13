import type { Core } from './core.js';
import type { AgentContext } from '../types.js';
export declare function directorySearch(core: Core, c: AgentContext, p: any): {
    items: any[];
    has_more: boolean;
    next_cursor: string | null;
    browsing_only: boolean;
};
export declare function directoryUpdate(core: Core, c: AgentContext, p: any): {
    agent_id: string;
    revision: string;
    listed: boolean;
};
