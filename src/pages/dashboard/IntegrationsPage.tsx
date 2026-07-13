import { useEffect, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Mail,
  MessageCircle,
  Phone,
  PlugZap,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { GlassCard } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/hooks/useWorkspace';
import { supabase } from '@/lib/supabase';

type Connection = {
  provider: string;
  status: string;
  external_account_label: string | null;
  last_checked_at: string | null;
};

type PhoneIdentity = {
  display_hint: string | null;
  verified_at: string | null;
};

const cards = [
  {
    id: 'google_workspace',
    name: 'Google Workspace',
    detail: 'Gmail and Calendar through the encrypted credential broker.',
    icon: Mail,
    available: true,
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs Voice',
    detail: 'Protected web voice and the shared Pandora phone agent.',
    icon: Phone,
    available: true,
    managed: true,
  },
  {
    id: 'telegram',
    name: 'Telegram',
    detail: 'Secure account linking through a single-use dashboard token.',
    icon: Send,
    available: false,
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    detail: 'Shared business entry point with verified organization pairing.',
    icon: MessageCircle,
    available: false,
  },
];

export default function IntegrationsPage() {
  const { organization } = useWorkspace();
  const { user } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [phoneIdentity, setPhoneIdentity] = useState<PhoneIdentity | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [linkRequestId, setLinkRequestId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!organization || !user) return;
    void Promise.all([
      supabase
        .from('integration_connections')
        .select('provider,status,external_account_label,last_checked_at')
        .eq('organization_id', organization.id),
      supabase
        .from('channel_identities')
        .select('display_hint,verified_at')
        .eq('organization_id', organization.id)
        .eq('user_id', user.id)
        .eq('channel', 'phone')
        .maybeSingle(),
    ]).then(([connectionResult, identityResult]) => {
      setConnections((connectionResult.data ?? []) as Connection[]);
      setPhoneIdentity((identityResult.data as PhoneIdentity | null) ?? null);
    });
  }, [organization, user]);

  const connectGoogle = async () => {
    if (!organization) return;
    setConnecting(true);
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/connectors/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ organizationId: organization.id }),
    });
    const data = await response.json();
    setConnecting(false);
    if (response.ok && data.authorizationUrl) window.location.assign(data.authorizationUrl);
    else setError(data.error || 'Google connection could not be started.');
  };

  const linkPhone = async (action: 'start' | 'verify' | 'unlink') => {
    if (!organization) return;
    setPhoneBusy(true);
    setError('');
    setNotice('');
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/channels/phone-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        action,
        organizationId: organization.id,
        ...(action !== 'unlink' ? { phone } : {}),
        ...(action === 'verify' ? { code, linkRequestId } : {}),
      }),
    });
    const data = await response.json();
    setPhoneBusy(false);

    if (!response.ok) {
      setError(data.error || 'Phone verification failed.');
      return;
    }
    if (data.unlinked) {
      setPhoneIdentity(null);
      setNotice('Calling number unlinked. Phone calls will use public-only access until you verify another number.');
      return;
    }
    if (data.verified) {
      setPhoneIdentity({ display_hint: data.displayHint, verified_at: new Date().toISOString() });
      setNotice('Phone verified. Pandora can now recognize this number when you call.');
      setLinkRequestId('');
      setCode('');
      setPhone('');
      return;
    }

    setLinkRequestId(data.linkRequestId);
    setNotice(`A verification code was sent to ${data.displayHint}.`);
  };

  return (
    <div className="p-5 md:p-8 max-w-6xl mx-auto">
      <header className="mb-7">
        <p className="text-xs uppercase tracking-[.2em] text-gray-500">Secure connections</p>
        <h1 className="text-3xl text-white mt-2">Integrations</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-2xl">
          Connect accounts here before Pandora can perform private work through phone or messaging channels. Customer refresh tokens are never exposed to n8n.
        </p>
      </header>

      {(error || notice) && (
        <div
          role={error ? 'alert' : 'status'}
          className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${error ? 'border-red-500/20 bg-red-500/10 text-red-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}
        >
          {error || notice}
        </div>
      )}

      <GlassCard hover={false} className="p-6 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="max-w-xl">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl border border-white/10 bg-white/[.03] flex items-center justify-center">
                <ShieldCheck size={19} />
              </div>
              <div>
                <h2 className="text-lg text-white">Your calling number</h2>
                <p className="text-xs text-gray-500">Twilio Verify protected</p>
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-4 leading-relaxed">
              Verify the number you will call from. Caller ID helps Pandora find your workspace, but sensitive actions still require explicit confirmation or stronger verification.
            </p>
          </div>

          <div className="w-full lg:max-w-md">
            {phoneIdentity?.verified_at ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[.06] p-4">
                <p className="inline-flex items-center gap-2 text-sm text-emerald-300">
                  <CheckCircle2 size={15} /> Verified {phoneIdentity.display_hint}
                </p>
                <p className="text-xs text-gray-500 mt-2">Only a one-way hash and masked hint are stored.</p>
                <button
                  onClick={() => void linkPhone('unlink')}
                  disabled={phoneBusy}
                  className="mt-4 text-xs text-gray-400 underline decoration-white/20 underline-offset-4 hover:text-white disabled:opacity-40"
                >
                  {phoneBusy ? 'Unlinking…' : 'Unlink this number'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs text-gray-400" htmlFor="phone-link-number">
                  Phone number
                </label>
                <input
                  id="phone-link-number"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+234 803 123 4567"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-white/30"
                />
                {linkRequestId && (
                  <>
                    <label className="block text-xs text-gray-400" htmlFor="phone-link-code">
                      Verification code
                    </label>
                    <input
                      id="phone-link-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                      placeholder="Enter the code"
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-white/30"
                    />
                  </>
                )}
                <button
                  onClick={() => void linkPhone(linkRequestId ? 'verify' : 'start')}
                  disabled={phoneBusy || !phone || (Boolean(linkRequestId) && code.length < 4)}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                >
                  <Phone size={14} />
                  {phoneBusy ? 'Checking…' : linkRequestId ? 'Verify number' : 'Send code'}
                </button>
              </div>
            )}
          </div>
        </div>
      </GlassCard>

      <div className="grid md:grid-cols-2 gap-4">
        {cards.map((card) => {
          const connection = connections.find((item) => item.provider === card.id);
          const connected = connection?.status === 'connected';
          return (
            <GlassCard key={card.id} hover={false} className="p-6">
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 rounded-2xl border border-white/10 bg-white/[.03] flex items-center justify-center">
                  <card.icon size={19} />
                </div>
                {connected ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 size={13} /> Connected
                  </span>
                ) : (
                  <span className="text-xs text-gray-600">
                    {card.managed ? 'Platform managed' : card.available ? 'Not connected' : 'Next channel release'}
                  </span>
                )}
              </div>
              <h2 className="text-lg text-white mt-5">{card.name}</h2>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed min-h-10">{card.detail}</p>
              {card.id === 'google_workspace' ? (
                <button
                  onClick={() => void connectGoogle()}
                  disabled={connecting}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-white text-black px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  <PlugZap size={14} />
                  {connecting ? 'Opening Google…' : connected ? 'Reconnect' : 'Connect Google'}
                </button>
              ) : (
                <button
                  disabled
                  className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-gray-500 disabled:opacity-70"
                >
                  <CalendarDays size={14} />
                  {card.available ? 'Configured by Pandora Labs' : 'Coming after phone launch'}
                </button>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
