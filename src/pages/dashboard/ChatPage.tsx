import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Bot, History, Loader2, Mic, PanelLeftClose, Send, ShieldCheck, User } from 'lucide-react';
import { StatePill, StatusBanner } from '@/components/dashboard/DashboardPrimitives';
import { useAuth } from '@/contexts/AuthContext';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useWorkspace } from '@/hooks/useWorkspace';
import { requestJson } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';

const VoiceSessionControls = lazy(() => import('@/components/dashboard/VoiceSessionControls'));

type Message = { id: string; sender_type: 'user' | 'agent' | 'system'; content: string; created_at: string };
type Conversation = { id: string; title: string | null; channel: string | null; updated_at: string };
type VoiceState = { connected: boolean; speaking: boolean };

const suggestions = [
  'Schedule a 30-minute meeting',
  'Draft a payment reminder',
  'What needs my attention today?',
];

export default function ChatPage() {
  const { user } = useAuth();
  const { organization } = useWorkspace();
  const online = useOnlineStatus();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [voiceRequested, setVoiceRequested] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>({ connected: false, speaking: false });
  const bottom = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    if (!organization || !user) return;
    setLoadingHistory(true);
    const { data, error: queryError } = await supabase
      .from('conversations')
      .select('id,title,channel,updated_at')
      .eq('organization_id', organization.id)
      .eq('actor_user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(30);
    if (queryError) setError(queryError.message);
    else setConversations((data ?? []) as Conversation[]);
    setLoadingHistory(false);
  }, [organization, user]);

  useEffect(() => { void loadConversations(); }, [loadConversations]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  const selectConversation = async (conversation: Conversation) => {
    setConversationId(conversation.id);
    setShowHistory(false);
    setError('');
    const { data, error: queryError } = await supabase
      .from('messages')
      .select('id,sender_type,content,created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(200);
    if (queryError) setError(queryError.message);
    else setMessages((data ?? []) as Message[]);
  };

  const newConversation = () => {
    setConversationId(null);
    setMessages([]);
    setInput('');
    setShowHistory(false);
  };

  const send = async (text = input) => {
    const clean = text.trim();
    if (!clean || sending || !user || !organization || !online || voiceState.connected) return;
    setInput('');
    setSending(true);
    setError('');
    setMessages((current) => [...current, { id: crypto.randomUUID(), sender_type: 'user', content: clean, created_at: new Date().toISOString() }]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Your session has expired. Sign in again.');
      const data = await requestJson<{ conversationId?: string; reply?: string }>('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ message: clean, conversationId, organizationId: organization.id }),
      });
      if (!data.conversationId || !data.reply) throw new Error('Pandora returned an incomplete response.');
      setConversationId(data.conversationId);
      setMessages((current) => [...current, { id: crypto.randomUUID(), sender_type: 'agent', content: data.reply!, created_at: new Date().toISOString() }]);
      void loadConversations();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Request failed.';
      setError(message);
      setMessages((current) => [...current, { id: crypto.randomUUID(), sender_type: 'system', content: message, created_at: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
  };

  const placeholder = voiceState.connected
    ? voiceState.speaking ? 'Pandora is speaking…' : 'Pandora is listening…'
    : online ? 'Message Pandora…' : 'Offline — history remains available';

  return (
    <div className="relative flex h-[calc(100vh-5rem)] overflow-hidden bg-[#050505] md:h-screen">
      <aside className={`${showHistory ? 'translate-x-0' : '-translate-x-full'} absolute inset-y-0 left-0 z-30 flex w-[min(88vw,320px)] flex-col border-r border-white/8 bg-[#080808] transition-transform md:static md:z-auto md:w-72 md:translate-x-0`} aria-label="Conversation history">
        <div className="flex items-center justify-between border-b border-white/8 p-4">
          <div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/25">Durable history</p><p className="mt-1 text-sm text-white/68">Conversations</p></div>
          <button type="button" onClick={() => setShowHistory(false)} className="p-2 text-white/40 md:hidden" aria-label="Close conversation history"><PanelLeftClose size={16} /></button>
        </div>
        <div className="p-3"><button type="button" onClick={newConversation} className="w-full rounded-xl border border-white/10 px-4 py-2.5 text-left text-sm text-white/60 transition-colors hover:border-white/20 hover:text-white">+ New conversation</button></div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {loadingHistory ? <div className="space-y-2" aria-label="Loading conversation history">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-white/4" />)}</div> : conversations.length ? conversations.map((conversation) => (
            <button key={conversation.id} type="button" onClick={() => void selectConversation(conversation)} className={`mb-1 w-full rounded-xl border px-3 py-3 text-left transition-colors ${conversationId === conversation.id ? 'border-blue-300/18 bg-blue-300/7' : 'border-transparent hover:border-white/8 hover:bg-white/3'}`}>
              <span className="block truncate text-sm text-white/62">{conversation.title || 'Untitled operation'}</span>
              <span className="mt-2 flex items-center justify-between gap-2"><StatePill label={conversation.channel || 'web'} tone="info" /><time className="text-[10px] text-white/23">{new Date(conversation.updated_at).toLocaleDateString()}</time></span>
            </button>
          )) : <p className="px-2 py-8 text-center text-xs leading-5 text-white/25">Your verified web and voice conversations will appear here.</p>}
        </div>
      </aside>

      {showHistory && <button type="button" className="absolute inset-0 z-20 bg-black/70 md:hidden" onClick={() => setShowHistory(false)} aria-label="Close conversation history overlay" />}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-white/7 px-4 py-4 md:px-7">
          <div className="flex items-center gap-3"><button type="button" onClick={() => setShowHistory(true)} className="p-2 text-white/45 md:hidden" aria-label="Open conversation history"><History size={17} /></button><div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/25">Voice-first command centre</p><h1 className="mt-1 text-lg font-medium tracking-[-0.025em] text-white">Talk to Pandora</h1></div></div>
          <span className="hidden items-center gap-2 text-xs text-white/35 sm:inline-flex"><ShieldCheck size={14} />Actions stay permissioned</span>
        </header>

        {!online && <div className="px-4 pt-4 md:px-7"><StatusBanner tone="offline">You are offline. History is readable, but new commands and voice need a connection.</StatusBanner></div>}
        {error && online && <div className="px-4 pt-4 md:px-7"><StatusBanner onRetry={() => setError('')}>{error}</StatusBanner></div>}

        <main className="flex-1 overflow-y-auto px-4 py-6" aria-live="polite">
          <div className="mx-auto max-w-3xl space-y-5">
            {!messages.length && (
              <div className="py-12 text-center md:py-16">
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-white/10 bg-white/3"><Mic size={26} className="text-white/65" /></div>
                <h2 className="mt-6 text-2xl font-light tracking-[-0.035em] text-white">Ask in your own words.</h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/36">Schedule a meeting, prepare an email, create a reminder, draft an invoice, or ask about your business. Pandora clarifies important details before acting.</p>
                <div className="mt-7 flex flex-wrap justify-center gap-2">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => void send(suggestion)} disabled={!online} className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/42 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white disabled:opacity-35">{suggestion}</button>)}</div>
              </div>
            )}
            {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
            {sending && <div className="flex items-center gap-3 text-sm text-white/32"><Loader2 size={16} className="animate-spin" />Pandora is checking the details…</div>}
            <div ref={bottom} />
          </div>
        </main>

        <div className="border-t border-white/7 bg-[#080808] p-4">
          <div className="relative mx-auto max-w-3xl">
            <div className="flex gap-2">
              {voiceRequested && organization && user ? (
                <Suspense fallback={<div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-black"><Loader2 size={18} className="animate-spin" /></div>}>
                  <VoiceSessionControls organization={organization} userId={user.id} autoStart onStateChange={setVoiceState} />
                </Suspense>
              ) : (
                <button type="button" onClick={() => setVoiceRequested(true)} disabled={!online} className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white bg-white text-black disabled:opacity-35" aria-label="Start voice session"><Mic size={18} /></button>
              )}
              <div className="flex min-w-0 flex-1 items-center rounded-full border border-white/10 bg-black/30 px-4 focus-within:border-white/22">
                <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void send(); }} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/22" disabled={voiceState.connected || !online} aria-label="Message Pandora" />
                <button type="button" onClick={() => void send()} disabled={!input.trim() || sending || voiceState.connected || !online} className="p-2 text-white/45 transition-colors hover:text-white disabled:opacity-20" aria-label="Send message"><Send size={17} /></button>
              </div>
            </div>
            <p className="mt-3 text-center text-[10px] text-white/20">Pandora asks before external sends and calendar writes. Verify important information.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  return (
    <div className={`flex gap-3 ${message.sender_type === 'user' ? 'flex-row-reverse' : ''}`}>
      {message.sender_type !== 'system' && <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10">{message.sender_type === 'user' ? <User size={14} /> : <Bot size={14} />}</div>}
      <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.sender_type === 'user' ? 'rounded-tr-sm bg-white text-black' : message.sender_type === 'system' ? 'mx-auto border border-red-300/12 bg-red-300/6 text-red-200' : 'rounded-tl-sm border border-white/7 bg-[#0d0d0d] text-white/72'}`}>{message.content}</div>
    </div>
  );
}
