'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Bell,
  ChevronLeft,
  Monitor,
  UsersRound,
  DiamondPlus,
  Search,
  PanelLeft,
  PanelRight,
  Plus,
  AudioLines,
  Gift,
  ClipboardCheck,
  Globe2,
  Files,
  MessageCircle,
  Bot,
  ArrowUp,
  Copy,
  Ellipsis,
  GitBranch,
  LoaderCircle,
  RotateCcw,
  Share,
  Square,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { Sidebar, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { leafMessageIds, selectedPathMessages } from '@/lib/conversation-tree';
import {
  conversationIdFromPath,
  conversationPath,
} from '@/lib/conversation-route';
import { hostedApiConfigured } from '@/lib/hosted-api';
import { useHostedAuth } from '@/lib/hosted-auth';
import { deviceRoute } from '@/lib/device-route';
import { listDevices, type Device } from '@/lib/device-api';
import { DevicesScreen } from './hosted/devices-screen';
import type { HostedMessage, ReasoningRequest } from '@/lib/hosted-types';
import { useHostedWindie } from './hosted/use-hosted-windie';
import { AuthLayout, SignInPanel } from './hosted/auth-screen';
import { routeIsVisible, transcriptRows } from './hosted/transcript-state';

const RIGHT_PANEL_MIN_WIDTH = 242;
const RIGHT_PANEL_MAX_WIDTH = 1100;
type DockView = 'tools' | 'graph';
type GraphNode = { id: string; role: HostedMessage['role']; preview: string };

function BranchAffordance() {
  return (
    <button
      className="branch-affordance"
      disabled
      title="Branching is not available yet"
    >
      <GitBranch />
      <span>Branch</span>
    </button>
  );
}
function AssistantActions() {
  return (
    <div
      className="message-actions is-visible"
      aria-label="Assistant message actions"
    >
      <button disabled aria-label="Copy response">
        <Copy />
      </button>
      <button disabled aria-label="Good response">
        <ThumbsUp />
      </button>
      <button disabled aria-label="Bad response">
        <ThumbsDown />
      </button>
      <button disabled aria-label="Share response">
        <Share />
      </button>
      <button disabled aria-label="Regenerate response">
        <RotateCcw />
      </button>
      <button disabled aria-label="More response actions">
        <Ellipsis />
      </button>
    </div>
  );
}

function TranscriptMessage({
  message,
  streaming = false,
}: {
  message: HostedMessage;
  streaming?: boolean;
}) {
  if (message.role === 'user')
    return (
      <article
        className="message-row user-message"
        data-message-id={message.id}
        data-message-role="user"
      >
        <div className="message-bubble">{message.content}</div>
        <BranchAffordance />
      </article>
    );
  if (message.role === 'assistant')
    return (
      <article
        className="message-row assistant-message"
        data-message-id={message.id}
        data-message-role="assistant"
      >
        {message.content ? (
          <p className="assistant-copy">
            {message.content}
            {streaming && <span className="stream-caret" />}
          </p>
        ) : streaming ? (
          <p className="thinking-status">
            <LoaderCircle /> Thinking
          </p>
        ) : null}
        {!streaming && <AssistantActions />}
      </article>
    );
  return (
    <article
      className="message-row assistant-message"
      data-message-id={message.id}
      data-message-role={message.role}
    >
      <p className="turn-status">{message.content}</p>
    </article>
  );
}
function GraphDock({
  nodes,
  selectedNodeId,
  onSelectNode,
  onBack,
  onOpenMessage,
}: {
  nodes: GraphNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onBack: () => void;
  onOpenMessage: (node: GraphNode) => void;
}) {
  const selected =
    nodes.find((node) => node.id === selectedNodeId) ?? nodes.at(-1) ?? null;
  return (
    <section className="graph-dock" aria-label="Conversation graph">
      <header className="graph-dock-header">
        <button className="graph-back" onClick={onBack}>
          <ChevronLeft />
          <span>Tools</span>
        </button>
        <span className="graph-title">
          <GitBranch />
          Graph
        </span>
      </header>
      {nodes.length === 0 ? (
        <div className="graph-empty">
          <GitBranch />
          <strong>Nothing to map yet</strong>
          <span>Send a message to start this conversation’s graph.</span>
        </div>
      ) : (
        <>
          <div className="graph-canvas" aria-label="Selected conversation path">
            <p className="graph-path-label">Selected path</p>
            <div className="graph-tree">
              {nodes.map((node, index) => (
                <div className="graph-tree-row" key={node.id}>
                  {index > 0 && (
                    <span className="graph-edge" aria-hidden="true" />
                  )}
                  <button
                    className={`graph-node is-on-path ${node.id === selected?.id ? 'is-selected' : ''}`}
                    onClick={() => onSelectNode(node.id)}
                    aria-pressed={node.id === selected?.id}
                  >
                    <span className="graph-node-role">
                      {node.role === 'user' ? 'You' : 'Windie'}
                    </span>
                    <span className="graph-node-preview">{node.preview}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
          {selected && (
            <section
              className="graph-inspector"
              aria-label="Selected graph node"
            >
              <p className="graph-inspector-label">Selected message</p>
              <p className="graph-inspector-preview">{selected.preview}</p>
              <div className="graph-actions">
                <button onClick={() => onOpenMessage(selected)}>
                  Open this message
                </button>
                <button disabled title="Branching is not available yet">
                  Branch from here
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}

function ChatScreen({
  accessToken,
  email,
  onSignOut,
}: {
  accessToken: string;
  email: string | null;
  onSignOut: () => void;
}) {
  const { open, toggleSidebar } = useSidebar();
  const [requestedConversationId, setRequestedConversationId] = useState(() =>
    conversationIdFromPath(window.location.pathname),
  );
  const navigateToConversation = useCallback((conversationId: string) => {
    window.history.pushState({}, '', conversationPath(conversationId));
    setRequestedConversationId(conversationId);
  }, []);
  const navigateToNewChat = useCallback(() => {
    window.history.pushState({}, '', '/');
    setRequestedConversationId(null);
  }, []);
  useEffect(() => {
    const onPopState = () =>
      setRequestedConversationId(
        conversationIdFromPath(window.location.pathname),
      );
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const hosted = useHostedWindie(
    accessToken,
    requestedConversationId,
    navigateToConversation,
  );
  const { state } = hosted;
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const viewVisible = routeIsVisible(state, requestedConversationId);
  const [draft, setDraft] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState<string | null>('High');
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [dockView, setDockView] = useState<DockView>('tools');
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(
    null,
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_MIN_WIDTH);
  const [isResizingRightPanel, setIsResizingRightPanel] = useState(false);
  const resize = useRef<{ startX: number; startWidth: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathMessages = useMemo(
    () => selectedPathMessages(state.activeConversation, state.selectedHeadId),
    [state.activeConversation, state.selectedHeadId],
  );
  const transcriptStarted =
    requestedConversationId !== null ||
    pathMessages.length > 0 ||
    Boolean(state.pendingUserText) ||
    state.sending;
  const branchHeads =
    state.selectedHeadId === null
      ? leafMessageIds(state.activeConversation)
      : [];
  const needsHead = branchHeads.length > 1;
  const graphNodes = useMemo<GraphNode[]>(
    () =>
      pathMessages.map((message) => ({
        id: message.id,
        role: message.role,
        preview:
          message.content ||
          (message.role === 'assistant' ? 'Thinking…' : 'Message'),
      })),
    [pathMessages],
  );
  const activeGraphNodeId = graphNodes.some(
    (node) => node.id === selectedGraphNodeId,
  )
    ? selectedGraphNodeId
    : (graphNodes.at(-1)?.id ?? null);
  const conversations = state.conversations.filter((conversation) =>
    (conversation.title ?? 'New conversation')
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const isMultiline = draft.includes('\n');
  const eligibleDevices = devices.filter(
    (device) => device.online && !device.revoked,
  );
  const boundDevice = devices.find(
    (device) => device.id === state.boundDeviceId,
  );
  const submit = () => {
    const text = draft.trim();
    if (!text || state.sending || !viewVisible || needsHead) return;
    setDraft('');
    const reasoning: ReasoningRequest = {
      effort: reasoningEffort?.toLowerCase() ?? 'high',
    };
    void hosted.sendMessage(text, reasoning);
  };

  useEffect(() => {
    if (!isResizingRightPanel) return;
    const move = (event: PointerEvent) => {
      const current = resize.current;
      if (current)
        setRightPanelWidth(
          Math.min(
            RIGHT_PANEL_MAX_WIDTH,
            Math.max(
              RIGHT_PANEL_MIN_WIDTH,
              current.startWidth + current.startX - event.clientX,
            ),
          ),
        );
    };
    const stop = () => {
      resize.current = null;
      setIsResizingRightPanel(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [isResizingRightPanel]);
  useEffect(() => {
    let active = true;
    void listDevices(accessToken)
      .then((rows) => {
        if (active) {
          setDevices(rows);
          setDeviceError(null);
        }
      })
      .catch((error: unknown) => {
        if (active)
          setDeviceError(
            error instanceof Error ? error.message : 'Could not load computers.',
          );
      });
    return () => {
      active = false;
    };
  }, [accessToken, state.activeSession?.id]);
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 360)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 360 ? 'auto' : 'hidden';
  }, [draft]);
  useEffect(() => {
    if (!transcriptStarted) return;
    const frame = window.requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [
    pathMessages.length,
    state.pendingUserText,
    state.streamingText,
    transcriptStarted,
  ]);

  return (
    <>
      <Sidebar
        className={`reference-sidebar ${open ? 'sidebar-expanded' : 'sidebar-collapsed'}`}
        collapsible="offcanvas"
      >
        <header className="sidebar-header">
          <button
            className="brand-toggle"
            aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
            onClick={toggleSidebar}
          >
            <Bot className="brand-logo" />
            <PanelLeft className="brand-toggle-icon" />
          </button>
          <span className="wordmark">Windie</span>
          <button
            className="icon-button sidebar-search expanded-only"
            aria-label="Search recent chats"
            aria-expanded={searching}
            onClick={() => setSearching(!searching)}
          >
            <Search />
          </button>
          <button
            className="icon-button expanded-only"
            aria-label="Collapse sidebar"
            onClick={toggleSidebar}
          >
            <PanelLeft />
          </button>
        </header>
        <div className="sidebar-scroll sidebar-expanded-content">
          <nav aria-label="Main navigation" className="navigation">
            <button
              className="nav-item selected"
              onClick={() => {
                setDraft('');
                navigateToNewChat();
                void hosted.startNewChat();
              }}
            >
              <DiamondPlus />
              <span>New chat</span>
            </button>
            <button
              className="nav-item"
              disabled
              title="Wakeups are not available yet"
            >
              <Bell />
              <span>Wakeups</span>
            </button>
            <button
              className="nav-item"
              onClick={() => {
                window.location.assign('/computers');
              }}
            >
              <Monitor />
              <span>Computers</span>
            </button>
            <button
              className="nav-item"
              disabled
              title="Talents are not available yet"
            >
              <UsersRound />
              <span>Talents</span>
            </button>
          </nav>
          <section className="recents" aria-labelledby="recents-heading">
            <h2 id="recents-heading" className="font-mono">
              Recents
            </h2>
            {searching && (
              <input
                className="history-search font-mono"
                aria-label="Search recent chats"
                placeholder="Search chats"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setSearching(false);
                    setSearch('');
                  }
                }}
              />
            )}
            {conversations.map((conversation) => (
              <button
                className={`recent-item font-mono ${conversation.id === state.activeConversation?.id ? 'active-recent' : ''}`}
                key={conversation.id}
                onClick={() => navigateToConversation(conversation.id)}
                aria-current={
                  conversation.id === state.activeConversation?.id
                    ? 'page'
                    : undefined
                }
              >
                {conversation.title ?? 'New conversation'}
              </button>
            ))}
            {state.initialized && conversations.length === 0 && (
              <p className="no-results">No chats found</p>
            )}
          </section>
        </div>
        <footer className="profile-footer">
          <button
            className="profile"
            aria-label="Sign out"
            onClick={onSignOut}
            title={email ?? 'Sign out'}
          >
            <span className="avatar">
              {(email?.slice(0, 2) ?? 'WI').toUpperCase()}
            </span>
            <span className="profile-copy">
              <span>{email ?? 'Windie account'}</span>
              <small className="font-mono">Sign out</small>
            </span>
          </button>
          <button className="icon-button" disabled aria-label="Gifts">
            <Gift />
          </button>
        </footer>
      </Sidebar>
      <div className="workspace-shell">
        <button
          className="icon-button right-panel"
          aria-label={
            rightPanelOpen ? 'Collapse tools panel' : 'Expand tools panel'
          }
          aria-expanded={rightPanelOpen}
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
        >
          <PanelRight />
        </button>
        <div className="workspace-body">
          <main
            className={`chat-canvas ${transcriptStarted ? 'has-transcript' : ''}`}
          >
            <button
              className="icon-button reopen-sidebar"
              aria-label="Open sidebar"
              onClick={toggleSidebar}
            >
              <PanelLeft />
            </button>
            {!viewVisible &&
              state.routeId === requestedConversationId &&
              state.routeStatus === 'error' && (
                <p className="turn-status is-error" role="alert">
                  {state.error}
                </p>
              )}
            {viewVisible && (
              <>
                {!transcriptStarted && state.error && (
                  <p className="turn-status is-error" role="alert">
                    {state.error}
                  </p>
                )}
                <div ref={scrollRef} className="transcript-scroll">
                  <section
                    className={`transcript ${transcriptStarted ? 'is-visible' : ''}`}
                    aria-live="polite"
                  >
                    {needsHead && (
                      <div className="turn-status">
                        <p>
                          This conversation has multiple branches. Choose a
                          message head to open:
                        </p>
                        {branchHeads.map((id) => (
                          <button
                            key={id}
                            onClick={() => void hosted.selectHead(id)}
                          >
                            {state.activeConversation?.messages
                              .find((message) => message.id === id)
                              ?.content.slice(0, 80) || id}
                          </button>
                        ))}
                      </div>
                    )}
                    {transcriptRows(state).map(
                      ({ key, message, streaming }) => (
                        <TranscriptMessage
                          key={key}
                          message={message}
                          streaming={streaming}
                        />
                      ),
                    )}
                    {transcriptStarted && state.error && (
                      <p className="turn-status is-error" role="alert">
                        {state.error}
                      </p>
                    )}
                  </section>
                </div>
                <section
                  className={`prompt-area ${transcriptStarted ? 'conversation-composer' : ''}`}
                  aria-labelledby="prompt-heading"
                >
                  {!transcriptStarted && (
                    <h1 id="prompt-heading">What’s on your mind today?</h1>
                  )}
                  <div
                    className={`composer ${isMultiline ? 'is-multiline' : ''}`}
                  >
                    <div className="composer-controls">
                      <button
                        className="icon-button attachment-button"
                        disabled
                        aria-label="Add attachment"
                        title="Attachments are not available yet"
                      >
                        <Plus />
                      </button>
                      <Select
                        value={reasoningEffort}
                        onValueChange={setReasoningEffort}
                      >
                        <SelectTrigger
                          className="effort-select font-mono"
                          aria-label="Reasoning effort"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent
                          align="end"
                          alignItemWithTrigger={false}
                          className="effort-menu"
                        >
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                        </SelectContent>
                      </Select>
                      {state.sending ? (
                        <button
                          className="send-button stop-button"
                          aria-label="Stop response"
                          onClick={() => void hosted.stop()}
                        >
                          <Square />
                        </button>
                      ) : draft.trim() ? (
                        <button
                          className="send-button"
                          aria-label="Send message"
                          disabled={needsHead}
                          onClick={submit}
                        >
                          <ArrowUp />
                        </button>
                      ) : (
                        <button
                          className="voice-button"
                          disabled
                          aria-label="Start voice mode"
                          title="Voice is not available yet"
                        >
                          <AudioLines />
                        </button>
                      )}
                    </div>
                    <textarea
                      ref={inputRef}
                      rows={1}
                      aria-label="Ask Windie"
                      placeholder="Ask Windie"
                      value={draft}
                      disabled={state.sending || needsHead}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          submit();
                        }
                      }}
                    />
                  </div>
                  <p className="sr-only">
                    Your messages are sent to your authenticated hosted Windie
                    account.
                  </p>
                </section>
              </>
            )}
          </main>
          <aside
            className={`right-sidebar ${rightPanelOpen ? 'is-open' : ''} ${isResizingRightPanel ? 'is-resizing' : ''}`}
            style={
              { '--right-panel-width': `${rightPanelWidth}px` } as CSSProperties
            }
            aria-label={
              dockView === 'graph' ? 'Conversation graph' : 'Tools panel'
            }
            aria-hidden={!rightPanelOpen}
          >
            <button
              type="button"
              className="right-sidebar-resize-handle"
              aria-label="Resize tools panel"
              tabIndex={rightPanelOpen ? 0 : -1}
              onPointerDown={(event) => {
                if (event.button === 0) {
                  event.preventDefault();
                  resize.current = {
                    startX: event.clientX,
                    startWidth: rightPanelWidth,
                  };
                  setIsResizingRightPanel(true);
                }
              }}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 40 : 10;
                if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  setRightPanelWidth((width) =>
                    Math.min(RIGHT_PANEL_MAX_WIDTH, width + step),
                  );
                } else if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  setRightPanelWidth((width) =>
                    Math.max(RIGHT_PANEL_MIN_WIDTH, width - step),
                  );
                }
              }}
            />
            {dockView === 'graph' ? (
              <GraphDock
                nodes={graphNodes}
                selectedNodeId={activeGraphNodeId}
                onSelectNode={(nodeId) => {
                  setSelectedGraphNodeId(nodeId);
                  void hosted.selectHead(nodeId);
                }}
                onBack={() => setDockView('tools')}
                onOpenMessage={(node) => {
                  document
                    .querySelector<HTMLElement>(
                      `[data-message-id="${node.id}"]`,
                    )
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  setRightPanelOpen(false);
                }}
              />
            ) : (
              <>
                <section className="device-tool-panel" aria-label="Device tools">
                  <p className="device-tool-label">Connected Mac</p>
                  {!state.activeSession ? (
                    <p className="device-tool-copy">
                      Start a conversation, then choose the Mac that may run approved tools.
                    </p>
                  ) : state.boundDeviceId ? (
                    <p className="device-tool-copy is-bound">
                      {boundDevice?.metadata.name ?? 'Connected computer'} is selected for this session.
                    </p>
                  ) : eligibleDevices.length === 1 ? (
                    <button
                      className="device-tool-action"
                      onClick={() => void hosted.bindDevice(eligibleDevices[0].id)}
                    >
                      Use {eligibleDevices[0].metadata.name}
                    </button>
                  ) : eligibleDevices.length > 1 ? (
                    <div className="device-tool-choices">
                      {eligibleDevices.map((device) => (
                        <button
                          key={device.id}
                          className="device-tool-action"
                          onClick={() => void hosted.bindDevice(device.id)}
                        >
                          Use {device.metadata.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="device-tool-copy">No execution-enabled computer is online.</p>
                  )}
                  {deviceError && <p className="device-tool-error">{deviceError}</p>}
                  {state.activeSession?.status === 'waiting_for_tool' && (
                    <p className="device-tool-copy">Waiting for the selected Mac to return its result.</p>
                  )}
                  {state.approvals.map((approval) => (
                    <article className="tool-approval" key={approval.id}>
                      <strong>{approval.tool_name}</strong>
                      <span>on {devices.find((device) => device.id === approval.device_id)?.metadata.name ?? 'selected Mac'}</span>
                      <code>{approval.arguments_json}</code>
                      <div>
                        <button onClick={() => void hosted.approveTool(approval.id)}>Approve</button>
                        <button onClick={() => void hosted.denyTool(approval.id)}>Deny</button>
                      </div>
                    </article>
                  ))}
                </section>
                <nav className="right-sidebar-menu" aria-label="Tools">
                <button className="right-sidebar-item" disabled>
                  <ClipboardCheck />
                  <span>Review</span>
                  <kbd>Ctrl+Shift+G</kbd>
                </button>
                <button
                  className="right-sidebar-item"
                  onClick={() => {
                    setDockView('graph');
                    setRightPanelOpen(true);
                  }}
                >
                  <GitBranch />
                  <span>Graph</span>
                  <kbd>Ctrl+`</kbd>
                </button>
                <button className="right-sidebar-item" disabled>
                  <Globe2 />
                  <span>Browser</span>
                  <kbd>Ctrl+T</kbd>
                </button>
                <button className="right-sidebar-item" disabled>
                  <Files />
                  <span>Files</span>
                  <kbd>Ctrl+P</kbd>
                </button>
                <button className="right-sidebar-item" disabled>
                  <MessageCircle />
                  <span>Side chat</span>
                  <kbd>Ctrl+Alt+S</kbd>
                </button>
              </nav>
              </>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

function AuthScreen() {
  const auth = useHostedAuth();
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  if (!hostedApiConfigured())
    return (
      <AuthLayout>
        <section className="auth-content auth-status">
          <h1>Windie is not configured</h1>
          <p>
            This deployment needs its hosted API URL before it can connect to
            your conversations.
          </p>
        </section>
      </AuthLayout>
    );
  if (auth.isLoading)
    return (
      <AuthLayout>
        <section
          className="auth-content auth-status"
          aria-live="polite"
          aria-busy="true"
        >
          <LoaderCircle className="spin" aria-hidden="true" />
          <h1>Getting things ready.</h1>
          <p>Loading your Windie account…</p>
        </section>
      </AuthLayout>
    );
  if (auth.configurationError)
    return (
      <AuthLayout>
        <section className="auth-content auth-status">
          <h1>Windie sign-in is not configured</h1>
          <p>{auth.configurationError}</p>
        </section>
      </AuthLayout>
    );
  if (!auth.session)
    return (
      <SignInPanel
        signingIn={auth.isSigningIn}
        error={auth.error}
        onSignIn={() => void auth.signInWithGoogle()}
      />
    );
  if (deviceRoute(path))
    return (
      <DevicesScreen
        key={auth.session.user.id + path}
        token={auth.session.access_token}
        accountId={auth.session.user.id}
        email={auth.session.user.email ?? null}
        pairing={path === '/devices/connect'}
        onSignOut={() => void auth.signOut()}
      />
    );
  // The account gate is not a sidebar child. The sidebar's flex layout previously
  // shrink-wrapped the sign-in page, leaving its card centered in a narrow column.
  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': '242px',
          '--sidebar-width-icon': '52px',
        } as CSSProperties
      }
    >
      <ChatScreen
        key={auth.session.user.id}
        accessToken={auth.session.access_token}
        email={auth.session.user.email ?? null}
        onSignOut={() => void auth.signOut()}
      />
    </SidebarProvider>
  );
}

export default function Home() {
  return <AuthScreen />;
}
