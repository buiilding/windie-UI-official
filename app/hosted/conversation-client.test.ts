import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HostedConversationClient,
  type ClientDependencies,
} from './conversation-client';
import { routeIsVisible, transcriptRows } from './transcript-state';
import type {
  HostedConversation,
  HostedSession,
  SessionEvent,
} from '@/lib/hosted-types';
import type { SseRecord } from '@/lib/sse';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const empty: HostedConversation = {
  id: 'c1',
  title: null,
  model: 'kimi',
  revision: 0,
  message_count: 0,
  messages: [],
  selected_path: null,
};
const user: HostedConversation = {
  ...empty,
  revision: 1,
  message_count: 1,
  selected_path: ['u1'],
  messages: [
    {
      id: 'u1',
      role: 'user',
      parent_message_id: null,
      content: 'Hello',
      parts: [],
    },
  ],
};
const saved: HostedConversation = {
  ...user,
  revision: 2,
  message_count: 2,
  selected_path: ['u1', 'a1'],
  messages: [
    ...user.messages,
    {
      id: 'a1',
      role: 'assistant',
      parent_message_id: 'u1',
      content: 'Hello back',
      parts: [],
    },
  ],
};
const session: HostedSession = {
  id: 's1',
  conversation_id: 'c1',
  start_head_message_id: null,
  current_head_message_id: 'u1',
  status: 'running',
  model: 'kimi',
  reasoning: null,
  error: null,
  keep_awake: false,
  created_at: 0,
  updated_at: 0,
};
const clients: HostedConversationClient[] = [];
afterEach(() => {
  clients.forEach((client) => client.dispose());
  clients.length = 0;
  vi.useRealTimers();
});
async function flush() {
  for (let i = 0; i < 15; i++) await Promise.resolve();
}

/** Fake network retains async callbacks and aborts just like the real ordered SSE reader. */
function harness() {
  const streams: {
    url: string;
    token: string;
    signal: AbortSignal;
    emit: (record: SseRecord) => void | Promise<void>;
  }[] = [];
  const api: ClientDependencies = {
    createConversation: vi.fn(async () => empty),
    listConversations: vi.fn(async () => ({
      conversations: [empty],
      event_cursor: 0,
    })),
    loadConversation: vi.fn(async (_token, _id, head) =>
      head === 'a1' ? saved : head === 'u1' ? user : empty,
    ),
    resolveSession: vi.fn(async () => ({
      session: { ...session, status: 'ready' as const },
      event_cursor: 0,
      queue_depth: 0,
    })),
    queryConversation: vi.fn(async () => ({
      session,
      queued: false,
      queue_depth: 0,
      queue_id: null,
    })),
    stopSession: vi.fn(async () => ({
      ...session,
      status: 'cancelled' as const,
    })),
    loadSession: vi.fn(async () => ({
      session,
      event_cursor: 0,
      queue_depth: 0,
    })),
    hostedEventsUrl: (after) => `account?after=${after}`,
    sessionEventsUrl: (id, after) => `${id}?after=${after}`,
    readSse: vi.fn(
      (url, token, signal, emit) =>
        new Promise<void>((resolve) => {
          streams.push({ url, token, signal, emit });
          if (signal.aborted) resolve();
          else
            signal.addEventListener('abort', () => resolve(), { once: true });
        }),
    ),
  };
  const client = new HostedConversationClient(api);
  clients.push(client);
  client.setCredentials('token');
  client.start();
  const stream = (prefix: string) =>
    streams
      .filter((item) => !item.signal.aborted && item.url.startsWith(prefix))
      .at(-1)!;
  const emit = async (id: number, event: SessionEvent) => {
    await stream('s1').emit({
      id,
      event: event.type,
      data: { id, session_id: 's1', created_at: 0, event },
    });
  };
  return { client, api, stream, streams, emit };
}

describe('route ownership', () => {
  it('root is a draft; direct links stay blank while loading and open only their own tree', async () => {
    const { client, api } = harness();
    expect(routeIsVisible(client.getSnapshot(), null)).toBe(true);
    expect(api.createConversation).not.toHaveBeenCalled();
    const pending = deferred<HostedConversation>();
    vi.mocked(api.loadConversation).mockReturnValueOnce(pending.promise);
    const opening = client.navigate('c1');
    expect(client.getSnapshot().routeStatus).toBe('loading');
    expect(routeIsVisible(client.getSnapshot(), 'c1')).toBe(false);
    expect(routeIsVisible(client.getSnapshot(), null)).toBe(false);
    pending.resolve(saved);
    await opening;
    expect(client.getSnapshot().selectedHeadId).toBe('a1');
    expect(routeIsVisible(client.getSnapshot(), 'c1')).toBe(true);
    expect(api.createConversation).not.toHaveBeenCalled();
  });

  it('a missing or forbidden conversation stays on its route, not New Chat', async () => {
    const { client, api } = harness();
    vi.mocked(api.loadConversation).mockRejectedValueOnce(
      new Error('Conversation not found'),
    );
    await client.navigate('unknown');
    expect(client.getSnapshot()).toMatchObject({
      routeId: 'unknown',
      routeStatus: 'error',
      activeConversation: null,
    });
    expect(routeIsVisible(client.getSnapshot(), null)).toBe(false);
    await client.sendMessage('must not create', null);
    expect(api.createConversation).not.toHaveBeenCalled();
  });

  it('late navigation responses cannot replace a newer route or the New Chat page', async () => {
    const { client, api } = harness();
    const first = deferred<HostedConversation>();
    vi.mocked(api.loadConversation)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ ...empty, id: 'c2' });
    const opening = client.navigate('c1');
    await client.navigate('c2');
    first.resolve(saved);
    await opening;
    expect(client.getSnapshot().activeConversation?.id).toBe('c2');
    await client.navigate(null);
    expect(routeIsVisible(client.getSnapshot(), null)).toBe(true);
    expect(client.getSnapshot().activeConversation).toBeNull();
  });

  it('the first send creates once and URL adoption does not cancel the submitted turn', async () => {
    const { client, api } = harness();
    client.onConversationCreated = (id) => {
      void client.navigate(id);
    };
    await Promise.all([
      client.sendMessage('Hello', null),
      client.sendMessage('double click', null),
    ]);
    expect(api.createConversation).toHaveBeenCalledTimes(1);
    expect(api.queryConversation).toHaveBeenCalledTimes(1);
    expect(client.getSnapshot()).toMatchObject({
      routeId: 'c1',
      selectedHeadId: 'u1',
      pendingUserText: null,
      sending: true,
    });
    expect(
      transcriptRows(client.getSnapshot()).map((row) => row.message.content),
    ).toEqual(['Hello', '']);
  });
});

describe('local-Inspector-style saved message reconciliation', () => {
  it('a second send extends the saved assistant head and preserves both completed replies', async () => {
    const { client, api, emit } = harness();
    await client.sendMessage('Hello', null);
    await emit(1, { type: 'assistant_delta', text: 'Hello bac' });
    await emit(2, { type: 'assistant_message_saved', message_id: 'a1' });
    await emit(3, { type: 'completed', message_id: 'a1' });
    const secondUser: HostedConversation = {
      ...saved,
      revision: 3,
      message_count: 3,
      selected_path: null,
      messages: [
        ...saved.messages,
        {
          id: 'u2',
          parent_message_id: 'a1',
          role: 'user',
          content: 'How are you?',
          parts: [],
        },
      ],
    };
    const secondReply: HostedConversation = {
      ...secondUser,
      revision: 4,
      message_count: 4,
      messages: [
        ...secondUser.messages,
        {
          id: 'a2',
          parent_message_id: 'u2',
          role: 'assistant',
          content: 'Doing well.',
          parts: [],
        },
      ],
    };
    vi.mocked(api.resolveSession).mockResolvedValueOnce({
      session: {
        ...session,
        status: 'completed',
        current_head_message_id: 'a1',
      },
      event_cursor: 3,
      queue_depth: 0,
    });
    vi.mocked(api.queryConversation).mockResolvedValueOnce({
      session: { ...session, current_head_message_id: 'u2' },
      queued: false,
      queue_depth: 0,
      queue_id: null,
    });
    vi.mocked(api.loadConversation)
      .mockResolvedValueOnce(secondUser)
      .mockResolvedValueOnce(secondReply);
    await client.sendMessage('How are you?', null);
    expect(api.queryConversation).toHaveBeenLastCalledWith(
      'token',
      'c1',
      'a1',
      'How are you?',
      null,
    );
    await emit(4, { type: 'assistant_delta', text: 'Doing' });
    const previewKey = transcriptRows(client.getSnapshot()).at(-1)?.key;
    await emit(5, { type: 'assistant_message_saved', message_id: 'a2' });
    await emit(6, { type: 'completed', message_id: 'a2' });
    expect(
      transcriptRows(client.getSnapshot()).map((row) => row.message.content),
    ).toEqual(['Hello', 'Hello back', 'How are you?', 'Doing well.']);
    expect(transcriptRows(client.getSnapshot()).at(-1)?.key).toBe(previewKey);
    expect(client.getSnapshot()).toMatchObject({
      sending: false,
      selectedHeadId: 'a2',
    });
  });

  it('ordinary query shows its user node without waiting for an input_started event', async () => {
    const { client, api, emit } = harness();
    await client.sendMessage('Hello', null);
    expect(api.loadConversation).toHaveBeenCalledWith('token', 'c1', 'u1');
    await emit(1, { type: 'assistant_delta', text: 'Hello bac' });
    const preview = transcriptRows(client.getSnapshot()).at(-1)!;
    await emit(2, { type: 'assistant_message_saved', message_id: 'a1' });
    const final = transcriptRows(client.getSnapshot()).at(-1)!;
    expect(final.key).toBe(preview.key);
    expect(final.message.content).toBe('Hello back');
    await emit(3, { type: 'completed', message_id: 'a1' });
    expect(client.getSnapshot()).toMatchObject({
      selectedHeadId: 'a1',
      sending: false,
      streamingText: '',
    });
    expect(transcriptRows(client.getSnapshot()).at(-1)?.message.content).toBe(
      'Hello back',
    );
  });

  it('an account invalidation cannot replace the assistant head with an older user head', async () => {
    const { client, api, emit, stream } = harness();
    await client.sendMessage('Hello', null);
    await emit(1, { type: 'assistant_delta', text: 'Hello bac' });
    const oldAccountTree = deferred<HostedConversation>();
    vi.mocked(api.loadConversation)
      .mockReturnValueOnce(oldAccountTree.promise)
      .mockResolvedValueOnce(saved);
    const accountUpdate = stream('account').emit({
      id: 1,
      event: 'change',
      data: { conversation_id: 'c1', conversation_revision: 2 },
    });
    await flush();
    await emit(2, { type: 'assistant_message_saved', message_id: 'a1' });
    await emit(3, { type: 'completed', message_id: 'a1' });
    oldAccountTree.resolve(user);
    await accountUpdate;
    expect(client.getSnapshot().selectedHeadId).toBe('a1');
    expect(transcriptRows(client.getSnapshot()).at(-1)?.message.content).toBe(
      'Hello back',
    );
  });

  it('failed saved-message hydration retains preview and retries the same durable event', async () => {
    const { client, api, emit } = harness();
    await client.sendMessage('Hello', null);
    await emit(1, { type: 'assistant_delta', text: 'Hello bac' });
    vi.mocked(api.loadConversation).mockRejectedValueOnce(
      new Error('temporary network failure'),
    );
    await expect(
      emit(2, { type: 'assistant_message_saved', message_id: 'a1' }),
    ).rejects.toThrow('temporary');
    expect(client.getSnapshot().streamingText).toBe('Hello bac');
    await emit(2, { type: 'assistant_message_saved', message_id: 'a1' });
    expect(transcriptRows(client.getSnapshot()).at(-1)?.message.content).toBe(
      'Hello back',
    );
    await emit(1, { type: 'assistant_delta', text: 'duplicate' });
    expect(client.getSnapshot().streamingText).toBe('');
  });

  it('navigation away fences an already-in-flight saved message and late error', async () => {
    const { client, api, emit } = harness();
    await client.sendMessage('Hello', null);
    const pending = deferred<HostedConversation>();
    vi.mocked(api.loadConversation).mockReturnValueOnce(pending.promise);
    const saving = emit(2, {
      type: 'assistant_message_saved',
      message_id: 'a1',
    });
    await client.navigate(null);
    pending.resolve(saved);
    await saving;
    expect(client.getSnapshot()).toMatchObject({
      routeId: null,
      activeConversation: null,
      sending: false,
    });
  });

  it('token refresh preserves preview and resumes after the last applied event', async () => {
    const { client, emit, stream } = harness();
    await client.sendMessage('Hello', null);
    await emit(5, { type: 'assistant_delta', text: 'Hello' });
    client.setCredentials('refreshed-token');
    await flush();
    expect(client.getSnapshot().streamingText).toBe('Hello');
    expect(stream('s1')).toMatchObject({
      url: 's1?after=5',
      token: 'refreshed-token',
    });
    await emit(6, { type: 'assistant_delta', text: ' back' });
    expect(client.getSnapshot().streamingText).toBe('Hello back');
  });

  it('list snapshot cursors cannot skip queued account events on reconnect', async () => {
    const { client, api, stream } = harness();
    await flush();
    vi.mocked(api.listConversations).mockResolvedValueOnce({
      conversations: [empty],
      event_cursor: 99,
    });
    await stream('account').emit({
      id: 1,
      event: 'change',
      data: { conversation_id: 'other', conversation_revision: 1 },
    });
    client.setCredentials('new-token');
    await flush();
    expect(stream('account').url).toBe('account?after=1');
  });

  it('a second browser reads the server user head when an idle session starts streaming', async () => {
    const { client, api, emit } = harness();
    vi.mocked(api.loadConversation).mockResolvedValueOnce(saved);
    vi.mocked(api.resolveSession).mockResolvedValueOnce({
      session: {
        ...session,
        status: 'completed',
        current_head_message_id: 'a1',
      },
      queue_depth: 0,
      event_cursor: 3,
    });
    await client.navigate('c1');
    const nextUser = {
      ...saved,
      revision: 3,
      message_count: 3,
      selected_path: null,
      messages: [
        ...saved.messages,
        {
          id: 'u2',
          role: 'user' as const,
          parent_message_id: 'a1',
          content: 'Second question',
          parts: [],
        },
      ],
    };
    vi.mocked(api.loadSession).mockResolvedValueOnce({
      session: { ...session, current_head_message_id: 'u2' },
      event_cursor: 4,
      queue_depth: 0,
    });
    vi.mocked(api.loadConversation).mockResolvedValueOnce(nextUser);
    await emit(4, { type: 'assistant_delta', text: 'Second reply' });
    expect(api.loadSession).toHaveBeenCalledTimes(1);
    expect(
      transcriptRows(client.getSnapshot()).map((row) => row.message.content),
    ).toEqual(['Hello', 'Hello back', 'Second question', 'Second reply']);
    await emit(5, { type: 'assistant_delta', text: ' continues' });
    expect(api.loadSession).toHaveBeenCalledTimes(1);
  });

  it('reload rebuilds an in-flight preview without displaying historical turns as new streams', async () => {
    const { client, api, emit } = harness();
    vi.mocked(api.loadConversation).mockResolvedValueOnce(user);
    vi.mocked(api.resolveSession).mockResolvedValueOnce({
      session,
      queue_depth: 0,
      event_cursor: 2,
    });
    await client.navigate('c1');
    await emit(1, { type: 'assistant_delta', text: 'Hello ' });
    expect(client.getSnapshot().streamingText).toBe(''); // staged replay, not a duplicate visual stream
    await emit(2, { type: 'assistant_delta', text: 'back' });
    expect(client.getSnapshot()).toMatchObject({
      streamingText: 'Hello back',
      selectedHeadId: 'u1',
      sending: true,
    });
    await emit(3, { type: 'assistant_message_saved', message_id: 'a1' });
    await emit(4, { type: 'completed', message_id: 'a1' });
    expect(transcriptRows(client.getSnapshot()).at(-1)?.message.content).toBe(
      'Hello back',
    );
  });

  it('token rotation halfway through reload replay does not lose hidden deltas', async () => {
    const { client, api, emit, stream } = harness();
    vi.mocked(api.loadConversation).mockResolvedValueOnce(user);
    vi.mocked(api.resolveSession).mockResolvedValueOnce({
      session,
      queue_depth: 0,
      event_cursor: 2,
    });
    await client.navigate('c1');
    await emit(1, { type: 'assistant_delta', text: 'Hello ' });
    client.setCredentials('new-token');
    await flush();
    expect(stream('s1').url).toBe('s1?after=0');
    await emit(1, { type: 'assistant_delta', text: 'Hello ' });
    await emit(2, { type: 'assistant_delta', text: 'back' });
    expect(client.getSnapshot().streamingText).toBe('Hello back');
  });

  it('automatically reconnects before a save whose hydration failed, without losing the preview', async () => {
    vi.useFakeTimers();
    const { client, api } = harness();
    let attempts = 0;
    const urls: string[] = [];
    const originalRead = api.readSse;
    api.readSse = vi.fn(async (url, token, signal, receive) => {
      if (!url.startsWith('s1'))
        return originalRead(url, token, signal, receive);
      urls.push(url);
      attempts++;
      const event = async (id: number, value: SessionEvent) =>
        receive({
          id,
          event: value.type,
          data: { id, session_id: 's1', event: value },
        });
      if (attempts === 1)
        await event(1, { type: 'assistant_delta', text: 'Hello bac' });
      await event(2, { type: 'assistant_message_saved', message_id: 'a1' });
      await event(3, { type: 'completed', message_id: 'a1' });
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    });
    vi.mocked(api.loadConversation)
      .mockResolvedValueOnce(user)
      .mockRejectedValueOnce(new Error('save GET interrupted'))
      .mockResolvedValueOnce(saved);
    await client.sendMessage('Hello', null);
    await flush();
    expect(client.getSnapshot().streamingText).toBe('Hello bac');
    await vi.advanceTimersByTimeAsync(750);
    expect(urls).toEqual(['s1?after=0', 's1?after=1']);
    expect(client.getSnapshot()).toMatchObject({
      sending: false,
      selectedHeadId: 'a1',
      streamingText: '',
    });
    expect(transcriptRows(client.getSnapshot()).at(-1)?.message.content).toBe(
      'Hello back',
    );
  });
});
