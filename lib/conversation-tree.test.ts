import { describe, expect, it } from 'vitest';
import { leafMessageIds, selectedPathMessages } from './conversation-tree';
import type { HostedConversation } from './hosted-types';

const conversation: HostedConversation = {
  id: 'conversation-1',
  title: null,
  model: 'kimi',
  revision: 4,
  message_count: 4,
  selected_path: ['root', 'question', 'answer'],
  messages: [
    {
      id: 'root',
      parent_message_id: null,
      role: 'system',
      content: 'System',
      parts: [],
    },
    {
      id: 'question',
      parent_message_id: 'root',
      role: 'user',
      content: 'Question',
      parts: [],
    },
    {
      id: 'answer',
      parent_message_id: 'question',
      role: 'assistant',
      content: 'Answer',
      parts: [],
    },
    {
      id: 'branch',
      parent_message_id: 'question',
      role: 'assistant',
      content: 'Branch',
      parts: [],
    },
  ],
};

describe('conversation tree rendering', () => {
  it('renders the server-selected path instead of inferring a leaf', () => {
    expect(
      selectedPathMessages(conversation, 'branch').map((message) => message.id),
    ).toEqual(['root', 'question', 'answer']);
  });

  it('finds every canonical leaf for head selection', () => {
    expect(leafMessageIds(conversation)).toEqual(['answer', 'branch']);
  });
});
