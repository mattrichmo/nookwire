import type { Database, Bind, Row } from '../types.js';
export declare class Repo {
    readonly db: Database;
    readonly path: string;
    readonly retries: number;
    constructor(db: Database, path: string, retries?: number);
    one(sql: string, ...values: Bind[]): Row | undefined;
    all(sql: string, ...values: Bind[]): Row[];
    run(sql: string, ...values: Bind[]): {
        changes: number | bigint;
        lastInsertRowid: number | bigint;
    };
    scalar(sql: string, ...values: Bind[]): bigint;
    immediate<T>(action: () => T): T;
}
export declare function configure(db: Database, timeout?: number): void;
export declare function openDatabase(path: string, options?: {
    timeout?: number;
    migrations?: string;
    driver?: (path: string) => Database;
}): Repo;
