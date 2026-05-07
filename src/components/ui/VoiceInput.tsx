/**
 * Voice Input Component
 * ──────────────────────
 * Live voice transcription with visual feedback (Dynamic Orb).
 * Uses Web Speech API for continuous listening, auto-sends on pause.
 * Includes AudioContext sound effects and SpeechSynthesis welcome.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, Loader2 } from 'lucide-react';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onProgress?: (status: string) => void;
  className?: string;
  autoSendDelay?: number; // ms of silence before auto-sending
}

type SupportedLang = 'en-US' | 'ha-NG' | 'ig-NG' | 'yo-NG';

const LANGUAGES: { code: SupportedLang; name: string; flag: string }[] = [
  { code: 'en-US', name: 'English', flag: '🇬🇧' },
  { code: 'ha-NG', name: 'Hausa', flag: '🇳🇬' },
  { code: 'ig-NG', name: 'Igbo', flag: '🇳🇬' },
  { code: 'yo-NG', name: 'Yoruba', flag: '🇳🇬' },
];

export function VoiceInput({ onTranscript, onProgress, className = '', autoSendDelay = 2000 }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [selectedLang, setSelectedLang] = useState<SupportedLang>('en-US');
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [error, setError] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeakingWelcome, setIsSpeakingWelcome] = useState(false);

  const recognitionRef = useRef<any>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // To track the current accumulated text in a mutable ref so the timeout callback sees it
  const currentTextRef = useRef('');

  // Check if Web Speech API is available
  const hasWebSpeech = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  /* ─────────────────────────────────────────────
     Sound Effects
     ───────────────────────────────────────────── */
  const playSound = (type: 'on' | 'off') => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      
      const now = ctx.currentTime;
      if (type === 'on') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else {
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (e) {
      console.warn('Audio feedback failed:', e);
    }
  };

  /* ─────────────────────────────────────────────
     Audio Visualization (The Orb)
     ───────────────────────────────────────────── */
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
      const updateLevel = () => {
        analyzer.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(avg / 128); // Normalize to 0-2
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err) {
      console.error('Audio visualization failed:', err);
    }
  }, []);

  const stopAudioVisualization = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  /* ─────────────────────────────────────────────
     Auto-Send Logic
     ───────────────────────────────────────────── */
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
      // If we've been silent for `autoSendDelay`, send what we have
      commitAndSend();
    }, autoSendDelay);
  }, [commitAndSend, autoSendDelay]);

  /* ─────────────────────────────────────────────
     Speech Recognition Core
     ───────────────────────────────────────────── */
  const startListeningCore = useCallback(() => {
    if (!hasWebSpeech) {
      setError('Voice input is not supported in this browser.');
      return;
    }
    setError('');

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = selectedLang;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
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
        currentTextRef.current = transcript + interim;
      }
      
      setInterimText(interim);
      resetSilenceTimer(); // Reset the auto-send timer whenever we hear something
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech') {
        setError(`Speech error: ${event.error}`);
        setIsListening(false);
        stopAudioVisualization();
      }
    };

    recognition.onend = () => {
      // If still supposed to be listening (continuous mode), restart it
      if (isListening) {
        try {
          recognition.start();
        } catch (e) {
          setIsListening(false);
          stopAudioVisualization();
        }
      } else {
        stopAudioVisualization();
        onProgress?.('');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [selectedLang, hasWebSpeech, onProgress, startAudioVisualization, stopAudioVisualization, isListening, transcript, resetSilenceTimer]);

  /* ─────────────────────────────────────────────
     Voice Mode Toggle
     ───────────────────────────────────────────── */
  const toggleListening = useCallback(() => {
    if (isListening) {
      // Turn OFF
      setIsListening(false);
      playSound('off');
      if (recognitionRef.current) recognitionRef.current.stop();
      stopAudioVisualization();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      commitAndSend(); // send whatever was left
    } else {
      // Turn ON
      playSound('on');
      setIsSpeakingWelcome(true);
      
      // Speak welcome message first
      const msg = new SpeechSynthesisUtterance("Hi, I'm Pandora. How can I help you today?");
      msg.lang = 'en-US'; // always greet in English for now
      msg.rate = 1.1;
      
      msg.onend = () => {
        setIsSpeakingWelcome(false);
        startListeningCore();
      };
      
      msg.onerror = () => {
        // Fallback if synthesis fails
        setIsSpeakingWelcome(false);
        startListeningCore();
      };
      
      window.speechSynthesis.speak(msg);
    }
  }, [isListening, startListeningCore, stopAudioVisualization, commitAndSend]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      stopAudioVisualization();
      window.speechSynthesis.cancel();
    };
  }, [stopAudioVisualization]);

  const currentLang = LANGUAGES.find(l => l.code === selectedLang) || LANGUAGES[0];
  const fullText = transcript + interimText;

  return (
    <div className={`relative flex flex-col items-center ${className}`}>
      {/* Dynamic Orb / Main Button */}
      <div className="relative group cursor-pointer" onClick={toggleListening}>
        {/* Glow behind orb */}
        {isListening && (
          <motion.div
            className="absolute inset-0 rounded-full bg-pandora-500/20 blur-xl pointer-events-none"
            animate={{ scale: 1 + audioLevel * 1.5, opacity: 0.5 + audioLevel * 0.5 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.1 }}
          />
        )}
        
        <motion.div
          className={`relative z-10 w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-500 overflow-hidden ${
            isListening ? 'bg-gradient-to-br from-pandora-400 to-pandora-600 shadow-[0_0_30px_rgba(139,92,246,0.3)]' 
            : isSpeakingWelcome ? 'bg-white text-black' 
            : 'bg-[#111] border border-white/10 hover:bg-[#1a1a1a]'
          }`}
          animate={isListening ? { scale: 1 + (audioLevel * 0.2) } : { scale: 1 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.1 }}
        >
          {isSpeakingWelcome ? (
            <motion.div 
              animate={{ rotate: 360 }} 
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-full h-full rounded-full border-2 border-transparent border-t-black/50 border-r-black/50"
            />
          ) : isListening ? (
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  className="w-1.5 bg-white rounded-full"
                  animate={{ height: [6, 6 + (audioLevel * 20), 6] }}
                  transition={{ duration: 0.3, repeat: Infinity, delay: i * 0.1 }}
                />
              ))}
            </div>
          ) : (
            <Mic size={20} className="text-gray-400 group-hover:text-white transition-colors" />
          )}
        </motion.div>
        
        {/* Tooltip hint */}
        {!isListening && !isSpeakingWelcome && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 bg-white/10 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity">
            Tap to talk
          </div>
        )}
        {isListening && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center justify-center">
            <span className="text-[10px] text-pandora-400 uppercase tracking-widest font-medium animate-pulse">
              Listening...
            </span>
          </div>
        )}
      </div>

      {/* Language Picker (Moved to bottom/side to keep orb centered) */}
      <div className="absolute top-1/2 -translate-y-1/2 -left-12 flex flex-col items-center">
        <button
          onClick={(e) => { e.stopPropagation(); setShowLangPicker(!showLangPicker); }}
          className="p-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400 hover:text-white transition-all cursor-pointer"
          title="Select language"
        >
          <span>{currentLang.flag}</span>
        </button>

        <AnimatePresence>
          {showLangPicker && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="absolute left-full ml-2 top-0 bg-[#0a0a0a] border border-white/10 rounded-xl p-1 z-50 min-w-[120px]"
            >
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={(e) => { e.stopPropagation(); setSelectedLang(lang.code); setShowLangPicker(false); }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                    selectedLang === lang.code ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.name}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Transcription Display */}
      <AnimatePresence>
        {(isListening || fullText) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full mb-8 w-64 md:w-80 left-1/2 -translate-x-1/2"
          >
            <div className="p-4 rounded-2xl bg-[#111]/90 backdrop-blur-xl border border-white/10 relative shadow-2xl">
              {fullText && !isListening && (
                <button
                  onClick={() => { setTranscript(''); setInterimText(''); currentTextRef.current = ''; }}
                  className="absolute top-2 right-2 text-gray-500 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}

              <p className="text-sm text-white font-light leading-relaxed text-center">
                {transcript}
                <span className="text-pandora-300">{interimText}</span>
                {isListening && !fullText && (
                  <span className="text-gray-500 italic">I'm listening...</span>
                )}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute top-full mt-2 text-xs text-red-400 whitespace-nowrap"
        >
          {error}
        </motion.p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Task Progress Indicator
   Shows real-time steps during agent execution
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
