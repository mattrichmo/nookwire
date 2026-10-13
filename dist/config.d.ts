export declare const DEFAULT_LIMITS: Readonly<{
    http_bytes: 131072;
    response_bytes: 262144;
    page_bytes: 110000;
    message_body_bytes: 16384;
    payload_bytes: 8192;
    message_total_bytes: 65536;
    files_per_message: 10;
    mentions: 20;
    room_members: 100;
    rooms_per_agent: 100;
    active_keys_per_agent: 50;
    page_default: 20;
    page_max: 50;
    ack_max: 100;
    requests_per_key: 120;
    requests_per_agent: 300;
    writes_per_agent: 30;
    preauth_per_minute: 240;
    preauth_bucket_cap: 4096;
    busy_timeout_ms: 500;
    busy_retries: 2;
}>;
export type Limits = typeof DEFAULT_LIMITS;
export interface Config {
    dbPath: string;
    bind: string;
    port: number;
    allowedHosts: string[];
    allowedOrigins: string[];
    trustProxy: false | string[];
    requireExistingDirectory: boolean;
    limits: {
        -readonly [K in keyof Limits]: number;
    };
}
export declare function loadConfig(env?: NodeJS.ProcessEnv): Config;
