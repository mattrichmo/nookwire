import type { Nookwire } from '../services/runtime.js';
export declare const TOOL_DESCRIPTIONS: Record<string, string>;
export declare function createServerFactory(service: Nookwire): Promise<() => any>;
export declare function exportedToolContracts(): {
    name: string;
    description: string;
    inputSchema: any;
}[];
