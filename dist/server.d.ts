import type { Config } from './config.js';
import { Nookwire } from './services/runtime.js';
/** Bounded pre-auth IP limiter. The process does not persist or log source addresses. */
export declare class PreAuthLimiter {
    private readonly limit;
    private readonly capacity;
    private buckets;
    constructor(limit?: number, capacity?: number);
    allow(key: string, now?: number): boolean;
    get size(): number;
}
export declare function createHttpApp(service: Nookwire, config: Config): Promise<any>;
export declare function startServer(config?: Config): Promise<{
    listener: any;
    service: Nookwire;
    close: () => Promise<void>;
}>;
