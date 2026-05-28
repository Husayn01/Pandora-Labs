/**
 * Agent Store Page
 * ────────────────
 * Browse and install pre-built AI agents from the Pandora catalog.
 * Agents appear as cards with install/installed state.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Brain,
  Headphones,
  Calendar,
  Receipt,
  BarChart3,
  Search,
  Check,
  Download,
  Loader2,
  Sparkles,
  X,
  Upload,
  FileText,
  Lock,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { GlassCard, Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

/* ── Icon map ── */
const iconMap: Record<string, LucideIcon> = {
  Brain, Bot, Headphones, Calendar, Receipt, BarChart3,
};

/* ── Category colors ── */
const categoryBadge: Record<string, string> = {
  core: 'bg-white/10 text-white border-white/20',
  communication: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  productivity: 'bg-green-500/10 text-green-400 border-green-500/20',
  finance: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  analytics: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  general: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

interface CatalogAgent {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  type: string;
  capabilities: string[];
  required_connectors: string[];
  is_default: boolean;
  is_premium: boolean;
}

interface UserAgent {
  id: string;
  catalog_agent_id: string;
}

export default function AgentStorePage() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<CatalogAgent[]>([]);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [installing, setInstalling] = useState<string | null>(null);
  const [installWizard, setInstallWizard] = useState<CatalogAgent | null>(null);

  const fetchData = async () => {
    if (!user) return;
    try {
      const [{ data: agents }, { data: installed }] = await Promise.all([
        supabase.from('agent_catalog').select('*').order('sort_order'),
        supabase.from('user_agents').select('id, catalog_agent_id').eq('user_id', user.id),
      ]);
      setCatalog(agents || []);
      setInstalledIds(new Set((installed || []).map((a: UserAgent) => a.catalog_agent_id)));
    } catch (err) {
      console.error('Error fetching store data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleQuickInstall = async (agent: CatalogAgent) => {
    if (!user || agent.is_default) return;

    // If agent has required connectors, open the wizard instead
    if (agent.required_connectors.length > 0 || agent.type === 'support') {
      setInstallWizard(agent);
      return;
    }

    setInstalling(agent.id);
    try {
      const { error } = await supabase.from('user_agents').insert({
        user_id: user.id,
        catalog_agent_id: agent.id,
      });
      if (error) throw error;
      await fetchData();
    } catch (err: any) {
      console.error('Install error:', err);
      alert(err.message || 'Failed to install agent');
    } finally {
      setInstalling(null);
    }
  };

  // Derive unique categories from catalog (excluding 'core' which is the Router)
  const categories = ['all', ...Array.from(new Set(catalog.filter(a => !a.is_default).map(a => a.category)))];

  const filtered = catalog.filter(
    (a) =>
      !a.is_default &&
      (selectedCategory === 'all' || a.category === selectedCategory) &&
      (a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.description?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-white/50" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-1 tracking-tight">
          Agent Store
        </h1>
        <p className="text-sm text-gray-400 font-light">
          Browse and install pre-built AI agents to extend Pandora's capabilities.
        </p>
      </motion.div>

      {/* Search & Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mb-8 space-y-4"
      >
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-full bg-[#111] border border-white/10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-white/30 transition-all duration-300"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 cursor-pointer capitalize ${
                selectedCategory === cat
                  ? 'bg-white text-black border-white'
                  : `${categoryBadge[cat] || 'bg-white/5 text-gray-400 border-white/10'} hover:border-white/30`
              }`}
            >
              {cat === 'all' ? 'All Agents' : cat}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Agent Grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {filtered.map((agent, index) => {
          const Icon = iconMap[agent.icon] || Bot;
          const isInstalled = installedIds.has(agent.id);
          const isInstallingThis = installing === agent.id;

          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
            >
              <GlassCard className="group bg-[#0a0a0a] flex flex-col h-full">
                {/* Top row */}
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-[#151515] border border-white/10 flex items-center justify-center group-hover:border-white/20 transition-colors">
                    <Icon size={22} className="text-white" />
                  </div>
                  <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${categoryBadge[agent.category] || categoryBadge.general}`}>
                    {agent.category}
                  </span>
                </div>

                {/* Info */}
                <h3 className="text-base font-semibold text-white mb-1 tracking-tight">
                  {agent.name}
                </h3>
                <p className="text-xs text-gray-400 mb-4 line-clamp-2 font-light flex-1">
                  {agent.description}
                </p>

                {/* Capabilities */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {(agent.capabilities || []).slice(0, 3).map((cap: string) => (
                    <span key={cap} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/5">
                      {cap.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>

                {/* Required connectors warning */}
                {agent.required_connectors.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-400/80 mb-3">
                    <Lock size={10} />
                    Requires: {agent.required_connectors.map((c: string) => c.replace(/_/g, ' ')).join(', ')}
                  </div>
                )}

                {/* Action */}
                <div className="pt-3 border-t border-white/5">
                  {isInstalled ? (
                    <button className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 text-gray-400 text-xs font-medium cursor-default">
                      <Check size={14} />
                      Installed
                    </button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full justify-center"
                      onClick={() => handleQuickInstall(agent)}
                      disabled={isInstallingThis}
                    >
                      {isInstallingThis ? (
                        <><Loader2 size={14} className="animate-spin" /> Installing...</>
                      ) : (
                        <><Download size={14} /> Install Agent</>
                      )}
                    </Button>
                  )}
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </motion.div>

      {filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <Bot size={40} className="mx-auto text-white/20 mb-4" />
          <p className="text-sm text-gray-400">No agents match your search.</p>
        </motion.div>
      )}

      {/* Install Wizard Modal */}
      <AnimatePresence>
        {installWizard && (
          <InstallWizardModal
            agent={installWizard}
            onClose={() => setInstallWizard(null)}
            onSuccess={() => { setInstallWizard(null); fetchData(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Install Wizard Modal
   ───────────────────────────────────────────── */

function InstallWizardModal({
  agent,
  onClose,
  onSuccess,
}: {
  agent: CatalogAgent;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [customPrompt, setCustomPrompt] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isRagAgent = agent.type === 'support';
  const hasConnectors = agent.required_connectors.length > 0;

  const getAccessToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Session expired. Please sign in again.');
    return session.access_token;
  };

  const handleConnectorAuthorize = async (connector: string) => {
    if (!user) return;

    const endpoints: Record<string, string> = {
      google_calendar: '/api/connectors/google-calendar',
      gmail: '/api/connectors/gmail',
      notion: '/api/connectors/notion',
    };

    const endpoint = endpoints[connector];
    if (!endpoint) {
      setError(`Connector for ${connector.replace(/_/g, ' ')} is not implemented yet.`);
      return;
    }

    setError('');

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`${endpoint}?action=authorize`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();

      if (!response.ok || !data.authUrl) {
        throw new Error(data.error || 'Failed to start OAuth flow');
      }

      window.location.href = data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect service');
    }
  };

  // Build steps
  const steps: { title: string; key: string }[] = [
    { title: 'Review', key: 'review' },
  ];
  if (hasConnectors) steps.push({ title: 'Connect', key: 'connectors' });
  if (isRagAgent) steps.push({ title: 'Knowledge', key: 'knowledge' });
  steps.push({ title: 'Customize', key: 'customize' });
  steps.push({ title: 'Install', key: 'confirm' });

  const handleInstall = async () => {
    if (!user) return;
    setIsSubmitting(true);
    setError('');

    try {
      const accessToken = await getAccessToken();
      // 1. Install agent
      const { data: userAgent, error: installError } = await supabase
        .from('user_agents')
        .insert({
          user_id: user.id,
          catalog_agent_id: agent.id,
          custom_system_prompt: customPrompt || null,
        })
        .select()
        .single();

      if (installError) throw installError;

      // 2. Upload knowledge files (for RAG agents)
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${user.id}/${userAgent.id}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('knowledge_files')
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        const { data: fileData, error: fileDbError } = await supabase
          .from('agent_knowledge_files')
          .insert({
            user_agent_id: userAgent.id,
            user_id: user.id,
            file_name: file.name,
            storage_path: filePath,
            file_type: file.type,
            file_size: file.size,
            status: 'processing',
          })
          .select()
          .single();

        if (fileDbError) throw fileDbError;

        // Trigger processing
        fetch('/api/process-knowledge', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            fileId: fileData.id,
            agentId: userAgent.id,
            userId: user.id,
          }),
        }).catch(console.error);
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Installation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const Icon = iconMap[agent.icon] || Bot;
  const currentStep = steps[step];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={!isSubmitting ? onClose : undefined} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 max-h-[90vh] overflow-y-auto"
      >
        {!isSubmitting && (
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors cursor-pointer">
            <X size={20} />
          </button>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#111] border border-white/10 flex items-center justify-center">
            <Icon size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-white tracking-tight">Install {agent.name}</h2>
            <p className="text-xs text-gray-400 font-light">Step {step + 1} of {steps.length} — {currentStep.title}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 mb-6">
          {steps.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-white' : 'bg-white/10'}`} />
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        {/* Step Content */}
        <div className="min-h-[200px] mb-6">
          {currentStep.key === 'review' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300 font-light leading-relaxed">{agent.description}</p>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Capabilities</p>
                <div className="flex flex-wrap gap-1.5">
                  {agent.capabilities.map((c: string) => (
                    <span key={c} className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-gray-300 border border-white/5">
                      {c.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
              {hasConnectors && (
                <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 text-xs text-amber-300">
                  <Lock size={12} className="inline mr-1.5" />
                  This agent requires: {agent.required_connectors.map((c: string) => c.replace(/_/g, ' ')).join(', ')}
                </div>
              )}
            </div>
          )}

          {currentStep.key === 'connectors' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300 font-light">Connect the required services for this agent to function:</p>
              {agent.required_connectors.map((connector: string) => (
                <div key={connector} className="flex items-center justify-between p-4 rounded-xl bg-[#111] border border-white/10">
                  <div className="flex items-center gap-3">
                    <Calendar size={18} className="text-white" />
                    <div>
                      <p className="text-sm text-white font-medium">{connector.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                      <p className="text-[10px] text-gray-500">OAuth connection</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleConnectorAuthorize(connector)}
                  >
                    Connect
                  </Button>
                </div>
              ))}
              <p className="text-[10px] text-gray-500">You can connect services later from Settings. Skipping is okay for now.</p>
            </div>
          )}

          {currentStep.key === 'knowledge' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300 font-light">
                Upload documents for your knowledge base. The agent will use these to answer questions.
              </p>
              <div className="relative border border-dashed rounded-xl p-6 text-center border-white/20 hover:border-white/40 bg-[#111] transition-colors cursor-pointer">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.txt,.md,.csv"
                  onChange={(e) => e.target.files && setFiles(Array.from(e.target.files))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload size={24} className="mx-auto text-gray-500 mb-2" />
                <p className="text-sm text-gray-300 font-light">
                  Drag & drop or <span className="text-white font-medium">browse</span>
                </p>
                <p className="text-[10px] text-gray-600">PDF, TXT, MD, CSV - up to 10 MB</p>
              </div>
              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg p-2 px-3 text-xs text-gray-300">
                      <div className="flex items-center gap-2 truncate">
                        <FileText size={14} className="text-gray-400 shrink-0" />
                        <span className="truncate">{file.name}</span>
                      </div>
                      <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400 ml-2">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-gray-500">You can upload more files later from the agent settings.</p>
            </div>
          )}

          {currentStep.key === 'customize' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300 font-light">
                Optionally customize how this agent behaves. Leave blank to use the default.
              </p>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-400">Custom System Prompt</label>
                <textarea
                  placeholder="e.g. Always respond in a friendly Nigerian tone. Reference our company as 'TechHub NG'..."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl bg-[#111] border border-white/10 text-white placeholder-gray-500 transition-all duration-300 focus:outline-none focus:border-white/30 resize-none text-sm font-light"
                />
              </div>
            </div>
          )}

          {currentStep.key === 'confirm' && (
            <div className="space-y-4 text-center py-4">
              <div className="w-16 h-16 rounded-2xl bg-[#111] border border-white/10 flex items-center justify-center mx-auto">
                <Icon size={28} className="text-white" />
              </div>
              <h3 className="text-lg font-medium text-white">Ready to Install</h3>
              <p className="text-sm text-gray-400 font-light">
                <strong className="text-white">{agent.name}</strong> will be added to your agent swarm.
                {files.length > 0 && ` ${files.length} knowledge file(s) will be processed.`}
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 0 ? (
            <Button variant="ghost" size="md" onClick={() => setStep(step - 1)} disabled={isSubmitting} className="flex-1">
              Back
            </Button>
          ) : (
            <Button variant="ghost" size="md" onClick={onClose} disabled={isSubmitting} className="flex-1">
              Cancel
            </Button>
          )}

          {step < steps.length - 1 ? (
            <Button variant="primary" size="md" onClick={() => setStep(step + 1)} className="flex-1 group">
              Next <ArrowRight size={14} />
            </Button>
          ) : (
            <Button variant="primary" size="md" onClick={handleInstall} disabled={isSubmitting} className="flex-1 group">
              {isSubmitting ? (
                <><Loader2 size={16} className="animate-spin" /> Installing...</>
              ) : (
                <><Sparkles size={16} className="group-hover:rotate-12 transition-transform" /> Install Agent</>
              )}
            </Button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
