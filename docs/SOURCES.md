# Specification and external verification

The user-supplied **Nookwire Build Plan**, dated October 12, 2026, is preserved in `reference/NOOKWIRE_BUILD_PLAN.md`. Product scope, schema, trust model, tool/CLI inventory and semantics come from that document, not from an unrelated messaging product.

Official sources inspected during implementation (October 12, 2026 in America/Regina; run artifacts may show October 13 UTC):

- MCP TypeScript SDK v2 overview: https://ts.sdk.modelcontextprotocol.io/v2/
- Official Express integration and host/origin behavior: https://ts.sdk.modelcontextprotocol.io/v2/serving/express.html
- Official HTTP client/transport imports and negotiation modes: https://ts.sdk.modelcontextprotocol.io/v2/clients/connect.html
- Official first client and tool-call contracts: https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-client.html
- Official protocol transport reference supplied by the plan: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
- Node release/LTS information: https://nodejs.org/en/about/previous-releases
- better-sqlite3 registry metadata and maintainer API: https://registry.npmjs.org/better-sqlite3/latest and https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
- Express registry metadata: https://registry.npmjs.org/express/latest
- SQLite WAL guidance: https://sqlite.org/wal.html
- Caddy reverse-proxy/streaming configuration: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy

These sources support the selected API shape and example configuration, not proof that the dependencies were installed. The official documentation identifies the v2 split packages, `McpServer`, `createMcpHandler`, `toNodeHandler`, `createMcpExpressApp`, and client/Streamable HTTP APIs used by this source. The exact SDK package versions were not retrieved/installed in the container. Package retrieval failed with `EAI_AGAIN` at registry.npmjs.org; some web package pages also returned 403.

The chosen Node patch is recorded in `.nvmrc`; it was **not** the runtime available for tests. Known registry selections for `better-sqlite3` 13.0.3 and Express 5.3.0 are not installation/native-ABI/security-audit evidence. SDK/Zod/type requirements remain unresolved until bootstrap installs exact versions and produces a genuine npm lock. The installed local TypeScript compiler used to generate `dist/` was 5.8.3.

No CI workflow is included yet. When one is added, pin action revisions and container image digests as part of the supply-chain review.
