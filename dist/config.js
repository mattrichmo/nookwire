import { isAbsolute } from 'node:path';
export const DEFAULT_LIMITS = Object.freeze({
    http_bytes: 131072, response_bytes: 262144, page_bytes: 110000,
    message_body_bytes: 16384, payload_bytes: 8192, message_total_bytes: 65536,
    files_per_message: 10, mentions: 20, room_members: 100, rooms_per_agent: 100,
    active_keys_per_agent: 50, page_default: 20, page_max: 50, ack_max: 100,
    requests_per_key: 120, requests_per_agent: 300, writes_per_agent: 30,
    preauth_per_minute: 240, preauth_bucket_cap: 4096, busy_timeout_ms: 500,
    busy_retries: 2
});
export function loadConfig(env = process.env) {
    const port = Number(env.NOOKWIRE_PORT ?? '8787');
    const dbPath = env.NOOKWIRE_DB ?? '';
    if (!isAbsolute(dbPath) || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Set NOOKWIRE_DB to an absolute durable-disk path and NOOKWIRE_PORT to a valid port.');
    }
    const csv = (s, fallback) => (s ?? fallback).split(',').map(s => s.trim()).filter(Boolean);
    const bind = env.NOOKWIRE_BIND ?? '127.0.0.1';
    if (bind !== '127.0.0.1' && bind !== '::1' && !env.NOOKWIRE_ALLOWED_HOSTS) {
        throw new Error('A non-loopback bind requires explicit NOOKWIRE_ALLOWED_HOSTS.');
    }
    const limits = { ...DEFAULT_LIMITS };
    for (const k of Object.keys(limits)) {
        const value = env[`NOOKWIRE_LIMIT_${k.toUpperCase()}`];
        if (value !== undefined) {
            const n = Number(value);
            if (!Number.isSafeInteger(n) || n < 1 || n > DEFAULT_LIMITS[k])
                throw new Error('Invalid limit override. Limits may only be reduced.');
            limits[k] = n;
        }
    }
    if (limits.page_bytes < 70000 || limits.response_bytes < 150000 || limits.http_bytes < 70000)
        throw new Error('Configured byte caps cannot fit the largest legal item.');
    return { dbPath, bind, port, allowedHosts: csv(env.NOOKWIRE_ALLOWED_HOSTS, 'localhost,127.0.0.1,[::1]'),
        allowedOrigins: csv(env.NOOKWIRE_ALLOWED_ORIGINS, 'localhost,127.0.0.1,[::1]'),
        trustProxy: env.NOOKWIRE_TRUSTED_PROXIES ? csv(env.NOOKWIRE_TRUSTED_PROXIES, '') : false,
        requireExistingDirectory: true, limits };
}
//# sourceMappingURL=config.js.map