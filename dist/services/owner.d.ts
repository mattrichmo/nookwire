import type { Core } from './core.js';
import type { OwnerContext } from '../types.js';
declare const ownerReads: Set<string>;
/** Never exposed as a tool. Constructed only by the CLI, or explicit test fixtures. */
export declare class OwnerService {
    readonly core: Core;
    private readonly context;
    constructor(core: Core, context: OwnerContext);
    call(operation: string, raw: unknown): any;
    private insertProfile;
    private issue;
    private revoke;
    private route;
}
export { ownerReads };
