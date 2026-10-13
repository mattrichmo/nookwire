import type { OwnerContext } from '../types.js';
/** Local entrypoint only. This factory is never imported by the MCP registration module. */
export declare function localOwnerContext(): OwnerContext;
export declare function assertOwner(context: OwnerContext): void;
