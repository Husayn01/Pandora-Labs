/**
 * Dashboard Sidebar Component
 * ─────────────────────────────
 * Futuristic sidebar navigation for the protected dashboard.
 * Features icon + label nav items with active state glow.
 */

import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  Activity,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  ShieldCheck,
  PlugZap,
  CreditCard,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import { PlaceholderLogo } from '@/components/ui';

const navItems = [
  { icon: Home, label: 'Overview', path: '/dashboard' },
  { icon: MessageSquare, label: 'Talk to Pandora', path: '/dashboard/chat' },
  { icon: Activity, label: 'Operations', path: '/dashboard/operations' },
  { icon: ShieldCheck, label: 'Approvals', path: '/dashboard/approvals' },
  { icon: PlugZap, label: 'Integrations', path: '/dashboard/integrations' },
  { icon: BarChart3, label: 'Reports', path: '/dashboard/insights' },
  { icon: CreditCard, label: 'Billing', path: '/dashboard/billing' },
  { icon: Settings, label: 'Settings', path: '/dashboard/settings' },
];

export function Sidebar() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 260 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="hidden md:flex flex-col h-screen sticky top-0 bg-[#0a0a0a] border-r border-white/5 z-40"
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/5">
          <PlaceholderLogo size={36} className="text-white shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="text-base font-bold text-white whitespace-nowrap overflow-hidden tracking-tight"
              >
                Pandora<span className="text-gray-500 font-medium"> Labs</span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                  ${active
                    ? 'text-white bg-white/5 border border-white/10'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
                  }`}
              >
                {/* Active indicator */}
                {active && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r-full bg-white"
                    transition={{ duration: 0.3 }}
                  />
                )}

                <item.icon
                  size={18}
                  className={`shrink-0 transition-colors ${active ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`}
                />

                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-white/5 p-3 space-y-2">
          {/* User info */}
          <div className={`flex items-center gap-3 px-3 py-2 rounded-xl ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-[#222] border border-white/10 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {user?.email?.charAt(0).toUpperCase() || 'P'}
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="overflow-hidden"
                >
                  <p className="text-xs font-medium text-white truncate max-w-[140px]">
                    {user?.email || 'founder@pandora.ai'}
                  </p>
                  <p className="text-[10px] text-gray-500 tracking-wider uppercase mt-0.5">Business workspace</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sign out */}
          <button
            onClick={signOut}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/5 transition-all duration-200 w-full cursor-pointer ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut size={16} className="shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="whitespace-nowrap"
                >
                  Sign Out
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-full py-1.5 rounded-lg text-gray-600 hover:text-gray-300 transition-colors cursor-pointer"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </motion.aside>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0a] border-t border-white/5 rounded-t-2xl">
        <div className="flex items-center justify-around py-2">
          {navItems.slice(0, 5).map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors
                  ${active ? 'text-white' : 'text-gray-500'}`}
              >
                <item.icon size={18} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
