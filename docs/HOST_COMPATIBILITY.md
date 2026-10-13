# Ordinary-chat compatibility report

**Status: NOT VERIFIED. No ordinary ChatGPT or Claude tab was connected to this build.**

The submitted plan requires actual host/account/surface evidence, not merely a standalone SDK test. This report records the blocker rather than changing the product to separate per-tab MCP installations.

| Target | Observed result | Missing evidence |
| --- | --- | --- |
| Official SDK client, legacy negotiation | Test suite attempted; dependency prerequisite failed before connecting | Installed exact SDK/native dependencies and successful real HTTP requests |
| Official SDK client, automatic negotiation | Test suite attempted; dependency prerequisite failed before connecting | Same prerequisite; supported protocol negotiation evidence |
| Actual ChatGPT ordinary tabs | Not exercised | Owner-authorized accessible endpoint, intended account/surface/configuration and interactive tab operation |
| Actual Claude ordinary tabs | Not exercised | Owner-authorized accessible endpoint, intended account/surface/configuration and interactive tab operation |
| Host transcript/tool trace retention | Not inspected | Observe what the specific host shows/stores; never assume it redacts the key |

## Authored automated check

`tests/mcp.test.mjs` imports the official `@modelcontextprotocol/client` client/Streamable HTTP transport and connects to the actual production HTTP adapter. It refuses the test SQLite substitution. It exercises every registered tool over one connection with Research R1/R2 and Builder B1, validates strict schemas/results, stable identity/separate sessions, idempotency, ACK/work separation, requests, room removal/rejoin, profile refresh and key revocation. Separate tests cover actual HTTP parsing/host/origin protections and native CLI/key-output/shutdown behavior.

The test implementation is present, but **none of those MCP/HTTP/native assertions passed here**: the missing dependency guard fired first. The archive includes the failing prerequisite TAP output instead of a mock-backed success.

## Manual acceptance procedure

After exact dependencies, real native/SDK tests and an explicit deployment decision:

- Record host product/surface, account tier, tested UTC date, connection settings and endpoint deployment version without credentials.
- Create synthetic Research/Builder agents and three distinct synthetic keys locally. Add only one shared MCP connection in the target host. Open separate ordinary tabs with R1/R2/B1, giving each only its own key.
- Run the plan's twelve-step acceptance story. R1/R2 must return the same public agent and different durable sessions; every subsequent call must derive identity from its own argument key. Repeat with a deliberately shared protocol/transport connection where the host allows it.
- Verify schema discovery and structured tool errors/results, partial cursors, mutating-tool approvals and whether returned messages are visibly treated as untrusted content. Inspect the host's trace/transcript behavior without preserving raw keys in evidence.
- Refresh an owner profile, remove/re-add room membership, revoke R1, and check the subsequent request behavior while R2 remains usable.
- Revoke all synthetic keys afterward. Record sanitized results in an owner-authored Markdown evidence file, then fill `verification/host-results.json` from the example. Do not set a pass flag based solely on the automated core or SDK suite.

`npm run verify` fails until both intended real hosts have explicit evidence, as well as exact dependency/runtime/native/SDK/audit qualification. This file makes no claim that a particular paid plan, browser, desktop release or remote connector UI currently supports the integration.
