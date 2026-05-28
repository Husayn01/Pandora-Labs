import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, User, Send, MessageSquarePlus, Shield, Info,
  Trash2, Pencil, Check, X, Menu, Calendar, Mail, BarChart3, Sparkles,
} from 'lucide-react';
import { VoiceInput } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

/* ── Types ── */
interface Message {
  id: string;
  sender_type: 'user' | 'agent' | 'system';
  content: string;
  created_at: string;
  agent_name?: string;
}

interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
}

/* ── Helpers ── */
function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function groupConversations(convs: Conversation[]) {
  const today: Conversation[] = [], yesterday: Conversation[] = [], week: Conversation[] = [], older: Conversation[] = [];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - 7 * 86400000);

  convs.forEach(c => {
    const d = new Date(c.created_at);
    if (d >= startOfToday) today.push(c);
    else if (d >= startOfYesterday) yesterday.push(c);
    else if (d >= startOfWeek) week.push(c);
    else older.push(c);
  });
  return [
    { label: 'Today', items: today },
    { label: 'Yesterday', items: yesterday },
    { label: 'Previous 7 Days', items: week },
    { label: 'Older', items: older },
  ].filter(g => g.items.length > 0);
}

const SUGGESTIONS = [
  { icon: Calendar, text: 'Schedule a meeting', color: 'text-blue-400' },
  { icon: Mail, text: 'Summarize my emails', color: 'text-emerald-400' },
  { icon: BarChart3, text: 'Analyze my finances', color: 'text-amber-400' },
  { icon: Sparkles, text: 'What can you do?', color: 'text-purple-400' },
];

/* ── Component ── */
export default function ChatPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const isVoiceModeRef = useRef(false); // always current, safe inside async closures
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync with state
  useEffect(() => { isVoiceModeRef.current = isVoiceMode; }, [isVoiceMode]);

  /* ── Fetch conversations ── */
  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('conversations').select('id, title, created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) setConversations(data);
  }, [user]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  /* ── Fetch messages ── */
  useEffect(() => {
    if (!activeId || !user) return;
    (async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, sender_type, content, created_at, user_agent:user_agent_id ( catalog:catalog_agent_id (name) )')
        .eq('conversation_id', activeId).order('created_at', { ascending: true });
      if (data) setMessages(data.map((m: any) => ({ ...m, agent_name: m.user_agent?.catalog?.name })));
    })();
  }, [activeId, user]);

  /* ── Auto-scroll ── */
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isProcessing]);

  /* ── TTS ── */
  const playTTS = async (text: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error('TTS failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play().catch(() => {});
    } catch {
      // Fallback to browser TTS with best voice
      const u = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.name.includes('Google UK English Female')) || voices.find(v => v.lang.startsWith('en') && v.name.includes('Female')) || voices[0];
      if (preferred) u.voice = preferred;
      u.rate = 1.0; u.pitch = 1.0;
      window.speechSynthesis.speak(u);
    }
  };

  /* ── Send Message ── */
  const handleSend = async (text: string) => {
    if (!text.trim() || !user || isProcessing) return;
    const userMsg: Message = { id: `u-${Date.now()}`, sender_type: 'user', content: text, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsProcessing(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, userId: user.id, conversationId: activeId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Request failed');

      if (data.conversationId && !activeId) {
        setActiveId(data.conversationId);
        await loadConversations();
      }

      const agentMsg: Message = {
        id: `a-${Date.now()}`, sender_type: 'agent', content: data.reply,
        created_at: new Date().toISOString(), agent_name: data.agentName,
      };
      setMessages(prev => [...prev, agentMsg]);
      if (isVoiceModeRef.current) await playTTS(data.reply);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`, sender_type: 'system',
        content: err.message === 'Not authenticated' ? 'Session expired. Please refresh.' : `Error: ${err.message}`,
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  /* ── Conversation CRUD ── */
  const handleNew = () => { setActiveId(null); setMessages([]); setInputText(''); setSidebarOpen(false); };

  const handleRename = async (id: string) => {
    if (!editTitle.trim()) { setEditingId(null); return; }
    await supabase.from('conversations').update({ title: editTitle.trim() }).eq('id', id);
    setEditingId(null);
    await loadConversations();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('messages').delete().eq('conversation_id', id);
    await supabase.from('conversations').delete().eq('id', id);
    if (activeId === id) { setActiveId(null); setMessages([]); }
    await loadConversations();
  };

  const groups = groupConversations(conversations);

  /* ── Sidebar Content (reused for desktop + mobile) ── */
  const sidebarContent = (
    <>
      <div className="p-3 border-b border-white/5">
        <button onClick={handleNew}
          className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm font-medium text-white hover:bg-white/[0.08] transition-all cursor-pointer">
          <MessageSquarePlus size={15} /> New Chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {groups.length === 0 && (
          <p className="text-xs text-gray-600 text-center pt-8 px-3 font-light">No conversations yet.</p>
        )}
        {groups.map(g => (
          <div key={g.label}>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-medium px-3 mb-1.5">{g.label}</p>
            <div className="space-y-0.5">
              {g.items.map(c => (
                <div key={c.id}
                  className={`group relative flex items-center rounded-lg transition-all ${activeId === c.id ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`}>
                  {editingId === c.id ? (
                    <div className="flex items-center gap-1 w-full px-2 py-1.5">
                      <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(c.id); if (e.key === 'Escape') setEditingId(null); }}
                        className="flex-1 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-white/30" />
                      <button onClick={() => handleRename(c.id)} className="p-1 text-green-400 hover:text-green-300 cursor-pointer"><Check size={12} /></button>
                      <button onClick={() => setEditingId(null)} className="p-1 text-gray-500 hover:text-white cursor-pointer"><X size={12} /></button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => { setActiveId(c.id); setSidebarOpen(false); }}
                        className={`flex-1 text-left px-3 py-2 text-sm truncate cursor-pointer ${activeId === c.id ? 'text-white font-medium' : 'text-gray-400'}`}>
                        {c.title || 'New Conversation'}
                      </button>
                      <div className="hidden group-hover:flex items-center gap-0.5 pr-2">
                        <button onClick={e => { e.stopPropagation(); setEditingId(c.id); setEditTitle(c.title || ''); }}
                          className="p-1 text-gray-500 hover:text-white cursor-pointer"><Pencil size={11} /></button>
                        <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                          className="p-1 text-gray-500 hover:text-red-400 cursor-pointer"><Trash2 size={11} /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );

  /* ── Active conversation title ── */
  const activeConv = conversations.find(c => c.id === activeId);

  return (
    <div className="flex h-[calc(100vh-theme(spacing.16))] md:h-screen bg-[#050505]">

      {/* Desktop sidebar */}
      <div className="hidden md:flex w-60 flex-col border-r border-white/5 bg-[#080808]">{sidebarContent}</div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
            <motion.div initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 w-[280px] bg-[#080808] border-r border-white/5 z-50 flex flex-col md:hidden">
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">

        {/* Header */}
        <div className="h-12 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md flex items-center justify-between px-4 md:px-6 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1 text-gray-400 hover:text-white cursor-pointer"><Menu size={18} /></button>
            <Shield size={14} className="text-white/60" />
            <span className="text-sm font-medium text-white truncate max-w-[200px]">
              {activeConv?.title || 'Pandora'}
            </span>
          </div>
          {isVoiceMode && (
            <span className="flex items-center gap-1.5 text-[10px] text-cyan-400 uppercase tracking-widest font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" /> Voice
            </span>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4 pb-52">
          {messages.length === 0 ? (
            /* ── Empty state ── */
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="w-20 h-20 rounded-3xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center mb-6">
                <Bot size={32} className="text-white/50" />
              </motion.div>
              <h2 className="text-xl font-semibold text-white mb-2 tracking-tight">What can I help you with?</h2>
              <p className="text-sm text-gray-500 font-light mb-8">
                Type a message or tap the orb to speak.
              </p>
              <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm">
                {SUGGESTIONS.map((s, i) => (
                  <motion.button key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                    onClick={() => handleSend(s.text)}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-left text-sm text-gray-300 hover:bg-white/[0.07] hover:border-white/10 transition-all cursor-pointer group">
                    <s.icon size={14} className={`${s.color} shrink-0 opacity-60 group-hover:opacity-100 transition-opacity`} />
                    <span className="font-light truncate">{s.text}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Message list ── */
            <div className="max-w-2xl mx-auto space-y-5">
              {messages.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  onMouseEnter={() => setHoveredMsg(msg.id)} onMouseLeave={() => setHoveredMsg(null)}
                  className={`flex gap-3 ${msg.sender_type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

                  {msg.sender_type !== 'system' && (
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      msg.sender_type === 'user'
                        ? 'bg-white/10 border border-white/10'
                        : 'bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-white/10'
                    }`}>
                      {msg.sender_type === 'user' ? <User size={13} className="text-white/70" /> : <Bot size={13} className="text-white/70" />}
                    </div>
                  )}

                  <div className={`flex flex-col max-w-[78%] ${msg.sender_type === 'user' ? 'items-end' : 'items-start'}`}>
                    {msg.sender_type === 'agent' && msg.agent_name && (
                      <span className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 ml-0.5 font-medium">{msg.agent_name}</span>
                    )}
                    <div className={`px-4 py-3 text-sm leading-relaxed ${
                      msg.sender_type === 'user'
                        ? 'bg-white text-black rounded-2xl rounded-tr-md font-normal'
                        : msg.sender_type === 'system'
                        ? 'text-red-400/70 text-xs italic text-center w-full'
                        : 'bg-[#0e0e0e] border border-white/[0.06] text-gray-200 rounded-2xl rounded-tl-md font-light'
                    }`}>
                      {msg.content}
                    </div>
                    {hoveredMsg === msg.id && msg.sender_type !== 'system' && (
                      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="text-[10px] text-gray-600 mt-1 mx-1 font-light">
                        {timeAgo(msg.created_at)}
                      </motion.span>
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Typing indicator */}
              {isProcessing && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center shrink-0">
                    <Bot size={13} className="text-white/70" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl rounded-tl-md bg-[#0e0e0e] border border-white/[0.06]">
                    <div className="flex items-center gap-1.5">
                      {[0, 1, 2].map(i => (
                        <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400"
                          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ── Input area ── */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5 bg-gradient-to-t from-[#050505] via-[#050505]/98 to-transparent pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">

            {/* Voice mode overlay */}
            <AnimatePresence>
              {isVoiceMode && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  className="flex justify-center mb-3">
                  <span className="px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[11px] text-cyan-400 font-medium tracking-wide">
                    Voice mode active — tap the orb to stop
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input bar with integrated orb */}
            <div className={`relative flex items-center gap-2 bg-[#0a0a0a]/90 backdrop-blur-xl border rounded-2xl p-1.5 pl-2 shadow-2xl transition-all duration-300 ${
              isVoiceMode ? 'border-cyan-500/20 opacity-50 pointer-events-none' : 'border-white/[0.06] focus-within:border-white/15'
            }`}>
              {/* Orb */}
              <div className="shrink-0">
                <div className="pointer-events-auto">
                  <VoiceInput onTranscript={handleSend} onVoiceModeChange={setIsVoiceMode} autoSendDelay={2000} />
                </div>
              </div>

              {/* Divider */}
              <div className="w-px h-6 bg-white/[0.06] shrink-0" />

              {/* Text input */}
              <input type="text" value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(inputText); } }}
                placeholder={isVoiceMode ? 'Voice mode active...' : 'Message Pandora...'}
                className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none font-light min-w-0"
                disabled={isProcessing || isVoiceMode} />

              {/* Send button */}
              <motion.button onClick={() => handleSend(inputText)}
                disabled={!inputText.trim() || isProcessing || isVoiceMode}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors cursor-pointer shrink-0">
                <Send size={14} />
              </motion.button>
            </div>

            <p className="text-center mt-2.5 text-[10px] text-gray-600 font-light flex items-center justify-center gap-1">
              <Info size={9} /> Pandora can make mistakes. Verify important info.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
