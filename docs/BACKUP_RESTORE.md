# Backup and offline restore runbook

## Backup

The approved owner can create a new local destination with `nookwire db backup --destination /private/backups/unique.sqlite`. The parent must already exist and be owner-only. An existing database or manifest path is never overwritten. Production uses `better-sqlite3`'s consistent backup API, not a copy of the live main file while WAL writes exist.

The separate `.manifest.json` records format, creation UTC time, database SHA-256, schema version, migration checksums and a credential-revocation warning. Files are mode `0600`; parent directory permissions, encrypted storage, off-site replication and storage retention are the owner's responsibility. Neither database nor manifest should be committed to a repository.

Verify with `nookwire db verify --file /private/backups/unique.sqlite`. It checks integrity, FKs, known migration history and ten fixture-free message/attribution/epoch/report invariants. Verification performs no message send or model action. Production qualification must test the **real native driver's** backup/restore behavior on the chosen filesystem. Included offline test evidence uses a different explicit SQLite backup mechanism and is not proof of the native API.

## Restore safely

1. Stop the Nookwire service and every owner CLI writer. Do not start another writer during restore. Keep external traffic disabled.
2. Verify the source backup/manifest and their permissions. The backup must be a different path from the destination.
3. Run `nookwire db restore --file /private/backups/unique.sqlite` with `NOOKWIRE_DB` pointing to the stopped service's destination. The command takes the same exclusive service lock; it refuses while the supported server holds it.
4. Restore first copies into a separate random staging file. It verifies SHA-256, integrity, FKs and migration compatibility; it preserves an existing destination through a consistent, separately manifested pre-restore backup.
5. **All restored active Box Keys are revoked and all open sessions closed in the staging database before replacement.** This is compulsory. A backup older than a revocation must never silently reauthorize a stolen key.
6. The staged database is verified, fsynced and renamed into place. Old WAL/SHM sidecars are removed only after the old destination's consistent pre-restore backup is created. The result reports the pre-restore backup path and post-restore verification.
7. Verify counts/IDs and inspect local agent/key inventory before reopening traffic. Issue fresh keys per intended chat and revoke any mistakenly issued keys whose one-time output was lost.
8. Restart the service. Prime with new keys and start fresh unread scans. Profile/checkpoint versions, canonical mail, shared ACK state and mutation receipts remain as of the backup; key/session credentials do not remain active.

The restore command is intentionally conservative and does not expose an override that preserves old active keys. Restoring an older snapshot also restores older content/read state; the command cannot reconstruct post-backup messages or ACKs.

## Stale locks and failures

A crash may leave `<db>.service-lock`. Read its nonsecret PID/time locally, then independently verify no Nookwire server, restore process or owner writer uses the database. Do **not** delete a lock based solely on a stale PID or restart policy. Remove a genuinely stale lock manually while the service remains stopped.

A checksum mismatch, corruption, incompatible migration, symlink target, occupied lock or inaccessible destination fails closed. Do not rename raw database files over the live service. Retain the original and pre-restore backup until the restored installation is inspected. The offline lock coordinates this application, not arbitrary programs run by the trusted OS owner.

## Evidence supplied versus outstanding

The local tests exercise manifested backup verification, corruption rejection, stopped-service locking, pre-restore preservation, cross-path restore, data/revision/ACK/receipt preservation and compulsory revocation. They use real temporary disk databases with the isolated test adapter. Native `better-sqlite3` backup API, actual production mount durability under power loss, backup encryption and target-host reconnect behavior remain unqualified.
