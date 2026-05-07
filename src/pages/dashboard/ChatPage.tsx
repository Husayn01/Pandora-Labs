import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, User, Send, Loader2, MessageSquarePlus, Shield, Info } from 'lucide-react';
import { VoiceInput, TaskProgress } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface Message {
  id: string;
  sender_type: 'user' | 'agent' | 'system';
  content: string;
  created_at: string;
  agent_name?: string;
  agent_icon?: string;
}

interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
}

export default function ChatPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch past conversations
  useEffect(() => {
    if (!user) return;
    const fetchConversations = async () => {
      const { data } = await supabase
        .from('conversations')
        .select('id, title, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (data) setConversations(data);
    };
    fetchConversations();
  }, [user]);

  // Fetch messages when conversation changes
  useEffect(() => {
    if (!activeConversationId || !user) return;
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select(`
          id, sender_type, content, created_at,
          user_agent:user_agent_id (
            catalog:catalog_agent_id (name, icon)
          )
        `)
        .eq('conversation_id', activeConversationId)
        .order('created_at', { ascending: true });

      if (data) {
        setMessages(data.map((m: any) => ({
          ...m,
          agent_name: m.user_agent?.catalog?.name,
          agent_icon: m.user_agent?.catalog?.icon,
        })));
      }
      scrollToBottom();
    };
    fetchMessages();
  }, [activeConversationId, user]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !user || isProcessing) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      sender_type: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, newMessage]);
    setInputText('');
    setIsProcessing(true);
    setProgressStatus('Thinking...');

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text,
          userId: user.id,
          conversationId: activeConversationId,
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to send message');

      // Update active conversation if it was newly created
      if (data.conversationId && !activeConversationId) {
        setActiveConversationId(data.conversationId);
        // Refresh conversations list
        const { data: convs } = await supabase
          .from('conversations')
          .select('id, title, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (convs) setConversations(convs);
      }

      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender_type: 'agent',
        content: data.reply,
        created_at: new Date().toISOString(),
        agent_name: data.agentName,
        agent_icon: data.agentIcon,
      };

      setMessages(prev => [...prev, agentMessage]);

      // Play TTS for the agent's response
      try {
        const ttsResponse = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: data.reply })
        });
        
        if (ttsResponse.ok) {
          const blob = await ttsResponse.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.onended = () => URL.revokeObjectURL(url);
          audio.play().catch(e => console.warn('Audio auto-play blocked by browser:', e));
        }
      } catch (e) {
        console.error('Failed to play TTS for agent response:', e);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender_type: 'system',
        content: 'Error: Could not reach the Pandora Router.',
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setIsProcessing(false);
      setProgressStatus('');
    }
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setInputText('');
  };

  return (
    <div className="flex h-[calc(100vh-theme(spacing.16))] md:h-screen bg-[#050505]">
      
      {/* Sidebar - Conversation History (Hidden on mobile for now) */}
      <div className="hidden md:flex w-64 flex-col border-r border-white/5 bg-[#0a0a0a]">
        <div className="p-4 border-b border-white/5">
          <button 
            onClick={handleNewChat}
            className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl bg-white/5 text-sm font-medium text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <MessageSquarePlus size={16} />
            New Conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => setActiveConversationId(conv.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm truncate transition-colors cursor-pointer ${
                activeConversationId === conv.id
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-300'
              }`}
            >
              {conv.title || 'New Conversation'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        
        {/* Header */}
        <div className="h-14 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md flex items-center px-6 shrink-0 z-10">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-white" />
            <span className="text-sm font-medium text-white">Pandora Router</span>
            <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] text-gray-300 uppercase tracking-widest ml-2">Core Active</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-32">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-[#111] border border-white/10 flex items-center justify-center mb-6">
                <Bot size={32} className="text-white opacity-50" />
              </div>
              <h2 className="text-xl font-medium text-white mb-2 tracking-tight">How can I help you?</h2>
              <p className="text-sm text-gray-400 font-light mb-8">
                Send a message or tap the mic. I'll route your request to the right agent in your swarm.
              </p>
              
              <div className="w-full space-y-2 text-left">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-3 text-center">Suggestions</p>
                {['"Schedule a meeting with John for tomorrow"', '"What is my revenue this week?"', '"Reply to customer support tickets"'].map(s => (
                  <button key={s} onClick={() => handleSendMessage(s.replace(/"/g, ''))} className="block w-full p-3 rounded-xl bg-white/5 border border-white/5 text-sm text-gray-300 hover:bg-white/10 transition-colors cursor-pointer text-center font-light">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              <AnimatePresence initial={false}>
                {messages.map((msg, i) => (
                  <motion.div
                    key={msg.id || i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-4 ${msg.sender_type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {msg.sender_type !== 'system' && (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 ${
                        msg.sender_type === 'user' ? 'bg-[#222] border border-white/10' : 'bg-[#151515] border border-white/20'
                      }`}>
                        {msg.sender_type === 'user' ? (
                          <User size={14} className="text-white" />
                        ) : (
                          <Bot size={14} className="text-white" />
                        )}
                      </div>
                    )}
                    
                    <div className={`flex flex-col max-w-[80%] ${msg.sender_type === 'user' ? 'items-end' : 'items-start'}`}>
                      {msg.sender_type === 'agent' && msg.agent_name && (
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 ml-1">
                          {msg.agent_name}
                        </span>
                      )}
                      
                      <div className={`p-4 rounded-2xl text-sm font-light leading-relaxed ${
                        msg.sender_type === 'user' 
                          ? 'bg-white text-black rounded-tr-sm' 
                          : msg.sender_type === 'system'
                          ? 'bg-transparent text-gray-500 text-xs text-center w-full my-2'
                          : 'bg-[#111] border border-white/10 text-gray-200 rounded-tl-sm'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {isProcessing && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#151515] border border-white/20 flex items-center justify-center shrink-0 mt-1">
                    <Bot size={14} className="text-white" />
                  </div>
                  <div className="flex items-center mt-1">
                    <TaskProgress 
                      steps={[
                        { label: progressStatus || 'Processing...', status: 'active' }
                      ]} 
                      className="bg-transparent border-none p-0"
                    />
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent pointer-events-none">
          <div className="max-w-3xl mx-auto relative pointer-events-auto">
            
            {/* Status indicator */}
            <div className="absolute -top-16 left-0 right-0 flex justify-center pointer-events-none">
              {progressStatus && (
                <div className="px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs font-medium text-white shadow-xl backdrop-blur-md flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" />
                  {progressStatus}
                </div>
              )}
            </div>

            {/* Voice Orb - Centered prominently */}
            <div className="flex justify-center mb-4 relative z-20">
              <VoiceInput 
                onTranscript={handleSendMessage} 
                onProgress={(status) => setProgressStatus(status)}
                autoSendDelay={2000}
              />
            </div>
            
            {/* Text Input Fallback */}
            <div className="relative flex items-center bg-[#111] border border-white/10 rounded-2xl p-2 pl-4 focus-within:border-white/30 transition-colors shadow-2xl z-10">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(inputText);
                  }
                }}
                placeholder="Or type a message to Pandora..."
                className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none font-light"
                disabled={isProcessing}
              />
              
              <button
                onClick={() => handleSendMessage(inputText)}
                disabled={!inputText.trim() || isProcessing}
                className="w-10 h-10 ml-2 rounded-xl bg-white text-black flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors cursor-pointer shrink-0"
              >
                <Send size={16} />
              </button>
            </div>
            
            <div className="text-center mt-3 flex items-center justify-center gap-1.5 text-[10px] text-gray-500 font-light">
              <Info size={10} />
              Pandora can make mistakes. Check important information.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
