/**
 * Account-scoped navigation and session coordinator. Mirrors local Inspector:
 * query -> load saved user -> replay/subscribe -> upsert saved assistant.
 * Only the backend resolves session ownership. Account invalidations never navigate.
 */
import type * as Api from '@/lib/hosted-api';
import type { readSse } from '@/lib/sse';
import type {
  HostedAccountEvent,
  HostedConversation,
  HostedSession,
  HostedToolApproval,
  ReasoningRequest,
  SessionEventRecord,
} from '@/lib/hosted-types';
import {
  displayHead,
  initialState,
  mergeSavedTree,
  projectSessionEvent,
  savedMessageId,
  type HostedUiState,
} from './transcript-state';

export type ClientDependencies = Pick<
  typeof Api,
  | 'createConversation'
  | 'listConversations'
  | 'loadConversation'
  | 'resolveSession'
  | 'queryConversation'
  | 'stopSession'
  | 'loadSession'
  | 'hostedEventsUrl'
  | 'sessionEventsUrl'
> &
  Partial<
    Pick<
      typeof Api,
      | 'bindSessionDevice'
      | 'listSessionToolApprovals'
      | 'approveSessionTool'
      | 'denySessionTool'
    >
  > & { readSse: typeof readSse };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function live(session: HostedSession): boolean {
  return (
    session.status === 'running' || session.status === 'waiting_for_approval'
    || session.status === 'waiting_for_tool'
  );
}
function retry(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, 750);
    signal.addEventListener('abort', done, { once: true });
  });
}

export class HostedConversationClient {
  private state = initialState();
  private listeners = new Set<() => void>();
  private token: string | null = null;
  private running = false;
  // A view generation fences ALL async results, including failures and query replies.
  private view = 0;
  private listVersion = 0;
  private accountCursor: number | null = null;
  private accountStream: AbortController | null = null;
  private sessionStream: AbortController | null = null;
  private sessionCursors = new Map<string, number>();
  private recoveryThrough = new Map<string, number>();
  private queryInFlight = false;
  private sendLocked = false;
  onConversationCreated: (id: string) => void = () => {};
  setRouteListener(listener: (id: string) => void) {
    this.onConversationCreated = listener;
  }

  constructor(private readonly api: ClientDependencies) {}
  getSnapshot = (): HostedUiState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(patch: Partial<HostedUiState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private current(version: number) {
    return this.running && version === this.view;
  }

  /** Token rotation reconnects transport without resetting the conversation or preview. */
  setCredentials(token: string | null) {
    if (this.token === token) return;
    this.token = token;
    this.accountStream?.abort();
    this.sessionStream?.abort();
    if (this.running && token) {
      void this.startAccountStream();
      if (this.state.activeSession && !this.queryInFlight)
        this.attachSession(this.state.activeSession);
    }
  }
  start() {
    this.running = true;
    if (this.token) void this.startAccountStream();
    if (this.state.routeId && this.state.routeStatus === 'loading')
      void this.navigate(this.state.routeId, undefined, true);
    else if (this.state.activeSession)
      this.attachSession(this.state.activeSession);
  }
  dispose() {
    this.running = false;
    this.view++;
    this.listVersion++;
    this.accountStream?.abort();
    this.sessionStream?.abort();
  }

  /** `/` is a draft. `/c/id` never creates a conversation or falls back to `/`. */
  async navigate(id: string | null, head?: string, force = false) {
    if (
      !force &&
      id === this.state.routeId &&
      (this.state.routeStatus === 'ready' ||
        (id === null && this.state.routeStatus === 'new'))
    )
      return;
    const version = ++this.view;
    this.sessionStream?.abort();
    this.queryInFlight = false;
    this.sendLocked = false;
    this.update({
      ...initialState(),
      initialized: this.state.initialized,
      conversations: this.state.conversations,
      routeId: id,
      routeStatus: id ? 'loading' : 'new',
    });
    if (!id || !this.token || !this.running) return;
    try {
      const conversation = await this.api.loadConversation(
        this.token,
        id,
        head ?? null,
      );
      if (!this.current(version)) return;
      const selectedHeadId = head ?? displayHead(conversation);
      this.update({
        activeConversation: conversation,
        selectedHeadId,
        routeStatus: 'ready',
      });
      await this.activateHead(version);
    } catch (error) {
      if (this.current(version))
        this.update({
          error: errorText(error),
          routeStatus: this.state.activeConversation ? 'ready' : 'error',
        });
    }
  }

  /** Resolve via the existing hosted contract; never pick a cached session locally. */
  private async activateHead(version: number) {
    const conversation = this.state.activeConversation;
    const head = this.state.selectedHeadId;
    if (!conversation || !head || this.queryInFlight) return;
    const resolved = await this.api.resolveSession(
      this.token!,
      conversation.id,
      head,
      null,
    );
    if (
      !this.current(version) ||
      this.queryInFlight ||
      this.state.selectedHeadId !== head
    )
      return;
    this.sessionCursors.set(
      resolved.session.id,
      live(resolved.session) ? 0 : resolved.event_cursor,
    );
    this.update({
      activeSession: resolved.session,
      boundDeviceId: resolved.bound_device_id ?? null,
      sending: live(resolved.session),
    });
    if (resolved.session.status === 'waiting_for_approval')
      void this.refreshApprovals(resolved.session.id, version);
    this.attachSession(
      resolved.session,
      live(resolved.session) ? resolved.event_cursor : 0,
    );
  }

  selectHead = async (head: string) => {
    if (this.state.routeId && !this.state.sending)
      await this.navigate(this.state.routeId, head, true);
  };

  /** A synchronous lock covers creation and query, not just the rendered send button. */
  sendMessage = async (text: string, reasoning: ReasoningRequest | null) => {
    if (
      !this.token ||
      !text.trim() ||
      this.sendLocked ||
      this.state.sending ||
      !['new', 'ready'].includes(this.state.routeStatus)
    )
      return;
    this.sendLocked = true;
    this.queryInFlight = true;
    const version = this.view;
    this.sessionStream?.abort();
    this.update({
      sending: true,
      pendingUserText: text.trim(),
      streamingText: '',
      reasoningText: '',
      error: null,
    });
    let accepted = false;
    try {
      let conversation = this.state.activeConversation;
      if (!conversation) {
        const summary = await this.api.createConversation(this.token);
        if (!this.current(version)) return;
        conversation = { ...summary, messages: [], selected_path: null };
        // Adopt before pushing URL: the route effect must not reopen this active turn.
        this.update({
          activeConversation: conversation,
          routeId: summary.id,
          routeStatus: 'ready',
          conversations: [
            summary,
            ...this.state.conversations.filter(
              (item) => item.id !== summary.id,
            ),
          ],
        });
        this.onConversationCreated(summary.id);
      }
      const head = this.state.selectedHeadId;
      const resolved = await this.api.resolveSession(
        this.token!,
        conversation.id,
        head,
        reasoning,
      );
      if (!this.current(version)) return;
      const result = await this.api.queryConversation(
        this.token!,
        conversation.id,
        head,
        text.trim(),
        reasoning,
      );
      if (!this.current(version)) return;
      accepted = true;
      this.update({
        activeSession: result.session,
        boundDeviceId: result.bound_device_id ?? null,
      });
      this.sessionCursors.set(
        result.session.id,
        result.session.id === resolved.session.id ? resolved.event_cursor : 0,
      );
      this.recoveryThrough.delete(result.session.id);
      // Local Inspector also loads the saved user before subscribing. Ordinary
      // hosted queries do not emit input_started (queued inputs do).
      if (!result.queued) {
        const tree = await this.api.loadConversation(
          this.token!,
          conversation.id,
          result.session.current_head_message_id,
        );
        if (!this.current(version)) return;
        this.update({
          activeConversation: mergeSavedTree(
            this.state.activeConversation!,
            tree,
          ),
          selectedHeadId: result.session.current_head_message_id,
          pendingUserText: null,
        });
      }
      this.queryInFlight = false;
      this.attachSession(result.session);
    } catch (error) {
      if (this.current(version)) {
        this.update({ error: errorText(error), sending: accepted });
        // Never repeat an uncertain query POST. A successful query followed by a
        // failed snapshot can still recover via the durable session stream.
        if (accepted && this.state.activeSession)
          this.attachSession(this.state.activeSession);
      }
    } finally {
      if (this.current(version)) {
        this.sendLocked = false;
        this.queryInFlight = false;
      }
    }
  };

  stop = async () => {
    const version = this.view;
    const session = this.state.activeSession;
    if (!this.token || !session || !this.state.sending) return;
    try {
      const stopped = await this.api.stopSession(this.token, session.id);
      if (this.current(version)) this.update({ activeSession: stopped });
    } catch (error) {
      if (this.current(version)) this.update({ error: errorText(error) });
    }
  };

  /** The selected device is a session-level, immutable v1 decision. */
  bindDevice = async (deviceId: string) => {
    const session = this.state.activeSession;
    if (!this.token || !session || this.state.boundDeviceId) return;
    const bind = this.api.bindSessionDevice;
    if (!bind) throw new Error('Device binding is unavailable in this client.');
    const version = this.view;
    await bind(this.token, session.id, deviceId);
    if (!this.current(version)) return;
    const refreshed = await this.api.loadSession(this.token, session.id);
    if (!this.current(version)) return;
    this.update({
      activeSession: refreshed.session,
      boundDeviceId: refreshed.bound_device_id ?? null,
      error: null,
    });
  };

  approveTool = async (approvalId: string) => {
    await this.decideTool(approvalId, true);
  };

  denyTool = async (approvalId: string) => {
    await this.decideTool(approvalId, false);
  };

  private async decideTool(approvalId: string, approved: boolean) {
    const session = this.state.activeSession;
    if (!this.token || !session || this.sendLocked) return;
    const decide = approved
      ? this.api.approveSessionTool
      : this.api.denySessionTool;
    if (!decide) throw new Error('Tool approval is unavailable in this client.');
    this.sendLocked = true;
    const version = this.view;
    try {
      const response = await decide(this.token, session.id, approvalId);
      if (!this.current(version)) return;
      this.update({
        activeSession: response.session,
        boundDeviceId: response.bound_device_id ?? null,
        approvals: this.state.approvals.filter((item) => item.id !== approvalId),
        sending: live(response.session),
        error: null,
      });
      this.attachSession(response.session);
    } catch (error) {
      if (this.current(version)) this.update({ error: errorText(error) });
    } finally {
      if (this.current(version)) this.sendLocked = false;
    }
  }

  private async refreshApprovals(sessionId: string, version = this.view) {
    if (!this.token) return;
    const list = this.api.listSessionToolApprovals;
    if (!list) return;
    try {
      const approvals: HostedToolApproval[] =
        await list(this.token, sessionId);
      if (this.current(version) && this.state.activeSession?.id === sessionId)
        this.update({ approvals });
    } catch (error) {
      if (this.current(version)) this.update({ error: errorText(error) });
    }
  }

  private async refreshList(): Promise<number> {
    const version = ++this.listVersion;
    const snapshot = await this.api.listConversations(this.token!);
    if (this.running && version === this.listVersion)
      this.update({ initialized: true, conversations: snapshot.conversations });
    return snapshot.event_cursor;
  }

  private async startAccountStream() {
    this.accountStream?.abort();
    const controller = new AbortController();
    this.accountStream = controller;
    let transportError: string | null = null;
    while (this.running && !controller.signal.aborted) {
      try {
        if (this.accountCursor === null) {
          const cursor = await this.refreshList();
          if (controller.signal.aborted) return;
          this.accountCursor = cursor;
        }
        await this.api.readSse(
          this.api.hostedEventsUrl(this.accountCursor),
          this.token!,
          controller.signal,
          async (record) => {
            if (controller.signal.aborted) return;
            if (record.event === 'error')
              throw new Error(
                'Conversation synchronization temporarily unavailable. Reconnecting…',
              );
            if (record.id === null || record.id <= this.accountCursor!) return;
            const event = record.data as HostedAccountEvent;
            const version = this.view;
            await this.refreshList();
            if (controller.signal.aborted) return;
            const current = this.state.activeConversation;
            if (
              this.current(version) &&
              current &&
              event.conversation_id === current.id &&
              !this.queryInFlight &&
              (event.conversation_revision ?? 0) > current.revision
            ) {
              const tree = await this.api.loadConversation(
                this.token!,
                current.id,
              );
              if (
                this.current(version) &&
                !this.queryInFlight &&
                !controller.signal.aborted &&
                tree.revision >= this.state.activeConversation!.revision
              ) {
                // Sidebar/account invalidations may merge nodes, never reset a
                // selected session head or clear a running preview.
                const ownsView = this.state.activeSession !== null;
                this.update({
                  activeConversation: { ...tree, selected_path: null },
                  selectedHeadId: ownsView
                    ? this.state.selectedHeadId
                    : displayHead(tree),
                });
                if (!ownsView) await this.activateHead(version);
              }
            }
            // Snapshot cursors must never skip still-undelivered account events.
            this.accountCursor = record.id;
            if (transportError && this.state.error === transportError)
              this.update({ error: null });
            transportError = null;
          },
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          transportError = errorText(error);
          this.update({ error: transportError });
        }
      }
      await retry(controller.signal);
    }
  }

  private attachSession(
    session: HostedSession,
    replayThrough = this.recoveryThrough.get(session.id) ?? 0,
  ) {
    this.sessionStream?.abort();
    const controller = new AbortController();
    this.sessionStream = controller;
    const version = this.view;
    const valid = () => this.current(version) && !controller.signal.aborted;
    // Rebuild a reconnect preview offscreen, so historical events cannot visibly
    // walk the selected head backwards through previous turns.
    let recovering = replayThrough > (this.sessionCursors.get(session.id) ?? 0);
    if (recovering) this.recoveryThrough.set(session.id, replayThrough);
    let savedAheadOfStream = false;
    let transportError: string | null = null;
    void (async () => {
      while (valid()) {
        let replayState = {
          ...this.state,
          streamingText: '',
          reasoningText: '',
        };
        let cursor = this.sessionCursors.get(session.id) ?? 0;
        try {
          await this.api.readSse(
            this.api.sessionEventsUrl(session.id, cursor),
            this.token!,
            controller.signal,
            async (record) => {
              if (!valid()) return;
              if (record.event === 'error')
                throw new Error(
                  'Session stream temporarily unavailable. Reconnecting…',
                );
              if (record.id === null || record.id <= cursor) return;
              const data = record.data as SessionEventRecord;
              if (data.session_id !== session.id || !data.event?.type)
                throw new Error('Invalid session event received.');
              const isDelta =
                data.event.type === 'assistant_delta' ||
                data.event.type === 'reasoning_delta';
              if (
                !recovering &&
                isDelta &&
                !this.state.sending &&
                !savedAheadOfStream
              ) {
                // Ordinary input_started is absent from today's hosted protocol.
                // A second browser learns the new user head from the SERVER when
                // a subscribed idle session starts producing events again.
                const current = await this.api.loadSession(
                  this.token!,
                  session.id,
                );
                const tree = await this.api.loadConversation(
                  this.token!,
                  session.conversation_id,
                  current.session.current_head_message_id,
                );
                if (!valid()) return;
                savedAheadOfStream = !live(current.session);
                this.update({
                  activeConversation: mergeSavedTree(
                    this.state.activeConversation!,
                    tree,
                  ),
                  activeSession: current.session,
                  selectedHeadId: current.session.current_head_message_id,
                  sending: live(current.session),
                  pendingUserText: null,
                  streamingText: '',
                  reasoningText: '',
                });
              }
              const messageId = savedMessageId(data.event);
              let snapshot: HostedConversation | undefined;
              if (messageId) {
                const existing = this.state.activeConversation?.messages.find(
                  (message) => message.id === messageId,
                );
                // Today's hosted SSE carries IDs, unlike local's hydrated events.
                // Hydrate sequentially here, never through a detached UI reload.
                snapshot = existing
                  ? this.state.activeConversation!
                  : await this.api.loadConversation(
                      this.token!,
                      session.conversation_id,
                      messageId,
                    );
              }
              if (!valid()) return;
              if (recovering) {
                replayState = projectSessionEvent(
                  replayState,
                  data.event,
                  snapshot,
                );
                if (record.id >= replayThrough) {
                  recovering = false;
                  this.recoveryThrough.delete(session.id);
                  // A terminal record may have committed between resolve's
                  // session snapshot and event-cursor read. Honor that terminal
                  // only when it belongs to the currently selected turn.
                  const terminalForHead =
                    data.event.type === 'completed' &&
                    data.event.message_id &&
                    (data.event.message_id ===
                      session.current_head_message_id ||
                      snapshot?.messages.find(
                        (message) => message.id === messageId,
                      )?.parent_message_id === session.current_head_message_id);
                  this.update(
                    terminalForHead
                      ? replayState
                      : {
                          streamingText: replayState.streamingText,
                          reasoningText: replayState.reasoningText,
                        },
                  );
                }
              } else if (!(isDelta && savedAheadOfStream)) {
                const projected = projectSessionEvent(
                  this.state,
                  data.event,
                  snapshot,
                );
                this.update(projected);
                if (data.event.type === 'waiting_for_approval')
                  void this.refreshApprovals(session.id, version);
                if (!isDelta) savedAheadOfStream = false;
              }
              // Advance only after reconciliation succeeds. Failed hydration keeps
              // the stream visible and reconnects BEFORE the unprocessed event.
              cursor = record.id;
              // Recovery is staged: rotating a token halfway through can replay
              // from its original cursor without losing hidden partial text.
              if (!recovering) this.sessionCursors.set(session.id, record.id);
              if (transportError && this.state.error === transportError)
                this.update({ error: null });
              transportError = null;
            },
          );
        } catch (error) {
          if (valid()) {
            transportError = errorText(error);
            this.update({ error: transportError });
          }
        }
        await retry(controller.signal);
      }
    })();
  }
}
