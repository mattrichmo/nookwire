import type { Repo } from './open.js';
export declare function migrationFiles(directory?: string): {
    name: string;
    version: number;
    sql: string;
}[];
export declare function migrate(repo: Repo, directory?: string): void;
