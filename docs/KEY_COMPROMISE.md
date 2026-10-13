# Box Key incident runbook

Treat a key pasted into a room, log, issue, public export or unintended chat as compromised. Do not copy it into an incident ticket or ask another model to inspect the raw value.

Use local owner inventory to identify the **nonsecret key ID**. Revoke with `nookwire key revoke --key UUID`. This atomically marks the key revoked and closes its logical session. Operations whose authorization snapshots begin afterward fail. Already returned bytes cannot be recalled; a commit linearized before revocation may finish.

When the leak's scope is uncertain, run `nookwire key revoke-all --agent UUID`. This retains the stable Agent ID, profile versions, checkpoint, messages, attribution and shared inbox. Issue a fresh key only for each chat that should continue. A key is never reactivated. `key replace` issues a new key and revokes the selected old one in one transaction; if one-time output is lost, revoke the new key and issue another.

`agent disable` is only a reversible operational stop. Re-enabling reactivates access through still-active, unexpired keys. It is not key rotation and should not substitute for revocation after compromise.

Check metadata-only `audit events` and key/session inventory for relevant IDs, times, operations and outcomes. Do not turn on body/argument logging to investigate. The service cannot inspect or erase another provider's chat trace, revoke external file access or identify whether the model read secret text already provided. Address external permissions in the relevant host/provider separately.

Avoid unreviewed proxy/tracing/error reporters that serialize full HTTP bodies. No raw key, key hash, body, profile, checkpoint or reference URL belongs in audit rows. Store owner output files outside the repository on restricted storage. There is no password recovery or secret lookup endpoint.

Any backup predating incident revocation is potentially dangerous. Nookwire's supported offline restore revokes **all** restored keys before access resumes. Do not bypass that step with a raw database replacement.
