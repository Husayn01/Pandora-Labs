/**
 * Navbar Component
 * ──────────────────
 * Static top navigation for the public landing page.
 * Sits flush with the page content — not overlaid.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { Button, PlaceholderLogo } from '@/components/ui';

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="relative z-50 bg-[#050505] border-b border-white/5"
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group shrink-0">
          <PlaceholderLogo size={44} className="group-hover:opacity-80 transition-opacity" />
          <span className="text-xl font-bold text-white tracking-tight">
            Pandora<span className="text-gray-400 font-medium"> Labs</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm font-medium text-gray-400 hover:text-white transition-colors duration-200">
            Features
          </a>
          <a href="#how-it-works" className="text-sm font-medium text-gray-400 hover:text-white transition-colors duration-200">
            How It Works
          </a>
          <a href="#testimonials" className="text-sm font-medium text-gray-400 hover:text-white transition-colors duration-200">
            Testimonials
          </a>
        </div>

        {/* CTA buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Link to="/login">
            <Button variant="ghost" size="sm">Log In</Button>
          </Link>
          <Link to="/signup">
            <Button variant="primary" size="sm">Get Started</Button>
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden text-gray-400 hover:text-white transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="md:hidden border-t border-white/5 overflow-hidden bg-[#0a0a0a]"
          >
            <div className="px-6 py-6 space-y-4">
              <a href="#features" className="block text-sm font-medium text-gray-400 hover:text-white transition-colors" onClick={() => setMobileOpen(false)}>
                Features
              </a>
              <a href="#how-it-works" className="block text-sm font-medium text-gray-400 hover:text-white transition-colors" onClick={() => setMobileOpen(false)}>
                How It Works
              </a>
              <a href="#testimonials" className="block text-sm font-medium text-gray-400 hover:text-white transition-colors" onClick={() => setMobileOpen(false)}>
                Testimonials
              </a>
              <hr className="border-white/10" />
              <div className="flex flex-col gap-2">
                <Link to="/login" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" size="md" className="w-full">Log In</Button>
                </Link>
                <Link to="/signup" onClick={() => setMobileOpen(false)}>
                  <Button variant="primary" size="md" className="w-full">Get Started</Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
