/**
 * PandoraOrb — Animated glowing orb component
 * ─────────────────────────────────────────────
 * The signature visual element of Pandora Labs.
 * A pulsating, gradient orb with floating animation.
 */

import { motion } from 'framer-motion';

interface PandoraOrbProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  animate?: boolean;
}

const sizes = {
  sm: 'w-12 h-12',
  md: 'w-24 h-24',
  lg: 'w-40 h-40',
  xl: 'w-64 h-64',
};

export function PandoraOrb({ size = 'md', className = '', animate = true }: PandoraOrbProps) {
  return (
    <motion.div
      className={`relative ${sizes[size]} ${className}`}
      animate={animate ? { y: [0, -12, 0] } : undefined}
      transition={animate ? { duration: 5, repeat: Infinity, ease: 'easeInOut' as const } : undefined}
    >
      {/* Outer glow */}
      <div className="absolute inset-0 rounded-full bg-pandora-500/20 blur-3xl scale-150" />

      {/* Mid glow ring */}
      <motion.div
        className="absolute inset-0 rounded-full border border-pandora-400/20"
        animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Core orb */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-pandora-400 via-pandora-600 to-pandora-900 shadow-lg shadow-pandora-500/30" />

      {/* Inner light */}
      <div className="absolute inset-[30%] rounded-full bg-gradient-to-br from-pandora-200/60 to-transparent blur-sm" />

      {/* Core bright spot */}
      <motion.div
        className="absolute inset-[40%] rounded-full bg-white/20 blur-[2px]"
        animate={{ opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.div>
  );
}
