import { assertOwner } from '../auth/context.js';
import { issueToken } from '../auth/box-keys.js';
import { validateInput, validateProfile, OWNER_SCHEMAS } from '../validation.js';
import { assertRevision, canonical, sha256, iso, sequence, jsonSafe, bytes } from '../util.js';
import { fail, normalizeError } from '../types.js';
const ownerReads = new Set(['agent.list', 'agent.show', 'key.list', 'session.list', 'profile.show', 'profile.history', 'room.list', 'room.members', 'room.brief.history', 'audit.events', 'audit.stats']);
/** Never exposed as a tool. Constructed only by the CLI, or explicit test fixtures. */
export class OwnerService {
    core;
    context;
    constructor(core, context) {
        this.core = core;
        this.context = context;
        assertOwner(context);
    }
    call(operation, raw) {
        assertOwner(this.context);
        let secret;
        try {
            const p = validateInput(operation, raw, true);
            return this.core.r.immediate(() => {
                const { idempotency_key, ...semantic } = p, hash = sha256(canonical(semantic));
                let result, replayed = false;
                const prior = idempotency_key ? this.core.r.one('SELECT * FROM idempotency_records WHERE actor_scope=\'owner\' AND operation=? AND idempotency_key=?', operation, idempotency_key) : undefined;
                if (prior) {
                    if (prior.payload_sha256 !== hash)
                        fail('IDEMPOTENCY_CONFLICT');
                    result = JSON.parse(prior.result_json);
                    replayed = true;
                }
                else {
                    result = this.route(operation, p);
                    if (result.box_key) {
                        secret = result.box_key;
                        delete result.box_key;
                    }
                    if (idempotency_key) {
                        const safe = jsonSafe(result);
                        if (bytes(safe) > 8192)
                            fail('LIMIT_EXCEEDED');
                        this.core.r.run('INSERT INTO idempotency_records(actor_scope,operation,idempotency_key,payload_sha256,result_json,created_at_ms) VALUES(\'owner\',?,?,?,?,?)', operation, idempotency_key, hash, canonical(safe), this.core.now());
                    }
                }
                this.core.audit(operation, null, 'success', { owner: true, replayed, result_count: result.items?.length ?? 1 });
                return jsonSafe({ ...result, ...(idempotency_key ? { replayed } : {}), ...(operation === 'key.issue' || operation === 'key.replace' ? secret ? { box_key: secret, secret_available: true } : { secret_available: false, notice: 'Secret no longer available. Revoke and issue a new key if its output was lost.' } : {}) });
            });
        }
        catch (error) {
            secret = undefined;
            const safe = normalizeError(error);
            try {
                this.core.r.immediate(() => this.core.audit(Object.hasOwn(OWNER_SCHEMAS, operation) ? operation : 'owner.invalid', null, 'failure', { owner: true, error_code: safe.code }));
            }
            catch { }
            throw safe;
        }
    }
    insertProfile(agent, version, p) {
        p = validateProfile(p);
        this.core.r.run(`INSERT INTO profile_versions(agent_id,version,owner_instructions_md,soul_md,expected_tools_json,deliverables_json,schedules_json,change_note,created_at_ms) VALUES(?,?,?,?,?,?,?,?,?)`, agent, version, p.owner_instructions_md, p.soul_md, canonical(p.expected_tools), canonical(p.deliverables), canonical(p.schedule_definitions), p.change_note, this.core.now());
    }
    issue(agent, p) {
        const core = this.core;
        core.agent(agent, true);
        if (p.expires_at_ms !== undefined && p.expires_at_ms <= core.now())
            fail('INVALID_ARGUMENT');
        const count = core.r.scalar('SELECT COUNT(*) FROM box_keys WHERE agent_id=? AND status=\'active\' AND (expires_at_ms IS NULL OR expires_at_ms>?)', agent, core.now());
        if (count >= BigInt(core.limits.active_keys_per_agent))
            fail('LIMIT_EXCEEDED');
        const keyId = core.id(), token = issueToken(keyId);
        core.r.run('INSERT INTO box_keys(key_id,agent_id,key_hash,label,created_at_ms,expires_at_ms) VALUES(?,?,?,?,?,?)', keyId, agent, sha256(token), p.label ?? '', core.now(), p.expires_at_ms ?? null);
        return { key_id: keyId, agent_id: agent, created_at_ms: core.now(), expires_at_ms: p.expires_at_ms ?? null, box_key: token };
    }
    revoke(key) {
        const core = this.core, existing = core.r.one('SELECT key_id,agent_id FROM box_keys WHERE key_id=?', key);
        if (!existing)
            fail('NOT_FOUND_OR_FORBIDDEN');
        core.r.run('UPDATE box_keys SET status=\'revoked\',revoked_at_ms=? WHERE key_id=? AND status=\'active\'', core.now(), key);
        core.r.run('UPDATE agent_sessions SET closed_at_ms=? WHERE key_id=? AND closed_at_ms IS NULL', core.now(), key);
        return { key_id: key, agent_id: existing.agent_id, status: 'revoked' };
    }
    route(operation, p) {
        const c = this.core, r = c.r, now = c.now();
        switch (operation) {
            case 'agent.create': {
                const id = c.id();
                r.run('INSERT INTO agents(agent_id,display_name,created_at_ms,updated_at_ms) VALUES(?,?,?,?)', id, p.name, now, now);
                r.run('INSERT INTO agent_directory(agent_id,updated_at_ms) VALUES(?,?)', id, now);
                this.insertProfile(id, 1n, p.profile);
                return { agent_id: id, name: p.name, profile_version: '1', listed: false };
            }
            case 'agent.list': {
                const rows = r.all('SELECT agent_id,display_name,status,created_at_ms,last_check_in_at_ms FROM agents WHERE agent_id>? ORDER BY agent_id LIMIT ?', p.after_agent_id ?? '', p.limit + 1), more = rows.length > p.limit;
                return { items: rows.slice(0, p.limit).map(x => ({ ...x, created_at_ms: Number(x.created_at_ms), last_check_in_at_ms: x.last_check_in_at_ms === null ? null : Number(x.last_check_in_at_ms) })), has_more: more, next_agent_id: more ? rows[p.limit - 1].agent_id : null };
            }
            case 'agent.show': {
                const agent = c.agent(p.agent_id);
                return { agent: { agent_id: agent.agent_id, name: agent.display_name, status: agent.status, created_at_ms: Number(agent.created_at_ms), last_check_in_at_ms: agent.last_check_in_at_ms === null ? null : Number(agent.last_check_in_at_ms) }, profile_version: String(c.latestProfile(p.agent_id).version), stored_message_count: Number(r.scalar('SELECT COUNT(*) FROM messages WHERE author_agent_id=?', p.agent_id)), stored_attention_count: Number(r.scalar('SELECT COUNT(*) FROM attention_items WHERE agent_id=?', p.agent_id)) };
            }
            case 'agent.rename':
                c.agent(p.agent_id);
                r.run('UPDATE agents SET display_name=?,updated_at_ms=? WHERE agent_id=?', p.name, now, p.agent_id);
                return { agent_id: p.agent_id, renamed: true };
            case 'agent.status':
                c.agent(p.agent_id);
                r.run('UPDATE agents SET status=?,updated_at_ms=? WHERE agent_id=?', p.status, now, p.agent_id);
                return { agent_id: p.agent_id, status: p.status, keys_are_not_rotated: true, notice: p.status === 'active' ? 'Still-active unexpired keys are usable again.' : 'Disabled until re-enabled. Use key revoke-all for a compromise.' };
            case 'key.issue': return this.issue(p.agent_id, p);
            case 'key.replace': {
                const old = this.revoke(p.key_id);
                return { ...this.issue(old.agent_id, p), replaced_key_id: p.key_id };
            }
            case 'key.revoke': return this.revoke(p.key_id);
            case 'key.revoke-all': {
                c.agent(p.agent_id);
                const keys = r.all('SELECT key_id FROM box_keys WHERE agent_id=? AND status=\'active\'', p.agent_id);
                for (const k of keys)
                    this.revoke(k.key_id);
                return { agent_id: p.agent_id, revoked_count: keys.length };
            }
            case 'key.list':
                c.agent(p.agent_id);
                return { items: r.all('SELECT key_id,agent_id,label,status,created_at_ms,expires_at_ms,last_used_at_ms,revoked_at_ms FROM box_keys WHERE agent_id=? ORDER BY created_at_ms,key_id', p.agent_id).map(x => ({ ...x, created_at_ms: Number(x.created_at_ms), expires_at_ms: x.expires_at_ms === null ? null : Number(x.expires_at_ms), last_used_at_ms: x.last_used_at_ms === null ? null : Number(x.last_used_at_ms), revoked_at_ms: x.revoked_at_ms === null ? null : Number(x.revoked_at_ms), effective_state: x.status === 'revoked' ? 'revoked' : x.expires_at_ms !== null && BigInt(x.expires_at_ms) <= BigInt(now) ? 'expired' : 'active' })) };
            case 'session.list':
                c.agent(p.agent_id);
                return { items: r.all('SELECT session_id,key_id,client_label,client_host,profile_version_seen,created_at_ms,last_primed_at_ms,last_used_at_ms,closed_at_ms FROM agent_sessions WHERE agent_id=? ORDER BY created_at_ms,session_id', p.agent_id).map(x => ({ ...x, created_at_ms: Number(x.created_at_ms), last_primed_at_ms: Number(x.last_primed_at_ms), last_used_at_ms: Number(x.last_used_at_ms), closed_at_ms: x.closed_at_ms === null ? null : Number(x.closed_at_ms), provenance: 'client_label and client_host are self-reported' })) };
            case 'profile.show': {
                c.agent(p.agent_id);
                const row = p.version ? r.one('SELECT * FROM profile_versions WHERE agent_id=? AND version=?', p.agent_id, sequence(p.version)) : c.latestProfile(p.agent_id);
                if (!row)
                    fail('NOT_FOUND_OR_FORBIDDEN');
                return { profile: c.profileDto(row) };
            }
            case 'profile.history': {
                c.agent(p.agent_id);
                const rows = r.all('SELECT * FROM profile_versions WHERE agent_id=? AND version>? ORDER BY version LIMIT ?', p.agent_id, sequence(p.after_version), p.limit + 1);
                return { items: rows.slice(0, p.limit).map(x => c.profileDto(x)), has_more: rows.length > p.limit, next_version: rows.length > p.limit ? String(rows[p.limit - 1].version) : null };
            }
            case 'profile.put': {
                const prior = c.latestProfile(p.agent_id);
                assertRevision(prior.version, p.expected_version);
                const version = BigInt(prior.version) + 1n;
                this.insertProfile(p.agent_id, version, p.profile);
                return { agent_id: p.agent_id, version: String(version), stored_at: iso(now) };
            }
            case 'directory.set': {
                c.agent(p.agent_id);
                const old = r.one('SELECT revision FROM agent_directory WHERE agent_id=?', p.agent_id);
                assertRevision(old.revision, p.expected_revision);
                if (Number(r.run('UPDATE agent_directory SET listed=?,public_role=?,public_summary=?,capabilities_json=?,revision=revision+1,updated_at_ms=? WHERE agent_id=? AND revision=?', p.listed ? 1 : 0, p.public_role, p.public_summary, canonical(p.capabilities), now, p.agent_id, sequence(p.expected_revision)).changes) !== 1)
                    fail('REVISION_CONFLICT');
                return { agent_id: p.agent_id, revision: String(BigInt(old.revision) + 1n), listed: p.listed };
            }
            case 'room.create': {
                if (r.one('SELECT 1 FROM rooms WHERE slug=?', p.slug))
                    fail('INVALID_ARGUMENT');
                const id = c.id();
                r.run('INSERT INTO rooms(room_id,slug,display_name,description,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?)', id, p.slug, p.name, p.description, now, now);
                return { room_id: id, created_at_ms: now };
            }
            case 'room.list': {
                const rows = r.all('SELECT * FROM rooms WHERE room_id>? ORDER BY room_id LIMIT ?', p.after_room_id ?? '', p.limit + 1);
                return { items: rows.slice(0, p.limit), has_more: rows.length > p.limit, next_room_id: rows.length > p.limit ? rows[p.limit - 1].room_id : null };
            }
            case 'room.edit': {
                const old = c.room(p.room_id);
                r.run('UPDATE rooms SET display_name=?,description=?,archived=?,updated_at_ms=? WHERE room_id=?', p.name ?? old.display_name, p.description ?? old.description, p.archived === undefined ? old.archived : p.archived ? 1 : 0, now, p.room_id);
                return { room_id: p.room_id, archived: p.archived ?? !!Number(old.archived), updated_at_ms: now };
            }
            case 'room.add': {
                const room = c.room(p.room_id);
                c.writable(room);
                c.agent(p.agent_id, true);
                const existing = r.one('SELECT * FROM room_memberships WHERE room_id=? AND agent_id=? AND left_at_ms IS NULL', p.room_id, p.agent_id);
                if (existing)
                    return { room_id: p.room_id, agent_id: p.agent_id, membership_id: String(existing.membership_id), joined_after_seq: String(existing.joined_after_seq), already_member: true };
                if (r.scalar('SELECT COUNT(*) FROM room_memberships WHERE room_id=? AND left_at_ms IS NULL', p.room_id) >= BigInt(c.limits.room_members) || r.scalar('SELECT COUNT(*) FROM room_memberships WHERE agent_id=? AND left_at_ms IS NULL', p.agent_id) >= BigInt(c.limits.rooms_per_agent))
                    fail('LIMIT_EXCEEDED');
                const boundary = c.highwater(), insert = r.run('INSERT INTO room_memberships(room_id,agent_id,joined_after_seq,joined_at_ms,follow_mode) VALUES(?,?,?,?,?)', p.room_id, p.agent_id, boundary, now, p.mode);
                return { room_id: p.room_id, agent_id: p.agent_id, membership_id: String(insert.lastInsertRowid), joined_after_seq: String(boundary), already_member: false };
            }
            case 'room.remove': {
                c.room(p.room_id);
                c.agent(p.agent_id);
                const changed = r.run('UPDATE room_memberships SET left_after_seq=?,left_at_ms=? WHERE room_id=? AND agent_id=? AND left_at_ms IS NULL', c.highwater(), now, p.room_id, p.agent_id);
                return { room_id: p.room_id, agent_id: p.agent_id, removed: Number(changed.changes) === 1 };
            }
            case 'room.members': {
                c.room(p.room_id);
                const rows = r.all(`SELECT * FROM room_memberships WHERE room_id=? AND membership_id>? ${p.history ? '' : 'AND left_at_ms IS NULL'} ORDER BY membership_id LIMIT ?`, p.room_id, sequence(p.after_membership_id), p.limit + 1);
                return { items: rows.slice(0, p.limit), has_more: rows.length > p.limit, next_membership_id: rows.length > p.limit ? String(rows[p.limit - 1].membership_id) : null };
            }
            case 'room.brief.put': {
                c.writable(c.room(p.room_id));
                const old = r.scalar('SELECT COALESCE(MAX(revision),0) FROM room_brief_versions WHERE room_id=?', p.room_id);
                assertRevision(old, p.expected_revision);
                r.run('INSERT INTO room_brief_versions(room_id,revision,brief_md,author_kind,created_at_ms) VALUES(?,?,?,\'owner\',?)', p.room_id, old + 1n, p.brief_md, now);
                return { room_id: p.room_id, revision: String(old + 1n), stored_at: iso(now) };
            }
            case 'room.brief.history': {
                c.room(p.room_id);
                const rows = r.all('SELECT * FROM room_brief_versions WHERE room_id=? AND revision>? ORDER BY revision LIMIT ?', p.room_id, sequence(p.after_revision), p.limit + 1);
                return { items: rows.slice(0, p.limit), has_more: rows.length > p.limit, next_revision: rows.length > p.limit ? String(rows[p.limit - 1].revision) : null };
            }
            case 'audit.events': return { items: r.all('SELECT * FROM audit_events WHERE occurred_at_ms>=? AND occurred_at_ms<? AND audit_seq>? AND (? IS NULL OR operation=?) AND (? IS NULL OR agent_id=?) ORDER BY audit_seq LIMIT ?', p.since_ms, p.until_ms, sequence(p.after_audit_seq), p.operation ?? null, p.operation ?? null, p.agent_id ?? null, p.agent_id ?? null, p.limit) };
            case 'audit.stats': {
                const groups = r.all('SELECT operation,outcome,COUNT(*) attempts,SUM(replayed) replays,AVG(duration_ms) mean_duration_ms,SUM(result_count) result_count FROM audit_events WHERE occurred_at_ms>=? AND occurred_at_ms<? GROUP BY operation,outcome ORDER BY operation,outcome', p.since_ms, p.until_ms);
                const totals = r.one('SELECT COUNT(*) attempts,COALESCE(SUM(CASE WHEN outcome=\'success\' THEN 1 ELSE 0 END),0) successes FROM audit_events WHERE occurred_at_ms>=? AND occurred_at_ms<?', p.since_ms, p.until_ms);
                return { groups, success_rate: Number(totals.attempts) ? Number(totals.successes) / Number(totals.attempts) : null, success_rate_definition: 'successful recorded attempts / all recorded attempts; replays are separate counts', stored_messages: Number(r.scalar('SELECT COUNT(*) FROM messages')), attention_rows: Number(r.scalar('SELECT COUNT(*) FROM attention_items')), keys: r.all(`SELECT CASE WHEN status='revoked' THEN 'revoked' WHEN expires_at_ms IS NOT NULL AND expires_at_ms<=? THEN 'expired' ELSE 'active' END effective_state,COUNT(*) n FROM box_keys GROUP BY effective_state`, now) };
            }
            case 'db.maintenance': {
                const before = p.rates_before_ms ?? Math.floor(now / 60000) * 60000 - 60000;
                if (before > Math.floor(now / 60000) * 60000 || p.audit_before_ms > now || p.receipts_before_ms > now)
                    fail('INVALID_ARGUMENT');
                const rates = Number(r.run('DELETE FROM rate_limit_buckets WHERE window_start_ms<?', before).changes);
                const audits = p.audit_before_ms === undefined ? 0 : Number(r.run('DELETE FROM audit_events WHERE occurred_at_ms<?', p.audit_before_ms).changes);
                // Only obsolete receipts: closed sessions or already-ACKed items, never active unread deliveries.
                const receipts = p.receipts_before_ms === undefined ? 0 : Number(r.run(`DELETE FROM session_deliveries WHERE last_returned_at_ms<? AND (EXISTS(SELECT 1 FROM agent_sessions s WHERE s.session_id=session_deliveries.session_id AND s.closed_at_ms IS NOT NULL) OR EXISTS(SELECT 1 FROM attention_items i WHERE i.inbox_seq=session_deliveries.inbox_seq AND i.acked_at_ms IS NOT NULL))`, p.receipts_before_ms).changes);
                return { pruned_rate_buckets: rates, pruned_audit_events: audits, pruned_obsolete_receipts: receipts, domain_history_purged: false };
            }
            default: fail('INVALID_ARGUMENT');
        }
    }
}
export { ownerReads };
//# sourceMappingURL=owner.js.map