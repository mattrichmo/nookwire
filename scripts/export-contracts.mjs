import { writeFileSync } from 'node:fs';
import { exportedToolContracts } from '../dist/mcp/create-server.js';
import { OWNER_SCHEMAS, publicSchema } from '../dist/validation.js';
writeFileSync('docs/tool-contracts.json', JSON.stringify({ schema_version: '1', credential_model: 'Explicit box_key on every call. Never use public IDs or transport sessions as authentication.', tools: exportedToolContracts() }, null, 2) + '\n');
writeFileSync('docs/owner-contracts.json', JSON.stringify({ schema_version: '1', scope: 'Local trusted owner CLI only; not MCP tools', commands: Object.entries(OWNER_SCHEMAS).map(([name, schema]) => ({ name, inputSchema: publicSchema(schema) })) }, null, 2) + '\n');
