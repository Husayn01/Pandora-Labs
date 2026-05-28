/**
 * Voice Input Component
 * ──────────────────────
 * Live voice transcription with dynamic orb visual feedback.
 * Continuous listening mode: auto-sends transcript on silence.
 * Calls /api/tts for ElevenLabs greeting; falls back to browser TTS.
 * Also exports TaskProgress indicator.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mic, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onProgress?: (status: string) => void;
  onVoiceModeChange?: (active: boolean) => void;
  className?: string;
  autoSendDelay?: number;
}



export function VoiceInput({
  onTranscript,
  onProgress,
  onVoiceModeChange,
  className = '',
  autoSendDelay = 2000,
}: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [, setTranscript] = useState('');
  const [, setInterimText] = useState('');
  const [error, setError] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeakingWelcome, setIsSpeakingWelcome] = useState(false);

  const recognitionRef = useRef<any>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTextRef = useRef('');
  // ↓ Mirrors isListening for closures that can't use state
  const isListeningRef = useRef(false);

  const hasWebSpeech =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  /* ── Notify parent of voice mode changes ── */
  useEffect(() => {
    onVoiceModeChange?.(isListening);
  }, [isListening, onVoiceModeChange]);

  /* ── Sound Effects ── */
  const playSound = (type: 'on' | 'off') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      const now = ctx.currentTime;
      if (type === 'on') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      } else {
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.12);
      }
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      // Audio not critical
    }
  };

  /* ── Audio Visualization ── */
  const startAudioVisualization = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyzer = audioCtx.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);
      analyzerRef.current = analyzer;

      const dataArray = new Uint8Array(analyzer.frequencyBinCount);
      const tick = () => {
        analyzer.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(avg / 128);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      console.error('Audio visualization failed:', err);
    }
  }, []);

  const stopAudioVisualization = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  /* ── Auto-send on silence ── */
  const commitAndSend = useCallback(() => {
    const finalMsg = currentTextRef.current.trim();
    if (finalMsg) {
      onTranscript(finalMsg);
      setTranscript('');
      setInterimText('');
      currentTextRef.current = '';
    }
  }, [onTranscript]);

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      commitAndSend();
    }, autoSendDelay);
  }, [commitAndSend, autoSendDelay]);

  /* ── Core Speech Recognition ── */
  const startListeningCore = useCallback(() => {
    if (!hasWebSpeech) {
      setError('Voice input is not supported in this browser. Try Chrome.');
      return;
    }
    setError('');
    currentTextRef.current = '';
    setTranscript('');
    setInterimText('');

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
      onProgress?.('Listening...');
      startAudioVisualization();
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      if (final) {
        setTranscript(prev => {
          const updated = prev + final;
          currentTextRef.current = updated + interim;
          return updated;
        });
      } else {
        // Approximate for the ref without causing re-render
        currentTextRef.current = currentTextRef.current.replace(/\s*$/, '') + ' ' + interim;
      }
      setInterimText(interim);
      resetSilenceTimer();
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone access.');
        setIsListening(false);
        isListeningRef.current = false;
        stopAudioVisualization();
      }
      // Ignore 'no-speech' — we handle it via silence timer
    };

    recognition.onend = () => {
      // Use the ref — not the stale state value — to decide if we should restart
      if (isListeningRef.current) {
        try {
          recognition.start();
        } catch (e) {
          setIsListening(false);
          isListeningRef.current = false;
          stopAudioVisualization();
          onProgress?.('');
        }
      } else {
        stopAudioVisualization();
        onProgress?.('');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [hasWebSpeech, onProgress, startAudioVisualization, stopAudioVisualization, resetSilenceTimer]);

  /* ── Toggle Listening ── */
  const toggleListening = useCallback(async () => {
    if (isListening) {
      // Turn OFF
      isListeningRef.current = false;
      setIsListening(false);
      playSound('off');
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) { /* ignore */ }
      }
      stopAudioVisualization();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      commitAndSend();
    } else {
      // Turn ON — play ElevenLabs greeting first
      playSound('on');
      setIsSpeakingWelcome(true);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ text: "Hi, I'm Pandora. How can I help you today?" }),
        });
        if (!res.ok) throw new Error('TTS failed');

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        audio.onended = () => {
          setIsSpeakingWelcome(false);
          URL.revokeObjectURL(url);
          startListeningCore();
        };
        audio.onerror = () => {
          setIsSpeakingWelcome(false);
          startListeningCore();
        };
        audio.play();
      } catch (_) {
        // Fallback to browser TTS with best available voice
        setIsSpeakingWelcome(false);
        const msg = new SpeechSynthesisUtterance("Hi, I'm Pandora. How can I help you today?");
        msg.lang = 'en-US';
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.name.includes('Google UK English Female'))
          || voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'))
          || voices.find(v => v.lang.startsWith('en'))
          || voices[0];
        if (preferred) msg.voice = preferred;
        msg.rate = 1.0;
        msg.pitch = 1.0;
        msg.onend = () => startListeningCore();
        msg.onerror = () => startListeningCore();
        window.speechSynthesis.speak(msg);
      }
    }
  }, [isListening, startListeningCore, stopAudioVisualization, commitAndSend]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (_) { /* ignore */ } }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      stopAudioVisualization();
      window.speechSynthesis.cancel();
    };
  }, [stopAudioVisualization]);



  return (
    <div className={`relative flex items-center ${className}`}>
      {/* ── Compact Orb ── */}
      <button
        type="button"
        className="relative group cursor-pointer bg-transparent border-0 p-0"
        onClick={toggleListening}
        aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
      >

        {/* Glow */}
        {(isListening || isSpeakingWelcome) && (
          <motion.div className="absolute -inset-2 rounded-full blur-xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.4), rgba(6,182,212,0.3), transparent 70%)' }}
            animate={{ scale: isListening ? 1 + audioLevel * 1.5 : [1, 1.08, 1], opacity: isListening ? 0.6 + audioLevel * 0.4 : [0.4, 0.65, 0.4] }}
            transition={isListening ? { duration: 0.08 } : { duration: 2, repeat: Infinity, ease: 'easeInOut' }} />
        )}

        {/* Ring */}
        {isListening && (
          <motion.div className="absolute -inset-1 rounded-full pointer-events-none"
            style={{ background: 'conic-gradient(from 0deg, rgba(168,85,247,0.5) 0%, rgba(6,182,212,0.5) 50%, transparent 100%)' }}
            animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }} />
        )}

        {/* Body */}
        <motion.div
          className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center overflow-hidden transition-all duration-200 ${
            isListening ? 'bg-black shadow-[0_0_24px_rgba(168,85,247,0.5)]'
            : isSpeakingWelcome ? 'bg-[#111] border border-white/20'
            : 'bg-[#151515] border border-white/[0.08] hover:border-white/20 hover:bg-[#1a1a1a]'
          }`}
          animate={isListening ? { scale: 1 + audioLevel * 0.1 } : { scale: 1 }}
          transition={{ type: 'spring', bounce: 0.3, duration: 0.12 }}>

          {isSpeakingWelcome ? (
            <div className="flex gap-0.5 items-end h-4">
              {[0, 1, 2, 3].map(i => (
                <motion.div key={i} className="w-0.5 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full"
                  animate={{ height: ['4px', `${6 + i * 3}px`, '4px'] }}
                  transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' }} />
              ))}
            </div>
          ) : isListening ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div className="absolute inset-0 opacity-60" animate={{ rotate: -360 }}
                transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                style={{ background: 'conic-gradient(from 0deg, transparent, rgba(168,85,247,0.9) 25%, transparent 50%, rgba(6,182,212,0.9) 75%, transparent)' }} />
              <motion.div className="absolute inset-1.5 rounded-full bg-gradient-to-tr from-pink-500/80 to-cyan-500/80"
                animate={{ scale: [0.85, 1 + audioLevel * 0.4, 0.85], opacity: [0.7, 1, 0.7] }} transition={{ duration: 0.1 }} />
              <motion.div className="absolute inset-3 rounded-full bg-white/90 blur-[2px]"
                animate={{ scale: [0.7, 1 + audioLevel * 0.8, 0.7] }} transition={{ duration: 0.1 }} />
            </div>
          ) : (
            <Mic size={16} className="text-gray-400 group-hover:text-white transition-colors" />
          )}
        </motion.div>
      </button>

      {/* Error */}
      {error && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] text-red-400 whitespace-nowrap bg-red-500/10 px-2 py-0.5 rounded-full">
          {error}
        </motion.p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Task Progress Indicator
   ───────────────────────────────────────────── */

interface ProgressStep {
  label: string;
  status: 'pending' | 'active' | 'done';
}

interface TaskProgressProps {
  steps: ProgressStep[];
  className?: string;
}

export function TaskProgress({ steps, className = '' }: TaskProgressProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-3 rounded-xl bg-[#0a0a0a] border border-white/5 ${className}`}
    >
      <div className="space-y-2">
        {steps.map((step, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.15 }}
            className="flex items-center gap-2.5"
          >
            {step.status === 'active' ? (
              <Loader2 size={12} className="text-white animate-spin shrink-0" />
            ) : step.status === 'done' ? (
              <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              </div>
            ) : (
              <div className="w-3 h-3 rounded-full bg-white/5 border border-white/10 shrink-0" />
            )}
            <span className={`text-xs font-light ${
              step.status === 'active' ? 'text-white' : step.status === 'done' ? 'text-gray-400' : 'text-gray-600'
            }`}>
              {step.label}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
