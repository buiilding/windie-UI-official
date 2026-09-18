'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Bell, Monitor, UsersRound, DiamondPlus, Search, PanelLeft, PanelRight, Plus, AudioLines, Gift, ClipboardCheck, TerminalSquare, Globe2, Files, MessageCircle, Bot, ArrowUp, Copy, Ellipsis, GitBranch, LoaderCircle, RotateCcw, Share, Square, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { Sidebar, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Reference labels are presentation fixtures, independent of runtime history.
const recents = ['Design Windie UI', 'Website drawing tools', 'Best TV Show Lists', 'Bipolar Disorder Explained', 'Hot Pot Burner Name', 'Warzone Skin Recommendations', 'Answer questions', 'Condense Agent Instructions', 'Branch - Create Charlie Kirk Image', 'Create Charlie Kirk Image', 'App Subscription Legal Status', 'Assembly Ascending Flag'];
const RIGHT_PANEL_MIN_WIDTH = 242;
const RIGHT_PANEL_MAX_WIDTH = 1100;
const MOCK_CONVERSATION_ID = 'greeting-exchange';
const MOCK_RESPONSE = 'Hi Peter. What would you like to work on?';

type TranscriptStatus = 'idle' | 'validating' | 'thinking' | 'streaming' | 'completed' | 'stopped' | 'error';
type StoredTurnStatus = 'completed' | 'stopped' | 'error';

type StoredTranscriptTurn = {
  id: string;
  prompt: string;
  assistantText: string;
  status: StoredTurnStatus;
  messageActionsVisible: boolean;
};

type RenderedTranscriptTurn = Omit<StoredTranscriptTurn, 'status'> & {
  status: Exclude<TranscriptStatus, 'idle'>;
};

function BranchAffordance() {
  return <button className="branch-affordance" aria-disabled="true" title="Branching — transcript preview"><GitBranch /><span>Branch</span></button>;
}

function AssistantActions({ visible }: { visible: boolean }) {
  return <div className={`message-actions ${visible ? 'is-visible' : ''}`} aria-label="Assistant message actions" aria-hidden={!visible}><button aria-label="Copy response"><Copy /></button><button aria-label="Good response"><ThumbsUp /></button><button aria-label="Bad response"><ThumbsDown /></button><button aria-label="Share response"><Share /></button><button aria-label="Regenerate response"><RotateCcw /></button><button aria-label="More response actions"><Ellipsis /></button></div>;
}

function TranscriptTurn({ prompt, assistantText, status, messageActionsVisible }: {
  prompt: string;
  assistantText: string;
  status: Exclude<TranscriptStatus, 'idle'>;
  messageActionsVisible: boolean;
}) {
  return <>
    {status !== 'validating' && <article className="message-row user-message"><div className="message-bubble">{prompt}</div><BranchAffordance /></article>}
    {(status === 'thinking' || status === 'streaming' || status === 'completed' || status === 'stopped' || status === 'error') && <article className="message-row assistant-message">
      {status === 'thinking' && <p className="thinking-status"><LoaderCircle /> Thinking</p>}
      {status === 'streaming' && <p className="assistant-copy">{assistantText}<span className="stream-caret" /></p>}
      {status === 'completed' && <p className="assistant-copy">{assistantText}</p>}
      {status === 'stopped' && <><p className="assistant-copy">{assistantText}</p><p className="turn-status"><Square /> Stopped</p></>}
      {status === 'error' && <p className="turn-status is-error">Something went wrong. Try sending that again.</p>}
      {status === 'completed' && <AssistantActions visible={messageActionsVisible} />}
    </article>}
  </>;
}

function ChatScreen() {
  const { open, isMobile, toggleSidebar } = useSidebar();
  const [draft, setDraft] = useState('');
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_MIN_WIDTH);
  const [isResizingRightPanel, setIsResizingRightPanel] = useState(false);
  const [transcriptStatus, setTranscriptStatus] = useState<TranscriptStatus>('idle');
  const [submittedPrompt, setSubmittedPrompt] = useState('');
  const [assistantText, setAssistantText] = useState('');
  const [messageActionsVisible, setMessageActionsVisible] = useState(false);
  const [recentTitle, setRecentTitle] = useState<string | null>(null);
  const [attachmentReady, setAttachmentReady] = useState(false);
  const [previousTurns, setPreviousTurns] = useState<StoredTranscriptTurn[]>([]);
  const [activeTurnId, setActiveTurnId] = useState('');
  const rightPanelResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const nextTurnNumber = useRef(0);
  const activeTurnIdRef = useRef('');
  const actionRevealTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const isMultiline = draft.includes('\n');
  const transcriptStarted = transcriptStatus !== 'idle';
  const activeTranscriptTurn: RenderedTranscriptTurn | null = transcriptStatus === 'idle' || !submittedPrompt
    ? null
    : { id: activeTurnId, prompt: submittedPrompt, assistantText, status: transcriptStatus, messageActionsVisible };
  const renderedTranscriptTurns: RenderedTranscriptTurn[] = activeTranscriptTurn
    ? [...previousTurns, activeTranscriptTurn]
    : previousTurns;
  function clearActionRevealTimers() {
    actionRevealTimers.current.forEach(timer => clearTimeout(timer));
    actionRevealTimers.current.clear();
  }
  function scheduleActionReveal(turnId: string) {
    const timer = setTimeout(() => {
      actionRevealTimers.current.delete(timer);
      if (activeTurnIdRef.current === turnId) {
        setMessageActionsVisible(true);
      } else {
        setPreviousTurns(turns => turns.map(turn => turn.id === turnId ? { ...turn, messageActionsVisible: true } : turn));
      }
    }, 3000);
    actionRevealTimers.current.add(timer);
  }
  function newChat() {
    window.history.pushState({}, '', '/');
    setDraft('');
    setSearch('');
    setSearching(false);
    setTranscriptStatus('idle');
    setSubmittedPrompt('');
    setAssistantText('');
    setMessageActionsVisible(false);
    setRecentTitle(null);
    setAttachmentReady(false);
    setPreviousTurns([]);
    setActiveTurnId('');
    nextTurnNumber.current = 0;
    activeTurnIdRef.current = '';
    clearActionRevealTimers();
    transcriptScrollRef.current?.scrollTo({ top: 0 });
    inputRef.current?.focus();
  }
  function submitDraft() {
    const prompt = draft.trim();
    if (!prompt || transcriptStatus === 'thinking' || transcriptStatus === 'streaming') return;
    const isFirstTurn = transcriptStatus === 'idle';
    if (!isFirstTurn && submittedPrompt && (transcriptStatus === 'completed' || transcriptStatus === 'stopped' || transcriptStatus === 'error')) {
      setPreviousTurns(turns => [...turns, { id: activeTurnId, prompt: submittedPrompt, assistantText, status: transcriptStatus, messageActionsVisible }]);
    } else if (isFirstTurn) {
      window.history.pushState({}, '', `/c/${MOCK_CONVERSATION_ID}`);
    }
    nextTurnNumber.current += 1;
    const nextTurnId = `turn-${nextTurnNumber.current}`;
    activeTurnIdRef.current = nextTurnId;
    setActiveTurnId(nextTurnId);
    setSubmittedPrompt(prompt);
    setDraft('');
    setAssistantText('');
    setMessageActionsVisible(false);
    setTranscriptStatus(isFirstTurn ? 'validating' : 'thinking');
  }
  function stopResponse() {
    if (transcriptStatus !== 'thinking' && transcriptStatus !== 'streaming') return;
    setTranscriptStatus('stopped');
  }
  useEffect(() => {
    if (!rightPanelOpen) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setRightPanelOpen(false);
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [rightPanelOpen]);
  useEffect(() => {
    if (!isResizingRightPanel) return;
    function handlePointerMove(event: PointerEvent) {
      const resizeState = rightPanelResizeRef.current;
      if (!resizeState) return;
      const nextWidth = resizeState.startWidth + resizeState.startX - event.clientX;
      setRightPanelWidth(Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, nextWidth)));
    }
    function stopResizing() {
      rightPanelResizeRef.current = null;
      setIsResizingRightPanel(false);
    }
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing);
    window.addEventListener('pointercancel', stopResizing);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
    };
  }, [isResizingRightPanel]);
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const maxTextareaHeight = 360;
    textarea.style.height = '0px';
    const nextHeight = Math.min(textarea.scrollHeight, maxTextareaHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxTextareaHeight ? 'auto' : 'hidden';
  }, [draft]);
  useEffect(() => {
    if (!transcriptStarted) return;
    const frame = window.requestAnimationFrame(() => {
      const transcript = transcriptScrollRef.current;
      if (transcript) transcript.scrollTo({ top: transcript.scrollHeight, behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [transcriptStarted, renderedTranscriptTurns.length, transcriptStatus, messageActionsVisible]);
  useEffect(() => () => clearActionRevealTimers(), []);
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    if (transcriptStatus === 'validating') {
      timeout = setTimeout(() => setTranscriptStatus('thinking'), 450);
    } else if (transcriptStatus === 'thinking') {
      timeout = setTimeout(() => setTranscriptStatus('streaming'), 750);
    } else if (transcriptStatus === 'streaming') {
      let nextCharacter = 0;
      interval = setInterval(() => {
        nextCharacter += 1;
        setAssistantText(MOCK_RESPONSE.slice(0, nextCharacter));
        if (nextCharacter >= MOCK_RESPONSE.length) {
          clearInterval(interval);
          setRecentTitle(title => title ?? 'Greeting exchange');
          setTranscriptStatus('completed');
        }
      }, 30);
    } else if (transcriptStatus === 'completed') {
      scheduleActionReveal(activeTurnId);
    }
    return () => {
      if (timeout) clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [transcriptStatus]);
  return <>
    <Sidebar className={`reference-sidebar ${open ? 'sidebar-expanded' : 'sidebar-collapsed'}`} collapsible="offcanvas">
      <header className="sidebar-header">
        <button className="brand-toggle" aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'} onClick={toggleSidebar} title={open ? 'Collapse sidebar' : 'Expand sidebar'}><Bot className="brand-logo" /><PanelLeft className="brand-toggle-icon" /></button>
        <span className="wordmark">Windie</span>
        <button className="icon-button sidebar-search expanded-only" aria-label="Search recent chats" aria-expanded={searching} onClick={() => setSearching(!searching)} title="Search chats"><Search /></button>
        <button className="icon-button expanded-only" aria-label="Collapse sidebar" onClick={toggleSidebar} title="Collapse sidebar"><PanelLeft /></button>
      </header>
      <div className="sidebar-scroll sidebar-expanded-content">
        <nav aria-label="Main navigation" className="navigation">
          <button className="nav-item selected" onClick={newChat}><DiamondPlus /><span>New chat</span></button>
          <button className="nav-item" aria-disabled="true" title="Wakeups — design preview"><Bell /><span>Wakeups</span></button>
          <button className="nav-item" aria-disabled="true" title="Computers — design preview"><Monitor /><span>Computers</span></button>
          <button className="nav-item" aria-disabled="true" title="Talents — design preview"><UsersRound /><span>Talents</span></button>
        </nav>
        <section className="recents" aria-labelledby="recents-heading">
          <h2 id="recents-heading" className="font-mono">Recents</h2>
          {searching && <input className="history-search font-mono" autoFocus aria-label="Search recent chats" placeholder="Search chats" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setSearching(false); setSearch(''); } }} />}
          {submittedPrompt && <button className="recent-item font-mono active-recent" aria-current="page" title={recentTitle ?? submittedPrompt}>{recentTitle ?? submittedPrompt}</button>}
          {recents.filter(label => label.toLowerCase().includes(search.toLowerCase())).map(label => <button className="recent-item font-mono" key={label} aria-disabled="true" title={label + ' — design preview'}>{label}</button>)}
          {searching && !recents.some(label => label.toLowerCase().includes(search.toLowerCase())) && <p className="no-results">No chats found</p>}
        </section>
      </div>
      <footer className="profile-footer">
        <button className="profile" aria-label="g p, Free account" aria-disabled="true" title={open ? 'Account — design preview' : undefined}><span className="avatar">PP</span><span className="profile-copy"><span>g p</span><small className="font-mono">Free</small></span></button>
        <button className="icon-button" aria-label="Gifts" aria-disabled="true" title="Gifts — design preview"><Gift /></button>
      </footer>
    </Sidebar>
    <div className="workspace-shell">
      <header className={`workspace-header ${rightPanelOpen ? 'tools-open' : 'tools-collapsed'}`}>
        <button className="icon-button right-panel" aria-label={rightPanelOpen ? 'Collapse tools panel' : 'Expand tools panel'} aria-expanded={rightPanelOpen} onClick={() => setRightPanelOpen(!rightPanelOpen)} title={rightPanelOpen ? 'Collapse tools panel' : 'Expand tools panel'}><PanelRight /></button>
      </header>
      <div className="workspace-body">
        <main className={`chat-canvas ${transcriptStarted ? 'has-transcript' : ''}`}>
          <button className="icon-button reopen-sidebar" aria-label="Open sidebar" onClick={toggleSidebar}><PanelLeft /></button>
          <div ref={transcriptScrollRef} className="transcript-scroll">
            <section className={`transcript ${transcriptStarted ? 'is-visible' : ''}`} aria-live="polite">
              {renderedTranscriptTurns.map(turn => <TranscriptTurn key={turn.id} {...turn} />)}
            </section>
          </div>
          <section className={`prompt-area ${transcriptStarted ? 'conversation-composer' : ''} ${attachmentReady ? 'has-attachment' : ''}`} aria-labelledby="prompt-heading">
            {!transcriptStarted && <h1 id="prompt-heading">What’s on your mind today?</h1>}
            {attachmentReady && <div className="attachment-preview"><span>mock-notes.pdf</span><button onClick={() => setAttachmentReady(false)} aria-label="Remove attachment"><X /></button></div>}
            <div className={`composer ${isMultiline ? 'is-multiline' : ''}`}>
              <button className="icon-button attachment-button" aria-label="Add attachment" onClick={() => setAttachmentReady(true)} title="Add mock attachment"><Plus /></button>
              <textarea ref={inputRef} rows={1} aria-label="Ask Windie" aria-describedby="preview-description" placeholder="Ask Windie" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitDraft(); } }} />
              <Select defaultValue="High">
                <SelectTrigger className="effort-select font-mono" aria-label="Reasoning effort"><SelectValue /></SelectTrigger>
                <SelectContent align="end" alignItemWithTrigger={false} className="effort-menu"><SelectItem value="Low">Low</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="High">High</SelectItem></SelectContent>
              </Select>
              {transcriptStatus === 'thinking' || transcriptStatus === 'streaming'
                ? <button className="send-button stop-button" aria-label="Stop response" onClick={stopResponse} title="Stop response"><Square /></button>
                : draft.trim()
                  ? <button className="send-button" aria-label="Send message" onClick={submitDraft} title="Send message"><ArrowUp /></button>
                  : <button className="voice-button" aria-label="Start voice mode" aria-disabled="true" title="Voice — design preview"><AudioLines /></button>}
            </div>
            <p id="preview-description" className="sr-only">Standalone design preview. This transcript uses local mock states; messaging, voice, attachments, and account services are not connected.</p>
          </section>
        </main>
        <aside className={`right-sidebar ${rightPanelOpen ? 'is-open' : ''} ${isResizingRightPanel ? 'is-resizing' : ''}`} style={{ '--right-panel-width': `${rightPanelWidth}px` } as CSSProperties} aria-label="Tools panel" aria-hidden={!rightPanelOpen}>
          <div
            className="right-sidebar-resize-handle"
            role="separator"
            aria-label="Resize tools panel"
            aria-orientation="vertical"
            aria-valuemin={RIGHT_PANEL_MIN_WIDTH}
            aria-valuemax={RIGHT_PANEL_MAX_WIDTH}
            aria-valuenow={rightPanelWidth}
            tabIndex={rightPanelOpen ? 0 : -1}
            onPointerDown={event => {
              if (event.button !== 0) return;
              event.preventDefault();
              rightPanelResizeRef.current = { startX: event.clientX, startWidth: rightPanelWidth };
              setIsResizingRightPanel(true);
            }}
            onKeyDown={event => {
              const step = event.shiftKey ? 40 : 10;
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                setRightPanelWidth(width => Math.min(RIGHT_PANEL_MAX_WIDTH, width + step));
              } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                setRightPanelWidth(width => Math.max(RIGHT_PANEL_MIN_WIDTH, width - step));
              } else if (event.key === 'Home') {
                event.preventDefault();
                setRightPanelWidth(RIGHT_PANEL_MIN_WIDTH);
              } else if (event.key === 'End') {
                event.preventDefault();
                setRightPanelWidth(RIGHT_PANEL_MAX_WIDTH);
              }
            }}
          />
          <nav className="right-sidebar-menu" aria-label="Tools">
            <button className="right-sidebar-item" aria-disabled="true" title="Review — design preview"><ClipboardCheck /><span>Review</span><kbd>Ctrl+Shift+G</kbd></button>
            <button className="right-sidebar-item" aria-disabled="true" title="Terminal — design preview"><TerminalSquare /><span>Terminal</span><kbd>Ctrl+`</kbd></button>
            <button className="right-sidebar-item" aria-disabled="true" title="Browser — design preview"><Globe2 /><span>Browser</span><kbd>Ctrl+T</kbd></button>
            <button className="right-sidebar-item" aria-disabled="true" title="Files — design preview"><Files /><span>Files</span><kbd>Ctrl+P</kbd></button>
            <button className="right-sidebar-item" aria-disabled="true" title="Side chat — design preview"><MessageCircle /><span>Side chat</span><kbd>Ctrl+Alt+S</kbd></button>
          </nav>
        </aside>
      </div>
    </div>
  </>;
}
export default function Home() { return <SidebarProvider style={{ '--sidebar-width': '242px', '--sidebar-width-icon': '52px' } as CSSProperties}><ChatScreen /></SidebarProvider>; }
