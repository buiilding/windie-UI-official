/** Authenticated requests to the hosted Windie API. */

import type {
  ConversationListResponse,
  ConversationResponse,
  HostedConversation,
  HostedConversationSummary,
  HostedSession,
  HostedToolApproval,
  QueryResponse,
  ReasoningRequest,
  SessionResponse,
} from './hosted-types';

const configuredApiUrl = import.meta.env.VITE_WINDIE_API_URL;

function apiBase(): string {
  if (!configuredApiUrl) {
    throw new Error('Windie hosted API is not configured.');
  }
  const url =
    configuredApiUrl.startsWith('/') && !configuredApiUrl.startsWith('//')
      ? new URL(configuredApiUrl, window.location.origin)
      : new URL(configuredApiUrl);
  if (
    url.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(url.hostname)
  ) {
    throw new Error('Windie hosted API must use HTTPS.');
  }
  return url.toString().replace(/\/$/, '');
}

export function hostedApiConfigured(): boolean {
  try {
    apiBase();
    return true;
  } catch {
    return false;
  }
}

export class HostedApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HostedApiError';
    this.status = status;
  }
}

function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export async function request<T>(
  accessToken: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { headers, ...init } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Authorization', `Bearer ${accessToken}`);
  requestHeaders.set('Content-Type', 'application/json');
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: requestHeaders,
    redirect: 'error',
  });
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? String(body.message)
        : typeof body === 'object' && body !== null && 'error' in body
          ? String(body.error)
          : `Windie API request failed: ${response.status}`;
    throw new HostedApiError(message, response.status);
  }
  return body as T;
}

export function hostedEventsUrl(after: number): string {
  return `${apiBase()}/v1/events?after=${encodeURIComponent(String(after))}`;
}

export function sessionEventsUrl(sessionId: string, after: number): string {
  return `${apiBase()}/v1/sessions/${encodeURIComponent(sessionId)}/events?after=${encodeURIComponent(String(after))}`;
}

export async function listConversations(
  accessToken: string,
): Promise<ConversationListResponse> {
  return request<ConversationListResponse>(accessToken, '/v1/conversations');
}

export async function loadConversation(
  accessToken: string,
  conversationId: string,
  selectedHeadId: string | null = null,
): Promise<HostedConversation> {
  const query = selectedHeadId
    ? `?head=${encodeURIComponent(selectedHeadId)}`
    : '';
  const response = await request<ConversationResponse>(
    accessToken,
    `/v1/conversations/${encodeURIComponent(conversationId)}${query}`,
  );
  return response.conversation;
}

export async function createConversation(
  accessToken: string,
): Promise<HostedConversationSummary> {
  // Creation is a mutation, so the hosted API deliberately returns its compact
  // sidebar summary. Load the full canonical tree separately before rendering.
  const response = await request<{ conversation: HostedConversationSummary }>(
    accessToken,
    '/v1/conversations',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey() },
      body: JSON.stringify({}),
    },
  );
  return response.conversation;
}

export async function resolveSession(
  accessToken: string,
  conversationId: string,
  headMessageId: string | null,
  reasoning: ReasoningRequest | null,
): Promise<SessionResponse> {
  return request<SessionResponse>(
    accessToken,
    `/v1/conversations/${encodeURIComponent(conversationId)}/sessions/resolve`,
    {
      method: 'POST',
      body: JSON.stringify({ head_message_id: headMessageId, reasoning }),
    },
  );
}

export async function queryConversation(
  accessToken: string,
  conversationId: string,
  headMessageId: string | null,
  text: string,
  reasoning: ReasoningRequest | null,
): Promise<QueryResponse> {
  return request<QueryResponse>(
    accessToken,
    `/v1/conversations/${encodeURIComponent(conversationId)}/query`,
    {
      method: 'POST',
      body: JSON.stringify({ head_message_id: headMessageId, text, reasoning }),
    },
  );
}

export async function stopSession(
  accessToken: string,
  sessionId: string,
): Promise<HostedSession> {
  const response = await request<SessionResponse>(
    accessToken,
    `/v1/sessions/${encodeURIComponent(sessionId)}/stop`,
    { method: 'POST' },
  );
  return response.session;
}

/** Binds a session only after the browser explicitly chooses an owned online Mac. */
export async function bindSessionDevice(
  accessToken: string,
  sessionId: string,
  deviceId: string,
): Promise<void> {
  await request<null>(
    accessToken,
    `/v1/sessions/${encodeURIComponent(sessionId)}/device`,
    { method: 'POST', body: JSON.stringify({ device_id: deviceId }) },
  );
}

export async function listSessionToolApprovals(
  accessToken: string,
  sessionId: string,
): Promise<HostedToolApproval[]> {
  const response = await request<{ approvals: HostedToolApproval[] }>(
    accessToken,
    `/v1/sessions/${encodeURIComponent(sessionId)}/approvals`,
  );
  return response.approvals;
}

export async function approveSessionTool(
  accessToken: string,
  sessionId: string,
  approvalId: string,
): Promise<SessionResponse> {
  return request<SessionResponse>(
    accessToken,
    `/v1/sessions/${encodeURIComponent(sessionId)}/approvals/${encodeURIComponent(approvalId)}/approve`,
    { method: 'POST' },
  );
}

export async function denySessionTool(
  accessToken: string,
  sessionId: string,
  approvalId: string,
): Promise<SessionResponse> {
  return request<SessionResponse>(
    accessToken,
    `/v1/sessions/${encodeURIComponent(sessionId)}/approvals/${encodeURIComponent(approvalId)}/deny`,
    { method: 'POST' },
  );
}

/** Read the backend-owned execution head, including turns started in another browser. */
export async function loadSession(
  accessToken: string,
  sessionId: string,
): Promise<SessionResponse> {
  return request<SessionResponse>(
    accessToken,
    `/v1/sessions/${encodeURIComponent(sessionId)}`,
  );
}
