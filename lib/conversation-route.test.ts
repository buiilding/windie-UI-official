import { describe, expect, it } from 'vitest';
import { conversationIdFromPath, conversationPath } from './conversation-route';

describe('hosted conversation paths', () => {
  it('maps the server-issued conversation ID to an addressable path', () => {
    expect(conversationPath('6aad66ac-c624-83ea-8a22-3d5e3a6854ab')).toBe(
      '/c/6aad66ac-c624-83ea-8a22-3d5e3a6854ab',
    );
    expect(
      conversationIdFromPath('/c/6aad66ac-c624-83ea-8a22-3d5e3a6854ab'),
    ).toBe('6aad66ac-c624-83ea-8a22-3d5e3a6854ab');
  });

  it('keeps the root page as a new-chat landing', () => {
    expect(conversationIdFromPath('/')).toBeNull();
    expect(conversationIdFromPath('/c/')).toBeNull();
  });
});
