import type { OwnerContext } from '../types.js';
const trusted = new WeakSet<object>();
/** Local entrypoint only. This factory is never imported by the MCP registration module. */
export function localOwnerContext(): OwnerContext { const context = Object.freeze({ kind: 'owner' as const }); trusted.add(context); return context; }
export function assertOwner(context: OwnerContext): void { if (!trusted.has(context))
    throw new Error('A local owner context is required.'); }
