#!/usr/bin/env node
/** Fail-closed release qualification. Does not deploy, issue production keys, or alter profiles. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const blockers = [];
const node = readFileSync(resolve(root, '.nvmrc'), 'utf8').trim();
if (process.versions.node !== node)
    blockers.push(`Production runtime must be pinned Node ${node}; actual runtime is ${process.versions.node}.`);
if (process.env.NOOKWIRE_TEST_DRIVER)
    blockers.push('A release run may not substitute a test database driver.');
const required = ['@modelcontextprotocol/server', '@modelcontextprotocol/node', '@modelcontextprotocol/express', 'better-sqlite3', 'express', 'zod'];
for (const name of required)
    if (!/^\d+\.\d+\.\d+$/.test(pkg.dependencies?.[name] ?? ''))
        blockers.push(`Exact dependency pin missing: ${name}.`);
for (const name of ['@modelcontextprotocol/client', '@types/node', 'typescript'])
    if (!/^\d+\.\d+\.\d+$/.test(pkg.devDependencies?.[name] ?? ''))
        blockers.push(`Exact test/build dependency pin missing: ${name}.`);
let lock;
try {
    lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
    const top = lock.packages?.[''];
    for (const section of ['dependencies', 'devDependencies'])
        for (const [name, version] of Object.entries(pkg[section] ?? {})) {
            if (top?.[section]?.[name] !== version || lock.packages?.[`node_modules/${name}`]?.version !== version)
                blockers.push(`Lock mismatch: ${name}.`);
        }
    if (![2, 3].includes(lock.lockfileVersion))
        blockers.push('Unsupported/incomplete npm lockfile.');
}
catch {
    blockers.push('A genuine complete package-lock.json is missing; bootstrap dependency qualification is required.');
}
try {
    const results = JSON.parse(readFileSync(resolve(root, 'verification/host-results.json'), 'utf8'));
    for (const host of ['chatgpt', 'claude']) {
        const result = results[host];
        if (result?.status !== 'passed' || result?.separate_tab_keys !== true || result?.shared_connection !== true || result?.identity_bleed !== false || result?.acceptance_story_passed !== true || !result?.surface || !result?.tested_at || !result?.evidence_file)
            blockers.push(`Real ${host} ordinary-tab evidence is missing/incomplete.`);
        else if (!existsSync(resolve(root, result.evidence_file)))
            blockers.push(`Evidence file not found for ${host}.`);
    }
}
catch {
    blockers.push('Manual target-host acceptance evidence is missing (verification/host-results.json).');
}
const report = { checked_at: new Date().toISOString(), node: process.versions.node, status: 'blocked', blockers, steps: [] };
if (!blockers.length) {
    for (const command of [['run', 'build'], ['run', 'typecheck'], ['test'], ['audit', '--json']]) {
        const result = spawnSync(npm, command, { cwd: root, encoding: 'utf8', timeout: 180000 });
        report.steps.push({ command: `npm ${command.join(' ')}`, exit_code: result.status });
        // Qualification logs contain only synthetic fixtures, never production credentials.
        writeFileSync(resolve(root, `verification/release-${command[0] === 'run' ? command[1] : command[0]}.log`), (result.stdout ?? '') + (result.stderr ?? ''));
        if (result.status !== 0) {
            blockers.push(`Qualification command failed: npm ${command.join(' ')}`);
            break;
        }
    }
}
if (!blockers.length) {
    report.status = 'passed';
    report.lock_sha256 = createHash('sha256').update(readFileSync(resolve(root, 'package-lock.json'))).digest('hex');
}
writeFileSync(resolve(root, 'verification/release-gate.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (blockers.length)
    process.exitCode = 1;
