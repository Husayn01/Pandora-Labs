import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Mail, MessageCircle, Phone, PlugZap, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  DashboardPage,
  EmptyState,
  PageHeader,
  SkeletonRows,
  StatePill,
  StatusBanner,
  Surface,
} from '@/components/dashboard/DashboardPrimitives';
import { useAuth } from '@/contexts/AuthContext';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { useWorkspace } from '@/hooks/useWorkspace';
import { supabase } from '@/lib/supabase';

type Connection = {
  provider: string;
  status: string;
  external_account_label: string | null;
  scopes: string[];
  last_checked_at: string | null;
  last_error_code: string | null;
};
type PhoneIdentity = { display_hint: string | null; verified_at: string | null };
const realtimeTables = ['integration_connections', 'channel_identities'] as const;

const providerCards = [
  { id: 'google_workspace', name: 'Google Workspace', detail: 'Gmail and Calendar through the encrypted credential broker.', icon: Mail, phase: 'available' },
  { id: 'elevenlabs', name: 'ElevenLabs Voice', detail: 'Protected web voice and the shared Pandora telephone agent.', icon: Phone, phase: 'managed' },
  { id: 'telegram', name: 'Telegram', detail: 'Linked only after verified web onboarding.', icon: Send, phase: 'deferred' },
  { id: 'whatsapp', name: 'WhatsApp', detail: 'A shared business entry point linked to a verified workspace.', icon: MessageCircle, phase: 'deferred' },
] as const;

export default function IntegrationsPage() {
  const { organization, role } = useWorkspace();
  const { user } = useAuth();
  const online = useOnlineStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [phoneIdentity, setPhoneIdentity] = useState<PhoneIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [linkRequestId, setLinkRequestId] = useState('');
  const [notice, setNotice] = useState(searchParams.get('connected') === 'google' ? 'Google Workspace connected successfully.' : '');
  const [error, setError] = useState('');
  const canManage = role === 'owner' || role === 'admin';

  const load = useCallback(async () => {
    if (!organization || !user) return;
    setLoading(true);
    const [connectionResult, identityResult] = await Promise.all([
      supabase.from('integration_connections').select('provider,status,external_account_label,scopes,last_checked_at,last_error_code').eq('organization_id', organization.id),
      supabase.from('channel_identities').select('display_hint,verified_at').eq('organization_id', organization.id).eq('user_id', user.id).eq('channel', 'phone').maybeSingle(),
    ]);
    const queryError = connectionResult.error || identityResult.error;
    if (queryError) setError(queryError.message);
    else {
      setConnections((connectionResult.data ?? []) as Connection[]);
      setPhoneIdentity((identityResult.data as PhoneIdentity | null) ?? null);
      setError('');
    }
    setLoading(false);
  }, [organization, user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (searchParams.has('connected')) {
      const next = new URLSearchParams(searchParams);
      next.delete('connected');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const realtimeMode = useRealtimeRefresh({ organizationId: organization?.id, tables: realtimeTables, onRefresh: load });

  const connectGoogle = async () => {
    if (!organization || !canManage) return;
    setConnecting(true);
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setConnecting(false);
      setError('Your session has expired. Sign in again.');
      return;
    }
    const response = await fetch('/api/connectors/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ organizationId: organization.id }),
    });
    const data = await response.json() as { authorizationUrl?: string; error?: string };
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
    if (!session) {
      setPhoneBusy(false);
      setError('Your session has expired. Sign in again.');
      return;
    }
    const response = await fetch('/api/channels/phone-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, organizationId: organization.id, ...(action !== 'unlink' ? { phone } : {}), ...(action === 'verify' ? { code, linkRequestId } : {}) }),
    });
    const data = await response.json() as { error?: string; unlinked?: boolean; verified?: boolean; displayHint?: string; linkRequestId?: string };
    setPhoneBusy(false);
    if (!response.ok) {
      setError(data.error || 'Phone verification failed.');
      return;
    }
    if (data.unlinked) {
      setPhoneIdentity(null);
      setNotice('Calling number unlinked. Calls now have public-only access until another number is verified.');
    } else if (data.verified) {
      setPhoneIdentity({ display_hint: data.displayHint ?? null, verified_at: new Date().toISOString() });
      setNotice('Phone verified. Pandora can now identify this number when you call.');
      setLinkRequestId('');
      setCode('');
      setPhone('');
    } else if (data.linkRequestId) {
      setLinkRequestId(data.linkRequestId);
      setNotice(`A verification code was sent to ${data.displayHint}.`);
    }
  };

  return (
    <DashboardPage>
      <PageHeader eyebrow="Secure connections" title="Integrations" description="Connect accounts here before Pandora can perform private work. Customer refresh tokens stay encrypted and are never exposed to n8n." actions={<><StatePill label={realtimeMode} tone={realtimeMode === 'live' ? 'success' : 'warning'} /><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/52 disabled:opacity-35"><RefreshCw size={14} />Refresh status</button></>} />
      {!online && <StatusBanner tone="offline">Connection changes are disabled while you are offline.</StatusBanner>}
      {error && <StatusBanner onRetry={() => void load()}>{error}</StatusBanner>}
      {notice && <div role="status" className="rounded-[14px] border border-emerald-300/18 bg-emerald-300/7 px-4 py-3 text-sm text-emerald-100">{notice}</div>}

      {loading ? <Surface><SkeletonRows count={5} /></Surface> : (
        <>
          <Surface title="Your calling number" eyebrow="Twilio Verify protected" action={phoneIdentity?.verified_at ? <StatePill label="verified" tone="success" /> : <StatePill label="not linked" tone="warning" />}>
            <div className="grid gap-7 p-5 lg:grid-cols-[1fr_430px] lg:p-6">
              <div><div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/3"><ShieldCheck size={19} /></div><p className="mt-5 max-w-xl text-sm leading-6 text-white/38">Verify the number you will call from. Caller ID helps Pandora locate your workspace, but it never grants private access by itself. Sensitive actions still require explicit confirmation or stronger verification.</p><div className="mt-5 flex flex-wrap gap-2"><StatePill label="caller id is not authentication" tone="warning" /><StatePill label="one-way hash stored" tone="info" /></div></div>
              {phoneIdentity?.verified_at ? (
                <div className="rounded-2xl border border-emerald-300/18 bg-emerald-300/6 p-5"><p className="inline-flex items-center gap-2 text-sm text-emerald-200"><CheckCircle2 size={15} />Verified {phoneIdentity.display_hint}</p><p className="mt-2 text-xs leading-5 text-white/30">Only a masked hint and non-reversible identifier are stored.</p><button type="button" onClick={() => void linkPhone('unlink')} disabled={phoneBusy || !online} className="mt-5 text-xs text-white/42 underline decoration-white/20 underline-offset-4 hover:text-white disabled:opacity-35">{phoneBusy ? 'Unlinking…' : 'Unlink this number'}</button></div>
              ) : (
                <div className="space-y-3"><label className="block text-xs text-white/42" htmlFor="phone-link-number">Phone number</label><input id="phone-link-number" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+234 803 123 4567" className="field-control" disabled={!online} />{linkRequestId && <><label className="block text-xs text-white/42" htmlFor="phone-link-code">Verification code</label><input id="phone-link-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="Enter the code" className="field-control" disabled={!online} /></>}<button type="button" onClick={() => void linkPhone(linkRequestId ? 'verify' : 'start')} disabled={phoneBusy || !online || !phone || (Boolean(linkRequestId) && code.length < 4)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-35"><Phone size={14} />{phoneBusy ? 'Checking…' : linkRequestId ? 'Verify number' : 'Send code'}</button></div>
              )}
            </div>
          </Surface>

          <div className="grid gap-4 md:grid-cols-2">
            {providerCards.map((card) => {
              const connection = connections.find((item) => item.provider === card.id);
              const connected = connection?.status === 'connected';
              const managedReady = card.phase === 'managed';
              return (
                <Surface key={card.id} className="min-h-72">
                  <article className="flex h-full flex-col p-5">
                    <div className="flex items-start justify-between gap-4"><div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/3"><card.icon size={19} /></div><StatePill label={connected ? 'connected' : managedReady ? 'platform managed' : card.phase === 'deferred' ? 'later channel' : 'not connected'} tone={connected || managedReady ? 'success' : card.phase === 'deferred' ? 'neutral' : 'warning'} /></div>
                    <h2 className="mt-5 text-lg font-medium tracking-[-0.025em] text-white">{card.name}</h2>
                    <p className="mt-2 min-h-10 text-sm leading-6 text-white/36">{card.detail}</p>
                    {connection && <div className="mt-4 space-y-1 text-xs text-white/28"><p>{connection.external_account_label || 'Account label unavailable'}</p><p>{connection.scopes.length ? `${connection.scopes.length} authorized scopes` : 'No scopes reported'}</p><p>{connection.last_checked_at ? `Verified ${new Date(connection.last_checked_at).toLocaleString()}` : 'Provider health not checked yet'}</p>{connection.last_error_code && <p className="text-red-200">Health error: {connection.last_error_code}</p>}</div>}
                    <div className="mt-auto pt-5">{card.id === 'google_workspace' ? <button type="button" onClick={() => void connectGoogle()} disabled={connecting || !canManage || !online} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-35"><PlugZap size={14} />{connecting ? 'Opening Google…' : connected ? 'Reconnect Google' : 'Connect Google'}</button> : card.phase === 'deferred' ? <p className="text-xs text-white/25">Available only after verified web onboarding and the telephone release.</p> : <p className="text-xs text-white/25">Readiness is controlled by the environment-specific ElevenLabs configuration.</p>}</div>
                  </article>
                </Surface>
              );
            })}
          </div>
          {!connections.length && <Surface><EmptyState title="No customer accounts connected yet" description="Google Workspace is optional until Pandora needs to read email or manage calendar events." /></Surface>}
        </>
      )}
    </DashboardPage>
  );
}
