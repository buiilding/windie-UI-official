/** Typed browser boundary for the hosted Windie API. */

export type ConversationRole = 'system' | 'user' | 'assistant' | 'tool';

export type HostedConversationSummary = {
  id: string;
  title: string | null;
  model: string;
  revision: number;
  message_count: number;
};

export type HostedMessage = {
  id: string;
  parent_message_id: string | null;
  role: ConversationRole;
  content: string;
  parts: HostedMessagePart[];
  metadata?: HostedMessageMetadata;
};

/** Durable tool linkage used to reconcile an approval/result after reload. */
export type HostedMessageMetadata = {
  tool_call_id?: string;
  tool_calls?: HostedToolCall[];
  reasoning?: string;
};

export type HostedToolCall = {
  id: string;
  index: number;
  name: string;
  arguments: string;
};

export type HostedToolApproval = {
  id: string;
  session_id: string;
  assistant_message_id: string;
  tool_call_id: string;
  tool_name: string;
  arguments_json: string;
  device_id: string;
  reason: string;
};

export type HostedMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; mime_type: string; byte_count: number };

export type HostedConversation = HostedConversationSummary & {
  messages: HostedMessage[];
  selected_path: string[] | null;
};

export type HostedSessionStatus =
  | 'ready'
  | 'running'
  | 'waiting_for_approval'
  | 'waiting_for_tool'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ReasoningRequest = {
  effort?: string;
  summary?: string;
};

export type HostedSession = {
  id: string;
  conversation_id: string;
  start_head_message_id: string | null;
  current_head_message_id: string | null;
  status: HostedSessionStatus;
  model: string;
  reasoning: ReasoningRequest | null;
  error: string | null;
  keep_awake: boolean;
  created_at: number;
  updated_at: number;
};

export type SessionEvent =
  | { type: 'input_queued'; input_id: string; queue_depth: number }
  | { type: 'input_started'; input_id: string; message_id: string }
  | { type: 'wakeup_message_saved'; message_id: string }
  | { type: 'assistant_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | {
      type: 'tool_call_delta';
      index: number;
      id?: string;
      name?: string;
      arguments_delta?: string;
    }
  | { type: 'assistant_attempt_reset' }
  | { type: 'assistant_message_saved'; message_id: string }
  | { type: 'tool_result_saved'; message_id: string }
  | { type: 'waiting_for_approval' }
  | { type: 'waiting_for_tool'; assignment_id: string; device_id: string }
  | { type: 'completed'; message_id: string | null }
  | { type: 'failed'; error: string; causes: string[] }
  | { type: 'cancelled' };

export type SessionEventRecord = {
  id: number;
  session_id: string;
  event: SessionEvent;
  created_at: number;
};

export type HostedAccountEvent = {
  id: number;
  type: string;
  conversation_id: string | null;
  conversation_revision: number | null;
};

export type ConversationListResponse = {
  conversations: HostedConversationSummary[];
  event_cursor: number;
};

export type ConversationResponse = {
  conversation: HostedConversation;
};

export type SessionResponse = {
  session: HostedSession;
  /** Optional while older hosted servers roll forward. */
  bound_device_id?: string | null;
  queue_depth: number;
  event_cursor: number;
};

export type QueryResponse = {
  session: HostedSession;
  /** Optional while older hosted servers roll forward. */
  bound_device_id?: string | null;
  queued: boolean;
  queue_depth: number;
  queue_id: string | null;
};
