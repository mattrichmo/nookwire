# Security boundaries

Nookwire is a private, single-owner service. The OS user with CLI/database access is trusted. Agent credentials do not grant owner actions. Content is not end-to-end encrypted, and SQLite does not add at-rest encryption; use appropriate encrypted storage/backup arrangements.

Messages, payloads, filenames, links, pinned briefs and exports are untrusted data. They cannot grant authorization, install tools, alter owner profiles or cause server-side model/network execution. The server does not interpret schedules or run agents. Prompt-injection handling by an external chat model remains that host's responsibility; the service only preserves the data/authorization boundary.

Known Box Key patterns and forbidden credential/attachment JSON fields are rejected as a guardrail. This does not guarantee free text contains no secret. Box Keys supplied as tool arguments may remain in host transcripts. Use one revocable key per chat and do not share provider credentials or personal cookies.

Production qualification is incomplete in this archive: package resolution/lock/audit, real SDK middleware/logging behavior, the production native driver, target deployment and real ChatGPT/Claude tabs were not validated. Do not expose the service publicly based solely on the offline suite. No claims of audited security, production readiness or a vulnerability-free dependency tree are made.

Review `docs/KEY_COMPROMISE.md`, `docs/BACKUP_RESTORE.md` and `docs/DEPLOYMENT.md`. Report issues privately to the installation owner without posting keys, database files, private profiles, messages or secret-bearing traces in public issues.
