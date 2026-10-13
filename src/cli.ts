#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { openDatabase } from './db/open.js';
import { backupDatabase, verifyPath, restoreDatabase } from './db/operations.js';
import { Nookwire } from './services/runtime.js';
import { OwnerService, ownerReads } from './services/owner.js';
import { localOwnerContext } from './auth/context.js';
import { normalizeError } from './types.js';
const HELP = `Nookwire — an inbox for your agents. Local owner CLI; never an HTTP admin API.

Set NOOKWIRE_DB to an absolute path in an existing private durable directory.

nookwire agent create --name Research --profile examples/profile.json
nookwire agent list | agent show --agent UUID
nookwire agent rename --agent UUID --name NAME
nookwire agent disable|enable --agent UUID
nookwire key issue --agent UUID --label chat-1 --output /private/chat-1.key.json
nookwire key list|revoke-all --agent UUID
nookwire key revoke|replace --key UUID [--output NEW_PRIVATE_PATH]
nookwire session list --agent UUID
nookwire profile show|history --agent UUID --output PRIVATE_FILE
nookwire profile put --agent UUID --file PROFILE_JSON --expected-version N
nookwire directory set --agent UUID --listed true --file PUBLIC_JSON --expected-revision N
nookwire room create --slug project --name Project
nookwire room list | room edit --room UUID --name NAME --description TEXT
nookwire room archive|unarchive --room UUID
nookwire room add|remove --room UUID --agent UUID [--mode all|mentions|replies|mute]
nookwire room members|history --room UUID
nookwire room brief put --room UUID --file BRIEF_MD --expected-revision N
nookwire room brief history --room UUID --output PRIVATE_FILE
nookwire audit stats|events [--since-ms N] [--until-ms N] [--limit N]
nookwire db migrate | db verify [--file BACKUP] | db backup --destination NEW_FILE
nookwire db restore --file BACKUP  (requires stopped service; revokes ALL restored keys)
nookwire db maintenance [--rates-before-ms N] [--audit-before-ms N] [--receipts-before-ms N]

All writes support --mutation-id ID. Omitting it generates one for this invocation.
--input JSON_FILE supplies the command's strict argument object for advanced fields.
--stdout-secret explicitly permits one-time key output to a secure stdout consumer.
Profile output requires --output PRIVATE_FILE or explicit --show-private.
Raw keys are never accepted as command-line arguments. Do not commit keys or transcripts.
`;
const flagNames = ['name', 'profile', 'agent', 'key', 'label', 'expires-at-ms', 'output', 'file', 'expected-version', 'expected-revision', 'room', 'slug', 'description', 'mode', 'listed', 'destination', 'mutation-id', 'input', 'limit', 'cursor', 'version', 'after-version', 'after-agent-id', 'after-room-id', 'after-membership-id', 'after-revision', 'after-audit-seq', 'since-ms', 'until-ms', 'operation', 'rates-before-ms', 'audit-before-ms', 'receipts-before-ms'];
function output(value: any, path?: string) { const text = JSON.stringify(value, null, 2) + '\n'; if (path)
    writeFileSync(path, text, { flag: 'wx', mode: 0o600 });
else
    process.stdout.write(text); }
export async function main(argv = process.argv.slice(2)) {
    const options: any = Object.fromEntries(flagNames.map(n => [n, { type: 'string' }]));
    for (const n of ['help', 'stdout-secret', 'show-private'])
        options[n] = { type: 'boolean' };
    const parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
    const flags = parsed.values as Record<string, any>, pos = parsed.positionals;
    if (flags.help || !pos.length) {
        process.stdout.write(HELP);
        return;
    }
    const config = loadConfig();
    let op = pos.join('.');
    const writesKey = ['key.issue', 'key.replace'].includes(op);
    if (writesKey && !flags.output && !flags['stdout-secret'])
        throw new Error('Key issuance requires a new private output path or explicit secure stdout.');
    if (flags.output && existsSync(flags.output))
        throw new Error('Refusing to overwrite an output file.');
    if (['profile.show', 'profile.history', 'room.brief.history'].includes(op) && !flags.output && !flags['show-private'])
        throw new Error('Private content output requires an explicit destination.');
    if (op === 'db.restore') {
        if (!flags.file)
            throw new Error('Backup file required.');
        output(await restoreDatabase(flags.file, config.dbPath), flags.output);
        return;
    }
    if (op === 'db.verify') {
        output(verifyPath(flags.file ?? config.dbPath), flags.output);
        return;
    }
    const repo = openDatabase(config.dbPath, { timeout: config.limits.busy_timeout_ms });
    try {
        if (op === 'db.migrate') {
            output({ migrations_verified: true }, flags.output);
            return;
        }
        if (op === 'db.backup') {
            if (!flags.destination)
                throw new Error('New destination required.');
            output(await backupDatabase(repo, flags.destination), flags.output);
            return;
        }
        let input: any = flags.input ? JSON.parse(readFileSync(flags.input, 'utf8')) : {};
        const mappings: Record<string, string> = { agent: 'agent_id', key: 'key_id', room: 'room_id', 'mutation-id': 'idempotency_key' };
        const numbers = new Set(['expires-at-ms', 'limit', 'since-ms', 'until-ms', 'rates-before-ms', 'audit-before-ms', 'receipts-before-ms']);
        for (const [key, value] of Object.entries(flags))
            if (!['output', 'file', 'profile', 'input', 'show-private', 'stdout-secret', 'help', 'destination'].includes(key))
                input[mappings[key] ?? key.replaceAll('-', '_')] = numbers.has(key) ? Number(value) : key === 'listed' ? value === 'true' ? true : value === 'false' ? false : value : value;
        if (op === 'agent.disable' || op === 'agent.enable') {
            input.status = op.endsWith('enable') ? 'active' : 'disabled';
            op = 'agent.status';
        }
        if (op === 'room.archive' || op === 'room.unarchive') {
            input.archived = op.endsWith('.archive');
            op = 'room.edit';
        }
        if (op === 'room.history') {
            input.history = true;
            op = 'room.members';
        }
        if (op === 'agent.create')
            input.profile = flags.profile ? JSON.parse(readFileSync(flags.profile, 'utf8')) : {};
        if (op === 'profile.put') {
            if (!flags.file)
                throw new Error('Profile file required.');
            input.profile = JSON.parse(readFileSync(flags.file, 'utf8'));
        }
        if (op === 'directory.set') {
            if (flags.file)
                input = { ...JSON.parse(readFileSync(flags.file, 'utf8')), ...input };
        }
        if (op === 'room.brief.put') {
            if (!flags.file)
                throw new Error('Brief file required.');
            input.brief_md = readFileSync(flags.file, 'utf8');
        }
        if (!ownerReads.has(op))
            input.idempotency_key ??= randomUUID();
        const service = new OwnerService(new Nookwire(repo), localOwnerContext()), result = service.call(op, input);
        if (writesKey)
            process.stderr.write('Keep this per-chat credential private. Its secret is shown once and cannot be recovered. Never store it in shell history, logs, shared terminals or Git.\n');
        output(result, flags.output);
    }
    finally {
        repo.db.close();
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    main().catch(error => {
        const safe = normalizeError(error);
        process.stderr.write(JSON.stringify({ error: safe.dto(), help: 'Run nookwire --help. Check required options and private output paths.' }) + '\n');
        process.exitCode = 1;
    });
