import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { openDatabase } from './db/open.js';
import { acquireServiceLock } from './db/operations.js';
import { Nookwire } from './services/runtime.js';
import { createServerFactory } from './mcp/create-server.js';
/** Bounded pre-auth IP limiter. The process does not persist or log source addresses. */
export class PreAuthLimiter {
    limit;
    capacity;
    buckets = new Map();
    constructor(limit = 240, capacity = 4096) {
        this.limit = limit;
        this.capacity = capacity;
    }
    allow(key, now = Date.now()) {
        const window = Math.floor(now / 60000);
        for (const [k, v] of this.buckets)
            if (v.window !== window)
                this.buckets.delete(k);
        const existing = this.buckets.get(key);
        if (!existing && this.buckets.size >= this.capacity)
            return false;
        const v = existing ?? { window, used: 0 };
        this.buckets.set(key, v);
        v.used++;
        return v.used <= this.limit;
    }
    get size() { return this.buckets.size; }
}
export async function createHttpApp(service, config) {
    const expressName = 'express', expressSdk = '@modelcontextprotocol/express', nodeSdk = '@modelcontextprotocol/node', serverSdk = '@modelcontextprotocol/server';
    const [{ default: express }, { createMcpExpressApp }, { toNodeHandler }, { createMcpHandler }] = await Promise.all([import(expressName), import(expressSdk), import(nodeSdk), import(serverSdk)]);
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy);
    const preauth = new PreAuthLimiter(config.limits.preauth_per_minute, config.limits.preauth_bucket_cap);
    app.use((req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (!preauth.allow(req.ip ?? req.socket.remoteAddress ?? 'unknown'))
            return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Request quota exceeded.', retryable: true, retry_after_ms: 60000 } });
        next();
    });
    // Parse before the SDK app so the explicit 128 KiB cap, not Express's smaller default, applies.
    app.use(express.json({ limit: config.limits.http_bytes, strict: true }));
    const protectedApp = createMcpExpressApp({ host: config.bind, allowedHosts: config.allowedHosts, allowedOrigins: config.allowedOrigins });
    protectedApp.get('/health/live', (_req, res) => res.json({ live: true }));
    protectedApp.get('/health/ready', (_req, res) => {
        try {
            service.r.one('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
            res.json({ ready: true });
        }
        catch {
            res.status(503).json({ ready: false });
        }
    });
    const factory = await createServerFactory(service), handler = toNodeHandler(createMcpHandler(factory));
    protectedApp.all('/mcp', (req, res, next) => { Promise.resolve(handler(req, res, req.body)).catch(next); });
    app.use(protectedApp);
    app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }));
    app.use((error, _req, res, _next) => {
        const tooLarge = error?.type === 'entity.too.large';
        if (res.headersSent)
            return res.end();
        res.status(tooLarge ? 413 : 400).json({ error: { code: tooLarge ? 'LIMIT_EXCEEDED' : 'INVALID_ARGUMENT', message: 'Invalid or oversized HTTP/MCP request.', retryable: false } });
    });
    return app;
}
export async function startServer(config = loadConfig()) {
    const unlock = acquireServiceLock(config.dbPath);
    let repo;
    try {
        repo = openDatabase(config.dbPath, { timeout: config.limits.busy_timeout_ms });
        const service = new Nookwire(repo, undefined, config.limits);
        const app = await createHttpApp(service, config);
        const listener = await new Promise((resolve, reject) => { const server = app.listen(config.port, config.bind, () => resolve(server)); server.once('error', reject); server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000; });
        let stopped = false;
        const close = () => new Promise(resolve => {
            if (stopped) {
                resolve();
                return;
            }
            stopped = true;
            listener.close(() => { repo.db.close(); unlock(); resolve(); });
            listener.closeIdleConnections?.();
            const timer = setTimeout(() => listener.closeAllConnections?.(), 10000);
            timer.unref();
        });
        return { listener, service, close };
    }
    catch (error) {
        repo?.db.close();
        unlock();
        throw error;
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startServer().then(server => {
        process.stdout.write('{"event":"nookwire_started"}\n');
        const stop = () => { void server.close().then(() => { process.stdout.write('{"event":"nookwire_stopped"}\n'); }); };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
    }).catch(() => { process.stderr.write('{"event":"startup_failed","message":"Check local configuration, durable storage, lock ownership and installed dependencies."}\n'); process.exitCode = 1; });
}
//# sourceMappingURL=server.js.map