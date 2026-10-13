# Deployment examples — not executed

No service, account, domain, production key, database or TLS endpoint was deployed from this archive. Deployment requires a separate explicit owner decision and a selected durable host. Finish exact dependency/native/MCP qualification before exposing the service.

## Persistent VM with systemd

Install the declared Node LTS patch and exact locked packages. Use one non-root `nookwire` OS account, `/opt/nookwire` for read-only application code and a private persistent `/var/lib/nookwire` directory for the SQLite database/WAL/SHM/lock. Select an actual persistent local disk; arbitrary NFS/shared network filesystems are not supported.

Review `deploy/nookwire.service` for the host's real Node path, account and environment file. The sample uses `StateDirectory`, restrictive umask, no new privileges and read-only system paths. It does not auto-restart over a stale database lock. The `.env.example` contains only nonsecret settings; it is not automatically loaded by `node dist/server.js`. Use the service's EnvironmentFile, shell exports or Node's `--env-file` option.

Bind the application to loopback and place TLS in front with the reviewed `deploy/Caddyfile`. Replace the example domain only after the owner selects it and authorizes exposure. The proxy routes only `/mcp`; health/diagnostics remain local. SDK Host/Origin allowlists must include the intended hostname. They accept hostnames, not wildcard public origins. Configure exact additional host origins only after observing the real host's behavior.

Trust no proxy headers by default. When a controlled proxy is used, list only its exact trusted network ranges in `NOOKWIRE_TRUSTED_PROXIES`. Otherwise forwarded headers must not influence the pre-auth rate identity. The sample container proxy/NAT arrangement intentionally leaves trust disabled until tested on that host. A shared proxy IP may therefore share the conservative pre-auth quota.

Do not enable request-body, tool-argument, SDK payload, reverse-proxy debug or generic trace logging. Test actual logs with synthetic credential/body/URL sentinels during qualification. Content-free startup/failure/shutdown events are sufficient. Service-owned output contains no keys; a host provider may retain its own tool traces.

## Non-root container

The Dockerfile uses the selected Node patch, compiles the source and installs the locked native dependency on its build platform. `package-lock.json` is intentionally required; the build fails before dependency qualification rather than guessing an unlocked tree. Image tags are patch-pinned examples, not verified registry digests. Pin a reviewed image digest during supply-chain qualification. No image was pulled or built here.

The compose example publishes only loopback port 8787, uses UID/GID 1000, drops capabilities, has a read-only root filesystem and mounts an **existing** operator-selected directory as `/data`. It refuses Docker's implicit host-directory creation. Create that directory with the appropriate owner and mode, and create an empty `.nookwire-persistent-volume` marker inside it before starting the image. The entrypoint refuses startup without the marker; this catches a missing/incorrect mount rather than silently starting a new ephemeral mailbox. Do not place the marker in the image.

Set `NOOKWIRE_DATA_DIR` to the approved path and `NOOKWIRE_PUBLIC_HOST` to the intended hostname. Keep data/backup/key output outside the repository. Ensure the mounted directory belongs to the configured container UID; do not “fix” this with `chmod 777`. Backups written from the container must go to a separately approved mounted private location, or use the local owner CLI with the production driver against the durable database.

The compose service has no restart policy by default because recovery needs stale-lock inspection. Stop gracefully and verify the lock is released. Crash-recovery tests and the host's process manager need an explicit, measured recovery policy before unattended operation.

## Readiness and shutdown

`/health/live` returns process availability only. `/health/ready` checks database access after migration compatibility was verified at startup; it returns no paths or table data. They are not authorization endpoints.

The service stops accepting connections, closes idle connections, lets in-flight work complete, then closes SQLite and removes its owned lock. A bounded timeout closes lingering HTTP connections. Content transactions contain no `await`; an interrupted HTTP response after a committed send is recoverable through idempotent replay. A hard crash may leave a stale lock; inspect it rather than blindly removing it.

## Release checklist

Run the real native suite and actual SDK HTTP suite with the selected runtime/OS/architecture, review dependency advisories, measure burst/event-loop behavior on the chosen volume, verify consistent backup/restore and compulsory restored-key revocation, inspect actual proxy/SDK logs and host/origin handling, and run the twelve-step ordinary-tab story in the intended ChatGPT and Claude surfaces. Only then record sanitized host evidence and run the fail-closed release gate.

The included offline 100-member burst is a synthetic development measurement, not production throughput or a suitability promise for this deployment.
