#!/usr/bin/env node
/** Resolve REAL registry versions, install exact dependencies and generate a genuine npm lock.
 * This is a one-time dependency qualification step, not a substitute for npm ci after locking.
 * No release is qualified until the native/SDK suite and manual-host gates pass.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packagePath = resolve(root, 'package.json');
function command(args, capture = false) {
    const result = spawnSync(npm, args, { cwd: root, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', timeout: capture ? 30000 : 240000 });
    if (result.status !== 0)
        throw new Error(`npm ${args[0]} failed; check registry connectivity and supported Node version. No dependency qualification has been claimed.`);
    return capture ? result.stdout.trim() : '';
}
function latestStable(name, major) {
    const value = JSON.parse(command(['view', `${name}@${major}`, 'version', '--json', '--fetch-retries=0', '--fetch-timeout=20000'], true));
    const versions = (Array.isArray(value) ? value : [value]).filter(v => new RegExp(`^${major}\\.\\d+\\.\\d+$`).test(v));
    versions.sort((a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
    if (!versions.length)
        throw new Error(`No stable ${name} major ${major} was returned. Do not substitute a preview or v1 SDK silently.`);
    return versions.at(-1);
}
try {
    const expected = readFileSync(resolve(root, '.nvmrc'), 'utf8').trim();
    if (process.versions.node !== expected)
        throw new Error(`Use Node ${expected} for the production dependency qualification. The included offline evidence uses a different runtime and is not production qualification.`);
    if (existsSync(resolve(root, 'package-lock.json')) && !process.argv.includes('--re-resolve')) {
        command(['ci']);
        console.log('Installed the existing lockfile. Run npm run build && npm test.');
        process.exit(0);
    }
    const specs = { '@modelcontextprotocol/server': 2, '@modelcontextprotocol/node': 2, '@modelcontextprotocol/express': 2, '@modelcontextprotocol/client': 2, zod: 4, '@types/node': 24 };
    const versions = {};
    for (const [name, major] of Object.entries(specs))
        versions[name] = latestStable(name, major);
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    pkg.dependencies = { '@modelcontextprotocol/server': versions['@modelcontextprotocol/server'], '@modelcontextprotocol/node': versions['@modelcontextprotocol/node'], '@modelcontextprotocol/express': versions['@modelcontextprotocol/express'], 'better-sqlite3': '13.0.3', express: '5.3.0', zod: versions.zod };
    pkg.devDependencies = { '@modelcontextprotocol/client': versions['@modelcontextprotocol/client'], '@types/node': versions['@types/node'], typescript: '5.8.3' };
    writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
    command(['install', '--save-exact']);
    if (!existsSync(resolve(root, 'package-lock.json')))
        throw new Error('npm did not produce a lockfile. Qualification is blocked.');
    writeFileSync(resolve(root, 'verification/dependency-resolution.json'), JSON.stringify({ resolved_at: new Date().toISOString(), node: process.versions.node, dependencies: pkg.dependencies, devDependencies: pkg.devDependencies, qualification: 'Resolved and installed; run native/core/MCP tests and host gates separately.' }, null, 2) + '\n');
    console.log('Exact dependencies installed and genuine lockfile created. Review/commit both manifests; run npm run build, npm test, npm audit, then npm run verify.');
}
catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
