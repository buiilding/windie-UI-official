/** Storage-independent browser helpers for rendering a server-owned message tree. */

import type { HostedConversation, HostedMessage } from './hosted-types';

export function leafMessageIds(
  conversation: HostedConversation | null,
): string[] {
  if (!conversation) return [];
  const parents = new Set(
    conversation.messages
      .map((message) => message.parent_message_id)
      .filter((id): id is string => Boolean(id)),
  );
  return conversation.messages
    .filter((message) => !parents.has(message.id))
    .map((message) => message.id);
}

/** Uses the server-selected path when present, otherwise follows canonical parents. */
export function selectedPathMessages(
  conversation: HostedConversation | null,
  selectedHeadId: string | null,
): HostedMessage[] {
  if (!conversation) return [];
  const byId = new Map(
    conversation.messages.map((message) => [message.id, message]),
  );
  const ids =
    conversation.selected_path ??
    (() => {
      if (!selectedHeadId) return [];
      const path: string[] = [];
      const seen = new Set<string>();
      let message = byId.get(selectedHeadId);
      while (message && !seen.has(message.id)) {
        path.push(message.id);
        seen.add(message.id);
        message = message.parent_message_id
          ? byId.get(message.parent_message_id)
          : undefined;
      }
      return path.reverse();
    })();
  return ids
    .map((id) => byId.get(id))
    .filter((message): message is HostedMessage => Boolean(message));
}
