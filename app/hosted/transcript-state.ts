/** Canonical messages and transient previews, following local Inspector's projection boundary. */
import { leafMessageIds, selectedPathMessages } from '@/lib/conversation-tree';
import type {
  HostedConversation,
  HostedConversationSummary,
  HostedMessage,
  HostedSession,
  HostedToolApproval,
  SessionEvent,
} from '@/lib/hosted-types';

export type HostedUiState = {
  initialized: boolean;
  routeId: string | null;
  routeStatus: 'new' | 'loading' | 'ready' | 'error';
  conversations: HostedConversationSummary[];
  activeConversation: HostedConversation | null;
  selectedHeadId: string | null;
  activeSession: HostedSession | null;
  boundDeviceId: string | null;
  approvals: HostedToolApproval[];
  pendingUserText: string | null;
  streamingText: string;
  reasoningText: string;
  sending: boolean;
  error: string | null;
};

export function initialState(): HostedUiState {
  return {
    initialized: false,
    routeId: null,
    routeStatus: 'new',
    conversations: [],
    activeConversation: null,
    selectedHeadId: null,
    activeSession: null,
    boundDeviceId: null,
    approvals: [],
    pendingUserText: null,
    streamingText: '',
    reasoningText: '',
    sending: false,
    error: null,
  };
}

/** A unique leaf is a display default, never a client-side session-ownership decision. */
export function displayHead(conversation: HostedConversation): string | null {
  const selected = conversation.selected_path?.at(-1);
  if (selected) return selected;
  const leaves = leafMessageIds(conversation);
  return leaves.length === 1 ? leaves[0] : null;
}

/** Hide mismatched routes immediately, even before React's navigation effect. */
export function routeIsVisible(
  state: HostedUiState,
  requestedId: string | null,
): boolean {
  return (
    requestedId === state.routeId &&
    (requestedId === null
      ? state.routeStatus === 'new'
      : state.routeStatus === 'ready' &&
        state.activeConversation?.id === requestedId)
  );
}

/** Upsert saved nodes; invalidate selected_path when moving the selected head. */
export function mergeSavedTree(
  current: HostedConversation,
  snapshot: HostedConversation,
): HostedConversation {
  const messages = new Map(
    current.messages.map((message) => [message.id, message]),
  );
  for (const message of snapshot.messages) {
    if (snapshot.revision >= current.revision || !messages.has(message.id))
      messages.set(message.id, message);
  }
  return {
    ...current,
    ...(snapshot.revision >= current.revision ? snapshot : {}),
    revision: Math.max(current.revision, snapshot.revision),
    messages: [...messages.values()],
    message_count: messages.size,
    selected_path: null,
  };
}

export function savedMessageId(event: SessionEvent): string | null {
  return 'message_id' in event ? event.message_id : null;
}

/** Saved events atomically promote previews; terminal events never remove saved nodes. */
export function projectSessionEvent(
  state: HostedUiState,
  event: SessionEvent,
  snapshot?: HostedConversation,
): HostedUiState {
  const messageId = savedMessageId(event);
  let next = state;
  if (messageId && snapshot && state.activeConversation) {
    const message = snapshot.messages.find((item) => item.id === messageId);
    if (!message)
      throw new Error(
        `Saved message ${messageId} is missing from the server snapshot.`,
      );
    next = {
      ...state,
      activeConversation: mergeSavedTree(state.activeConversation, snapshot),
      selectedHeadId: messageId,
      pendingUserText: null,
      activeSession: state.activeSession
        ? { ...state.activeSession, current_head_message_id: messageId }
        : null,
    };
    if (message.role === 'assistant')
      next = { ...next, streamingText: '', reasoningText: '' };
  }
  switch (event.type) {
    case 'assistant_delta':
      return {
        ...next,
        sending: true,
        streamingText: next.streamingText + event.text,
        activeSession: next.activeSession
          ? { ...next.activeSession, status: 'running' }
          : null,
      };
    case 'reasoning_delta':
      return {
        ...next,
        sending: true,
        reasoningText: next.reasoningText + event.text,
        activeSession: next.activeSession
          ? { ...next.activeSession, status: 'running' }
          : null,
      };
    case 'assistant_attempt_reset':
      return { ...next, streamingText: '', reasoningText: '' };
    case 'input_started':
    case 'wakeup_message_saved':
      return { ...next, sending: true, streamingText: '', reasoningText: '' };
    case 'failed':
      return {
        ...next,
        sending: false,
        pendingUserText: null,
        error: event.error,
        activeSession: next.activeSession
          ? { ...next.activeSession, status: 'failed', error: event.error }
          : null,
      };
    case 'completed':
    case 'cancelled':
    case 'waiting_for_approval':
    case 'waiting_for_tool':
      return {
        ...next,
        sending: false,
        pendingUserText: null,
        activeSession: next.activeSession
          ? {
              ...next.activeSession,
              status: event.type,
              current_head_message_id: messageId ?? next.selectedHeadId,
            }
          : null,
      };
    default:
      return next;
  }
}

/** A preview and its saved assistant share a key/component, so promotion does not remount. */
export function assistantRowKey(parentId: string | null): string {
  return `assistant-after:${parentId ?? 'root'}`;
}

/** One keyed list keeps a streamed assistant mounted when its saved node arrives. */
export function transcriptRows(
  state: HostedUiState,
): { key: string; message: HostedMessage; streaming: boolean }[] {
  const path = selectedPathMessages(
    state.activeConversation,
    state.selectedHeadId,
  );
  const rows = path.map((message) => ({
    message,
    streaming: false,
    key:
      message.role === 'assistant'
        ? assistantRowKey(message.parent_message_id)
        : message.id,
  }));
  if (state.pendingUserText)
    rows.push({
      key: 'pending-user',
      streaming: false,
      message: {
        id: 'pending-user',
        role: 'user',
        content: state.pendingUserText,
        parent_message_id: state.selectedHeadId,
        parts: [],
      },
    });
  if (
    (state.sending || state.streamingText) &&
    (path.at(-1)?.role !== 'assistant' ||
      state.streamingText ||
      state.pendingUserText)
  ) {
    rows.push({
      key: assistantRowKey(state.selectedHeadId),
      streaming: state.sending,
      message: {
        id: 'pending-assistant',
        role: 'assistant',
        content: state.streamingText,
        parent_message_id: state.selectedHeadId,
        parts: [],
      },
    });
  }
  return rows;
}
