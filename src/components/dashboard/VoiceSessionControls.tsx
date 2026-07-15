import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { Loader2, Mic, MicOff, PhoneOff } from 'lucide-react';
import { requestJson } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import type { Organization } from '@/types/platform';

type VoiceState = {
  connected: boolean;
  speaking: boolean;
};

type Props = {
  organization: Organization;
  userId: string;
  autoStart?: boolean;
  onStateChange: (state: VoiceState) => void;
};

export default function VoiceSessionControls(props: Props) {
  return (
    <ConversationProvider>
      <VoiceControls {...props} />
    </ConversationProvider>
  );
}

function VoiceControls({ organization, userId, autoStart, onStateChange }: Props) {
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const attemptedAutoStart = useRef(false);
  const voice = useConversation({
    onError: (message) => {
      setError(typeof message === 'string' ? message : 'Voice connection failed.');
      setStarting(false);
    },
  });
  const connected = voice.status === 'connected';

  useEffect(() => {
    onStateChange({ connected, speaking: connected && voice.isSpeaking });
  }, [connected, onStateChange, voice.isSpeaking]);

  const startVoice = useCallback(async () => {
    setError('');
    setStarting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Your session has expired. Sign in again.');

      const data = await requestJson<{
        signedUrl?: string;
        contextToken?: string;
        role?: string;
      }>(
        `/api/voice/signed-url?organizationId=${encodeURIComponent(organization.id)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (!data.signedUrl) throw new Error('Voice is not configured.');

      await voice.startSession({
        signedUrl: data.signedUrl,
        connectionType: 'websocket',
        userId,
        dynamicVariables: {
          organization_id: organization.id,
          actor_id: userId,
          role: data.role ?? 'member',
          timezone: organization.timezone,
          plan: organization.plan_code,
          secret__voice_context_token: data.contextToken ?? '',
        },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to start voice.');
    } finally {
      setStarting(false);
    }
  }, [organization, userId, voice]);

  useEffect(() => {
    if (!autoStart || attemptedAutoStart.current) return;
    attemptedAutoStart.current = true;
    void startVoice();
  }, [autoStart, startVoice]);

  const endVoice = async () => {
    await voice.endSession();
    onStateChange({ connected: false, speaking: false });
  };

  return (
    <div className="contents">
      <button
        type="button"
        onClick={connected ? () => void endVoice() : () => void startVoice()}
        disabled={starting}
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border transition-colors ${connected ? 'border-red-300/25 bg-red-300/8 text-red-200' : 'border-white bg-white text-black'} disabled:cursor-wait disabled:opacity-55`}
        aria-label={connected ? 'End voice session' : 'Start voice session'}
      >
        {starting ? <Loader2 size={18} className="animate-spin" /> : connected ? <PhoneOff size={18} /> : <Mic size={18} />}
      </button>
      {connected && (
        <button
          type="button"
          onClick={() => voice.setMuted(!voice.isMuted)}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/10 text-white/58 transition-colors hover:border-white/20 hover:text-white"
          aria-label={voice.isMuted ? 'Unmute microphone' : 'Mute microphone'}
          aria-pressed={voice.isMuted}
        >
          {voice.isMuted ? <MicOff size={17} /> : <Mic size={17} />}
        </button>
      )}
      {error && <p role="alert" className="absolute bottom-[72px] left-0 text-xs text-red-300">{error}</p>}
    </div>
  );
}
