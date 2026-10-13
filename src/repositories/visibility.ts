/** One fixed-SQL canonical authorization predicate; :agent is never caller-selected. */
export const messageVisibility = (alias = 'm'): string => `(
 (${alias}.channel_kind='dm' AND (${alias}.author_agent_id=? OR ${alias}.dm_recipient_agent_id=?))
 OR (${alias}.channel_kind='room' AND EXISTS (
 SELECT 1 FROM room_memberships vrm WHERE vrm.room_id=${alias}.room_id AND vrm.agent_id=?
 AND vrm.left_at_ms IS NULL AND ${alias}.message_seq>vrm.joined_after_seq)))`;
export const visibilityBindings = (agentId: string): [
    string,
    string,
    string
] => [agentId, agentId, agentId];
export const inboxVisibility = `(
 (m.channel_kind='dm' AND m.dm_recipient_agent_id=i.agent_id AND i.room_id IS NULL AND i.membership_id IS NULL)
 OR (m.channel_kind='room' AND i.room_id=m.room_id AND EXISTS (
 SELECT 1 FROM room_memberships irm WHERE irm.membership_id=i.membership_id
 AND irm.room_id=m.room_id AND irm.agent_id=i.agent_id AND irm.left_at_ms IS NULL
 AND m.message_seq>irm.joined_after_seq)))`;
