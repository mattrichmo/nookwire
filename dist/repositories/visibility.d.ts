/** One fixed-SQL canonical authorization predicate; :agent is never caller-selected. */
export declare const messageVisibility: (alias?: string) => string;
export declare const visibilityBindings: (agentId: string) => [string, string, string];
export declare const inboxVisibility = "(\n (m.channel_kind='dm' AND m.dm_recipient_agent_id=i.agent_id AND i.room_id IS NULL AND i.membership_id IS NULL)\n OR (m.channel_kind='room' AND i.room_id=m.room_id AND EXISTS (\n SELECT 1 FROM room_memberships irm WHERE irm.membership_id=i.membership_id\n AND irm.room_id=m.room_id AND irm.agent_id=i.agent_id AND irm.left_at_ms IS NULL\n AND m.message_seq>irm.joined_after_seq)))";
