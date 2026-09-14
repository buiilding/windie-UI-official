'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Bell, Monitor, UsersRound, DiamondPlus, Search, PanelLeft, PanelRight, Plus, AudioLines, Gift, ClipboardCheck, TerminalSquare, Globe2, Files, MessageCircle, Bot } from 'lucide-react';
import { Sidebar, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Reference labels are presentation fixtures, independent of runtime history.
const recents = ['Design Windie UI', 'Website drawing tools', 'Best TV Show Lists', 'Bipolar Disorder Explained', 'Hot Pot Burner Name', 'Warzone Skin Recommendations', 'Answer questions', 'Condense Agent Instructions', 'Branch - Create Charlie Kirk Image', 'Create Charlie Kirk Image', 'App Subscription Legal Status', 'Assembly Ascending Flag'];
const RIGHT_PANEL_MIN_WIDTH = 242;
const RIGHT_PANEL_MAX_WIDTH = 1100;
const SIDEBAR_COLLAPSE_DURATION = 220;

function ChatScreen() {
  const { open, isMobile, toggleSidebar } = useSidebar();
  const [draft, setDraft] = useState('');
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_MIN_WIDTH);
  const [isResizingRightPanel, setIsResizingRightPanel] = useState(false);
  const [showReopenSidebar, setShowReopenSidebar] = useState(false);
  const rightPanelResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isMultiline = draft.includes('\n');
  function newChat() { setDraft(''); setSearch(''); setSearching(false); inputRef.current?.focus(); }
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
    if (open) {
      setShowReopenSidebar(false);
      return;
    }
    const timer = window.setTimeout(() => setShowReopenSidebar(true), SIDEBAR_COLLAPSE_DURATION);
    return () => window.clearTimeout(timer);
  }, [open]);
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const maxTextareaHeight = 360;
    textarea.style.height = '0px';
    const nextHeight = Math.min(textarea.scrollHeight, maxTextareaHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxTextareaHeight ? 'auto' : 'hidden';
  }, [draft]);
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
        <main className="chat-canvas">
          {(isMobile || showReopenSidebar) && <button className="icon-button reopen-sidebar" aria-label="Open sidebar" onClick={toggleSidebar}><PanelLeft /></button>}
          <section className="prompt-area" aria-labelledby="prompt-heading">
            <h1 id="prompt-heading">What’s on your mind today?</h1>
            <div className={`composer ${isMultiline ? 'is-multiline' : ''}`}>
              <button className="icon-button attachment-button" aria-label="Add attachment" aria-disabled="true" title="Attachments — design preview"><Plus /></button>
              <textarea ref={inputRef} rows={1} aria-label="Ask Windie" aria-describedby="preview-description" placeholder="Ask Windie" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) e.preventDefault(); }} />
              <Select defaultValue="High">
                <SelectTrigger className="effort-select font-mono" aria-label="Reasoning effort"><SelectValue /></SelectTrigger>
                <SelectContent align="end" alignItemWithTrigger={false} className="effort-menu"><SelectItem value="Low">Low</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="High">High</SelectItem></SelectContent>
              </Select>
              <button className="voice-button" aria-label="Start voice mode" aria-disabled="true" title="Voice — design preview"><AudioLines /></button>
            </div>
            <p id="preview-description" className="sr-only">Standalone design preview. You can type a draft; messaging, voice, attachments, and account services are not connected.</p>
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
