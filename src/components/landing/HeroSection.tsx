import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Zap } from 'lucide-react';
import { Button, ParticleField } from '@/components/ui';

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden py-16 px-4 bg-[#050505]">
      {/* Background effects */}
      <ParticleField particleCount={20} />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 w-full max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12">
        
        {/* Left Content */}
        <div className="w-full md:w-1/2 text-left z-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-gray-300 text-xs font-medium mb-8 uppercase tracking-wider"
          >
            <Zap size={12} className="text-white" />
            AI Operations Swarm
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="text-5xl sm:text-6xl md:text-8xl font-thin leading-[1.1] tracking-tight mb-6 uppercase"
          >
            New <br/>
            <span className="font-medium">Digital</span> <br/>
            Universe
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="text-lg text-gray-400 max-w-lg mb-10 font-light"
          >
            Pandora is an autonomous AI swarm that handles your startup's operations — lead qualification, 
            customer support, invoicing, and more.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="flex flex-col sm:flex-row items-start gap-4"
          >
            <Link to="/signup">
              <Button variant="primary" size="lg" className="group uppercase tracking-widest text-xs">
                Get Started
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="outline" size="lg" className="uppercase tracking-widest text-xs">
                Discover
              </Button>
            </a>
          </motion.div>
        </div>

        {/* Right Image */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="w-full md:w-1/2 relative h-[500px] md:h-[700px]"
        >
          {/* Fades for blending the image into the background */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/20 to-transparent z-10" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-transparent to-transparent z-10" />
          <div className="absolute inset-0 bg-gradient-to-l from-[#050505]/50 via-transparent to-transparent z-10" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-transparent to-transparent z-10" />
          
          <img 
            src="/images/hero_character.png" 
            alt="Pandora AI" 
            className="absolute inset-0 w-full h-full object-contain object-right z-0 mix-blend-lighten opacity-90 grayscale"
          />
        </motion.div>

      </div>
    </section>
  );
}
