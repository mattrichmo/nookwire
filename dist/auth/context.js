const trusted = new WeakSet();
/** Local entrypoint only. This factory is never imported by the MCP registration module. */
export function localOwnerContext() { const context = Object.freeze({ kind: 'owner' }); trusted.add(context); return context; }
export function assertOwner(context) {
    if (!trusted.has(context))
        throw new Error('A local owner context is required.');
}
//# sourceMappingURL=context.js.map