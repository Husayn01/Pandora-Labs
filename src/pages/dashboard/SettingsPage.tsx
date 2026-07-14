import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Clock3, LockKeyhole, Save, ShieldCheck, Users } from 'lucide-react';
import {
  DashboardPage,
  PageHeader,
  SkeletonRows,
  StatePill,
  StatusBanner,
  Surface,
} from '@/components/dashboard/DashboardPrimitives';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useWorkspace } from '@/hooks/useWorkspace';
import { supabase } from '@/lib/supabase';

type Member = { id: string; user_id: string; role: string; status: string; created_at: string };
type OperatingPreferences = { workingDays: string[]; startTime: string; endTime: string; confirmationPolicy: string };
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const defaults: OperatingPreferences = { workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], startTime: '09:00', endTime: '17:00', confirmationPolicy: 'external-writes' };

export default function SettingsPage() {
  const { organization, role, refresh } = useWorkspace();
  const online = useOnlineStatus();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Africa/Lagos');
  const [preferences, setPreferences] = useState<OperatingPreferences>(defaults);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const canManage = role === 'owner' || role === 'admin';

  useEffect(() => {
    if (!organization) return;
    setName(organization.name);
    setTimezone(organization.timezone);
    const stored = organization.business_profile?.operating_preferences;
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      setPreferences({ ...defaults, ...(stored as Partial<OperatingPreferences>) });
    } else {
      setPreferences(defaults);
    }
  }, [organization]);

  const loadMembers = useCallback(async () => {
    if (!organization) return;
    setLoadingMembers(true);
    const { data, error: queryError } = await supabase.from('organization_members').select('id,user_id,role,status,created_at').eq('organization_id', organization.id).order('created_at');
    if (queryError) setError(queryError.message); else setMembers((data ?? []) as Member[]);
    setLoadingMembers(false);
  }, [organization]);
  useEffect(() => { void loadMembers(); }, [loadMembers]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!organization || !canManage || !online || saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Workspace name cannot be empty.');
      return;
    }
    if (preferences.endTime <= preferences.startTime) {
      setError('Working hours must end after they start.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const { error: updateError } = await supabase.from('organizations').update({
      name: trimmedName,
      timezone,
      business_profile: { ...organization.business_profile, operating_preferences: preferences },
    }).eq('id', organization.id);
    if (updateError) setError(updateError.message);
    else {
      setNotice('Workspace settings saved. New operations will use these defaults.');
      await refresh();
    }
    setSaving(false);
  };

  const toggleDay = (day: string) => setPreferences((current) => ({ ...current, workingDays: current.workingDays.includes(day) ? current.workingDays.filter((item) => item !== day) : [...current.workingDays, day] }));

  return (
    <DashboardPage className="max-w-6xl">
      <PageHeader eyebrow="Workspace controls" title="Settings" description="Business defaults, members, retention, and action safeguards for this workspace." actions={<StatePill label={canManage ? 'administrator' : 'read only'} tone={canManage ? 'success' : 'neutral'} />} />
      {!online && <StatusBanner tone="offline">Settings are read-only while you are offline.</StatusBanner>}
      {error && <StatusBanner onRetry={() => setError('')}>{error}</StatusBanner>}
      {notice && <div role="status" className="rounded-[14px] border border-emerald-300/18 bg-emerald-300/7 px-4 py-3 text-sm text-emerald-100">{notice}</div>}

      <Surface title="Workspace and working hours" eyebrow="Used for scheduling and reminders" action={<Clock3 size={16} className="text-white/30" />}>
        <form onSubmit={submit} className="grid gap-5 p-5 lg:grid-cols-2 lg:p-6">
          <label className="block"><span className="text-xs text-white/42">Business name</span><input value={name} onChange={(event) => setName(event.target.value)} className="field-control mt-2" disabled={!canManage || !online} /></label>
          <label className="block"><span className="text-xs text-white/42">Primary timezone</span><select value={timezone} onChange={(event) => setTimezone(event.target.value)} className="field-control mt-2" disabled={!canManage || !online}><option value="Africa/Lagos">Africa/Lagos (WAT)</option><option value="UTC">UTC</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option></select></label>
          <fieldset className="lg:col-span-2"><legend className="text-xs text-white/42">Working days</legend><div className="mt-2 flex flex-wrap gap-2">{weekdays.map((day) => <button key={day} type="button" onClick={() => toggleDay(day)} disabled={!canManage || !online} aria-pressed={preferences.workingDays.includes(day)} className={`rounded-xl border px-3 py-2 text-xs transition-colors ${preferences.workingDays.includes(day) ? 'border-blue-300/22 bg-blue-300/8 text-blue-100' : 'border-white/9 text-white/30'} disabled:opacity-35`}>{day}</button>)}</div></fieldset>
          <label className="block"><span className="text-xs text-white/42">Day starts</span><input type="time" value={preferences.startTime} onChange={(event) => setPreferences((current) => ({ ...current, startTime: event.target.value }))} className="field-control mt-2" disabled={!canManage || !online} /></label>
          <label className="block"><span className="text-xs text-white/42">Day ends</span><input type="time" value={preferences.endTime} onChange={(event) => setPreferences((current) => ({ ...current, endTime: event.target.value }))} className="field-control mt-2" disabled={!canManage || !online} /></label>
          <label className="block lg:col-span-2"><span className="text-xs text-white/42">Confirmation policy</span><select value={preferences.confirmationPolicy} onChange={(event) => setPreferences((current) => ({ ...current, confirmationPolicy: event.target.value }))} className="field-control mt-2" disabled={!canManage || !online}><option value="external-writes">Confirm external sends and calendar writes</option><option value="all-mutations">Confirm every mutation</option></select><span className="mt-2 block text-xs leading-5 text-white/24">This can make policy stricter. Destructive or financial actions always require approval or OTP.</span></label>
          <div className="lg:col-span-2"><button type="submit" disabled={!canManage || !online || saving} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-35"><Save size={14} />{saving ? 'Saving…' : 'Save workspace'}</button></div>
        </form>
      </Surface>

      <Surface title="Members and roles" eyebrow={`${members.length} workspace members`} action={<Users size={16} className="text-white/30" />}>
        {loadingMembers ? <SkeletonRows count={3} /> : <div className="divide-y divide-white/7">{members.map((member) => <div key={member.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="font-mono text-xs text-white/52">{member.user_id.slice(0, 8)}…{member.user_id.slice(-4)}</p><p className="mt-1 text-xs text-white/24">Joined {new Date(member.created_at).toLocaleDateString()}</p></div><StatePill label={member.role} tone={member.role === 'owner' ? 'success' : member.role === 'admin' ? 'info' : 'neutral'} /><StatePill label={member.status} tone={member.status === 'active' ? 'success' : 'warning'} /></div>)}</div>}
        <div className="border-t border-white/7 px-5 py-4"><p className="text-xs leading-5 text-white/25">Invitations and role changes stay unavailable until the trusted invitation endpoint and verified email delivery are enabled. Direct browser role mutation is intentionally blocked.</p></div>
      </Surface>

      <div className="grid gap-4 md:grid-cols-2">
        <Surface className="p-6"><ShieldCheck size={18} className="text-emerald-200" /><h2 className="mt-5 text-lg font-medium text-white">Privacy and retention</h2><p className="mt-2 text-sm leading-6 text-white/36">Call audio is disabled by default. Redacted transcripts retain for 30 days; minimal action summaries and audit records follow workspace policy.</p><div className="mt-5 flex gap-2"><StatePill label="audio off" tone="success" /><StatePill label="30-day transcripts" tone="info" /></div></Surface>
        <Surface className="p-6"><LockKeyhole size={18} className="text-amber-200" /><h2 className="mt-5 text-lg font-medium text-white">Non-negotiable risk policy</h2><p className="mt-2 text-sm leading-6 text-white/36">Permanent deletion, money movement, tax filing, and irreversible ledger posting remain unavailable in v1. External writes require an immutable preview and confirmation.</p><div className="mt-5 flex gap-2"><StatePill label="safe by default" tone="warning" /></div></Surface>
      </div>
    </DashboardPage>
  );
}
