import type { Repo } from './open.js';
import type { Database } from '../types.js';
export declare function acquireServiceLock(dbPath: string): () => void;
export declare function hashFile(path: string): Promise<string>;
export declare function verifyRepo(repo: Repo): {
    integrity: string;
    foreign_keys: string;
    invariant_checks: string[];
    schema_version: string;
    migration_checksums: {
        version: string;
        name: any;
        sha256: any;
    }[];
    counts: {
        agents: number;
        messages: number;
        attention_items: number;
        revoked_keys: number;
    };
};
export declare function verifyPath(path: string, driver?: (path: string) => Database): {
    integrity: string;
    foreign_keys: string;
    invariant_checks: string[];
    schema_version: string;
    migration_checksums: {
        version: string;
        name: any;
        sha256: any;
    }[];
    counts: {
        agents: number;
        messages: number;
        attention_items: number;
        revoked_keys: number;
    };
};
export declare function backupDatabase(repo: Repo, destination: string): Promise<{
    format: string;
    created_at: string;
    sha256: string;
    schema_version: string;
    migration_checksums: {
        version: string;
        name: any;
        sha256: any;
    }[];
    revocation_warning: string;
}>;
export declare function restoreDatabase(source: string, destination: string, driver?: (path: string) => Database): Promise<{
    restored: boolean;
    all_restored_keys_revoked: boolean;
    newly_revoked_keys: number;
    pre_restore_backup: string | null;
    verification: {
        integrity: string;
        foreign_keys: string;
        invariant_checks: string[];
        schema_version: string;
        migration_checksums: {
            version: string;
            name: any;
            sha256: any;
        }[];
        counts: {
            agents: number;
            messages: number;
            attention_items: number;
            revoked_keys: number;
        };
    };
}>;
