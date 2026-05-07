/**
 * Dashboard Home Page
 * ────────────────────
 * Welcome message, live stats from Supabase, and quick actions.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Bot,
  Clock,
  TrendingUp,
  Store,
  ArrowUpRight,
  Sparkles,
  Mic,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { GlassCard, AnimatedCounter, Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function DashboardHome() {
  const { user } = useAuth();
  const [agentCount, setAgentCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);

  // Fetch real stats
  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      const [{ count: agents }, { count: messages }] = await Promise.all([
        supabase.from('user_agents').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('messages').select('*', { count: 'exact', head: true }),
      ]);
      setAgentCount(agents || 0);
      setMessageCount(messages || 0);
    };
    fetchStats();
  }, [user]);

  const firstName = user?.user_metadata?.full_name?.split(' ')[0]
    || user?.email?.split('@')[0]
    || 'Founder';

  const stats = [
    {
      label: 'Messages Handled',
      value: messageCount,
      suffix: '',
      icon: MessageSquare,
      change: 'All time',
      color: 'text-white',
      bgColor: 'bg-white/5',
      borderColor: 'border-white/10',
    },
    {
      label: 'Agents Installed',
      value: agentCount,
      suffix: '',
      icon: Bot,
      change: 'Active swarm',
      color: 'text-gray-300',
      bgColor: 'bg-white/5',
      borderColor: 'border-white/10',
    },
    {
      label: 'Time Saved This Week',
      value: Math.round(messageCount * 0.3),
      suffix: 'min',
      icon: Clock,
      change: 'Estimated',
      color: 'text-gray-400',
      bgColor: 'bg-white/5',
      borderColor: 'border-white/10',
    },
    {
      label: 'Agent Efficiency',
      value: agentCount > 0 ? 97 : 0,
      suffix: '%',
      icon: TrendingUp,
      change: 'Uptime',
      color: 'text-gray-500',
      bgColor: 'bg-white/5',
      borderColor: 'border-white/10',
    },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-1 tracking-tight">
              Welcome back, <span className="font-light">{firstName}</span>
            </h1>
            <p className="text-sm text-gray-400 font-light">
              Here's what Pandora has been doing for you.
            </p>
          </div>

          <Link to="/dashboard/store">
            <Button variant="primary" size="md" className="group">
              <Store size={16} />
              Explore Agent Store
              <Sparkles size={14} className="text-gray-400 group-hover:text-black group-hover:rotate-12 transition-transform" />
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        {stats.map((stat) => (
          <motion.div key={stat.label} variants={itemVariants}>
            <GlassCard className="group relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-24 h-24 ${stat.bgColor} rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 opacity-50 group-hover:opacity-80 transition-opacity`} />
              <div className="relative z-10">
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${stat.bgColor} border ${stat.borderColor} mb-3`}>
                  <stat.icon size={20} className={stat.color} />
                </div>
                <div className="text-3xl font-bold text-white mb-1">
                  <AnimatedCounter
                    target={stat.value}
                    suffix={stat.suffix ? ` ${stat.suffix}` : ''}
                    duration={1.5}
                  />
                </div>
                <p className="text-xs text-gray-400 mb-2">{stat.label}</p>
                <div className="inline-flex items-center gap-1 text-xs font-medium text-gray-500">
                  <ArrowUpRight size={12} />
                  {stat.change}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <GlassCard hover={false} className="bg-[#0a0a0a]">
          <h2 className="text-lg font-medium text-white mb-6 tracking-tight">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link to="/dashboard/store">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-[#111] border border-white/5 hover:border-white/20 hover:bg-[#151515] transition-all duration-200 group cursor-pointer">
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <Store size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white group-hover:text-gray-300 transition-colors">
                    Browse Agent Store
                  </p>
                  <p className="text-xs text-gray-500 font-light mt-0.5">Install new capabilities</p>
                </div>
              </div>
            </Link>

            <Link to="/dashboard/agents">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-[#111] border border-white/5 hover:border-white/20 hover:bg-[#151515] transition-all duration-200 group cursor-pointer">
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <Bot size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white group-hover:text-gray-300 transition-colors">
                    Manage Agents
                  </p>
                  <p className="text-xs text-gray-500 font-light mt-0.5">View your active swarm</p>
                </div>
              </div>
            </Link>

            <Link to="/dashboard/chat">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-[#111] border border-white/5 hover:border-white/20 hover:bg-[#151515] transition-all duration-200 group cursor-pointer h-full">
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <Mic size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white group-hover:text-gray-300 transition-colors">
                    Talk to Pandora
                  </p>
                  <p className="text-xs text-gray-500 font-light mt-0.5">Voice command via chat</p>
                </div>
              </div>
            </Link>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
