'use client';
import { useRef, useState, type CSSProperties } from 'react';
import { Bell, Monitor, UsersRound, SquarePen, Search, PanelLeft, PanelRight, Plus, AudioLines, Gift } from 'lucide-react';
import { Sidebar, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Reference labels are presentation fixtures, independent of runtime history.
const recents = ['Design Windie UI', 'Website drawing tools', 'Best TV Show Lists', 'Bipolar Disorder Explained', 'Hot Pot Burner Name', 'Warzone Skin Recommendations', 'Answer questions', 'Condense Agent Instructions', 'Branch - Create Charlie Kirk Image', 'Create Charlie Kirk Image', 'App Subscription Legal Status', 'Assembly Ascending Flag'];

function ChatScreen() {
  const { open, isMobile, toggleSidebar } = useSidebar();
  const [draft, setDraft] = useState('');
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  function newChat() { setDraft(''); setSearch(''); setSearching(false); inputRef.current?.focus(); }
  return <>
    <Sidebar className="reference-sidebar">
      <header className="sidebar-header">
        <span className="wordmark">ChatGPT</span>
        <button className="icon-button" aria-label="Search recent chats" aria-expanded={searching} onClick={() => setSearching(!searching)} title="Search chats"><Search /></button>
        <button className="icon-button" aria-label="Close sidebar" onClick={toggleSidebar} title="Close sidebar"><PanelLeft /></button>
      </header>
      <div className="sidebar-scroll">
        <nav aria-label="Main navigation" className="navigation">
          <button className="nav-item selected" onClick={newChat}><SquarePen /><span>New chat</span></button>
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
        <button className="profile" aria-label="g p, Free account" aria-disabled="true" title="Account — design preview"><span className="avatar">PP</span><span className="profile-copy"><span>g p</span><small className="font-mono">Free</small></span></button>
        <button className="icon-button" aria-label="Gifts" aria-disabled="true" title="Gifts — design preview"><Gift /></button>
      </footer>
    </Sidebar>
    <main className="chat-canvas">
      {(!open || isMobile) && <button className="icon-button reopen-sidebar" aria-label="Open sidebar" onClick={toggleSidebar}><PanelLeft /></button>}
      <button className="icon-button right-panel" aria-label="Right panel" aria-disabled="true" title="Right panel — design preview"><PanelRight /></button>
      <section className="prompt-area" aria-labelledby="prompt-heading">
        <h1 id="prompt-heading">What’s on your mind today?</h1>
        <div className="composer">
          <button className="icon-button attachment-button" aria-label="Add attachment" aria-disabled="true" title="Attachments — design preview"><Plus /></button>
          <input ref={inputRef} aria-label="Ask ChatGPT" aria-describedby="preview-description" placeholder="Ask ChatGPT" value={draft} onChange={e => setDraft(e.target.value)} />
          <Select defaultValue="High">
            <SelectTrigger className="effort-select font-mono" aria-label="Reasoning effort"><SelectValue /></SelectTrigger>
            <SelectContent align="end" alignItemWithTrigger={false} className="effort-menu"><SelectItem value="Low">Low</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="High">High</SelectItem></SelectContent>
          </Select>
          <button className="voice-button" aria-label="Start voice mode" aria-disabled="true" title="Voice — design preview"><AudioLines /></button>
        </div>
        <p id="preview-description" className="sr-only">Standalone design preview. You can type a draft; messaging, voice, attachments, and account services are not connected.</p>
      </section>
    </main>
  </>;
}
export default function Home() { return <SidebarProvider style={{ '--sidebar-width': '242px' } as CSSProperties}><ChatScreen /></SidebarProvider>; }
