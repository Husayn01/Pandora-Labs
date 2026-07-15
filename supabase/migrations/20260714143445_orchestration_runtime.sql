-- Durable orchestration runtime. This migration is intentionally unapplied
-- until it passes fresh and upgrade tests in the isolated staging project.

alter table public.conversations
  add constraint conversations_id_organization_unique unique (id, organization_id);

alter table public.tasks
  add constraint tasks_id_organization_unique unique (id, organization_id);

alter table public.reminders
  drop constraint if exists reminders_task_id_fkey,
  drop constraint if exists reminders_status_check,
  add constraint reminders_status_check
    check (status in ('scheduled', 'processing', 'sent', 'cancelled', 'failed', 'uncertain')),
  add column if not exists lease_owner text,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists last_error_code text,
  add column if not exists last_correlation_id uuid,
  add constraint reminders_attempt_count_check check (attempt_count >= 0),
  add constraint reminders_max_attempts_check check (max_attempts between 1 and 20),
  add constraint reminders_lease_state_check check (
    (status = 'processing' and lease_token is not null and lease_expires_at is not null)
    or (status <> 'processing' and lease_token is null and lease_expires_at is null)
  ),
  add constraint reminders_id_organization_unique unique (id, organization_id),
  add constraint reminders_task_tenant_fk
    foreign key (task_id, organization_id)
    references public.tasks(id, organization_id)
    on delete set null (task_id);

alter table public.approval_requests
  drop constraint if exists approval_requests_conversation_id_fkey,
  add constraint approval_requests_conversation_tenant_fk
    foreign key (conversation_id, organization_id)
    references public.conversations(id, organization_id)
    on delete set null (conversation_id);

alter table public.workflow_events
  drop constraint if exists workflow_events_conversation_id_fkey,
  add constraint workflow_events_conversation_tenant_fk
    foreign key (conversation_id, organization_id)
    references public.conversations(id, organization_id)
    on delete set null (conversation_id);

create index reminders_scheduled_due_idx
  on public.reminders (remind_at, id)
  where status = 'scheduled';
create index reminders_processing_lease_idx
  on public.reminders (lease_expires_at, id)
  where status = 'processing';

create table public.orchestration_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid,
  schema_version integer not null default 1,
  channel text not null,
  intent text not null,
  retry_class text not null default 'never',
  action_id uuid,
  correlation_id uuid not null,
  idempotency_key text not null,
  canonical_payload_hash text not null,
  redacted_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  dispatch_started_at timestamptz,
  result_redacted jsonb not null default '{}'::jsonb,
  result_fingerprint text,
  error_code text,
  error_retryable boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint orchestration_commands_conversation_tenant_fk
    foreign key (conversation_id, organization_id)
    references public.conversations(id, organization_id) on delete set null (conversation_id),
  constraint orchestration_commands_schema_version_check check (schema_version > 0),
  constraint orchestration_commands_channel_check check (channel in ('web', 'web_voice', 'phone', 'sms', 'telegram', 'whatsapp', 'ussd')),
  constraint orchestration_commands_retry_class_check check (retry_class in ('safe_read', 'provider_idempotent', 'never')),
  constraint orchestration_commands_status_check check (status in ('pending', 'executing', 'succeeded', 'failed', 'uncertain')),
  constraint orchestration_commands_hash_check check (canonical_payload_hash ~ '^[a-f0-9]{64}$'),
  constraint orchestration_commands_result_hash_check check (result_fingerprint is null or result_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint orchestration_commands_idempotency_length check (length(idempotency_key) between 1 and 160),
  constraint orchestration_commands_attempt_check check (attempt_count >= 0),
  constraint orchestration_commands_max_attempts_check check (max_attempts between 1 and 10),
  constraint orchestration_commands_lease_state_check check (
    (status = 'executing' and lease_owner is not null and lease_token is not null and lease_expires_at is not null)
    or (status <> 'executing' and lease_owner is null and lease_token is null and lease_expires_at is null)
  ),
  constraint orchestration_commands_terminal_state_check check (
    (status in ('succeeded', 'failed', 'uncertain') and completed_at is not null)
    or (status in ('pending', 'executing') and completed_at is null)
  ),
  unique (organization_id, idempotency_key),
  unique (organization_id, action_id)
);

create index orchestration_commands_org_created_idx on public.orchestration_commands (organization_id, created_at desc);
create index orchestration_commands_recovery_idx on public.orchestration_commands (lease_expires_at, id) where status = 'executing';
create index orchestration_commands_correlation_idx on public.orchestration_commands (organization_id, correlation_id);
create index orchestration_commands_actor_idx on public.orchestration_commands (actor_user_id) where actor_user_id is not null;
create index orchestration_commands_conversation_idx on public.orchestration_commands (conversation_id) where conversation_id is not null;

create table public.webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  provider text not null,
  provider_event_id text not null,
  correlation_id uuid not null,
  payload_hash text not null,
  signature_hash text,
  status text not null default 'received',
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts integer not null default 10,
  http_status integer,
  payload_redacted jsonb not null default '{}'::jsonb,
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint webhook_receipts_provider_check check (provider in ('elevenlabs', 'twilio', 'paystack')),
  constraint webhook_receipts_status_check check (status in ('received', 'processing', 'processed', 'rejected', 'failed', 'uncertain')),
  constraint webhook_receipts_payload_hash_check check (payload_hash ~ '^[a-f0-9]{64}$'),
  constraint webhook_receipts_signature_hash_check check (signature_hash is null or signature_hash ~ '^[a-f0-9]{64}$'),
  constraint webhook_receipts_event_id_check check (length(provider_event_id) between 1 and 200),
  constraint webhook_receipts_attempt_check check (attempt_count >= 0),
  constraint webhook_receipts_max_attempts_check check (max_attempts between 1 and 20),
  constraint webhook_receipts_http_status_check check (http_status is null or http_status between 100 and 599),
  constraint webhook_receipts_lease_state_check check (
    (status = 'processing' and lease_owner is not null and lease_token is not null and lease_expires_at is not null)
    or (status <> 'processing' and lease_owner is null and lease_token is null and lease_expires_at is null)
  ),
  unique (provider, provider_event_id)
);

create index webhook_receipts_status_received_idx on public.webhook_receipts (status, received_at);
create index webhook_receipts_processing_lease_idx on public.webhook_receipts (lease_expires_at, id) where status = 'processing';
create index webhook_receipts_org_received_idx on public.webhook_receipts (organization_id, received_at desc) where organization_id is not null;

create table public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reminder_id uuid not null,
  attempt_number integer not null,
  lease_token uuid not null,
  delivery_channel text not null,
  status text not null default 'processing',
  provider_message_id text,
  error_code text,
  correlation_id uuid not null,
  dispatch_started_at timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reminder_deliveries_reminder_tenant_fk
    foreign key (reminder_id, organization_id)
    references public.reminders(id, organization_id) on delete cascade,
  constraint reminder_deliveries_attempt_check check (attempt_number > 0),
  constraint reminder_deliveries_channel_check check (delivery_channel in ('web', 'email', 'sms', 'phone', 'telegram', 'whatsapp')),
  constraint reminder_deliveries_status_check check (status in ('processing', 'sent', 'failed', 'uncertain')),
  constraint reminder_deliveries_terminal_check check (
    (status = 'processing' and completed_at is null)
    or (status <> 'processing' and completed_at is not null)
  ),
  unique (reminder_id, attempt_number)
);

create index reminder_deliveries_org_created_idx on public.reminder_deliveries (organization_id, created_at desc);

create table public.phone_number_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  inbound_number_hash text not null,
  display_hint text not null,
  provider_number_id text,
  routing_code_hash text,
  status text not null default 'pending',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phone_number_assignments_provider_check check (provider in ('twilio', 'sip')),
  constraint phone_number_assignments_status_check check (status in ('pending', 'active', 'suspended', 'released')),
  constraint phone_number_assignments_number_hash_check check (inbound_number_hash ~ '^[a-f0-9]{64}$'),
  constraint phone_number_assignments_routing_hash_check check (routing_code_hash is null or routing_code_hash ~ '^[a-f0-9]{64}$'),
  unique (provider, inbound_number_hash),
  unique (organization_id, provider_number_id)
);

create index phone_number_assignments_org_status_idx on public.phone_number_assignments (organization_id, status);

create table public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid,
  elevenlabs_conversation_id text,
  channel text not null,
  status text not null default 'starting',
  audio_recorded boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer,
  transcript_expires_at timestamptz not null default (now() + interval '30 days'),
  outcome text,
  action_id uuid,
  clarification_count integer not null default 0,
  escalation_reason text,
  redacted_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_sessions_conversation_tenant_fk
    foreign key (conversation_id, organization_id)
    references public.conversations(id, organization_id) on delete set null (conversation_id),
  constraint voice_sessions_channel_check check (channel in ('web_voice', 'phone')),
  constraint voice_sessions_status_check check (status in ('starting', 'active', 'completed', 'failed', 'abandoned')),
  constraint voice_sessions_audio_off_check check (audio_recorded = false),
  constraint voice_sessions_duration_check check (duration_seconds is null or duration_seconds >= 0),
  constraint voice_sessions_clarification_check check (clarification_count >= 0),
  constraint voice_sessions_end_state_check check (
    (status in ('completed', 'failed', 'abandoned') and ended_at is not null)
    or (status in ('starting', 'active') and ended_at is null)
  ),
  unique (elevenlabs_conversation_id)
);

create index voice_sessions_org_started_idx on public.voice_sessions (organization_id, started_at desc);
create index voice_sessions_actor_idx on public.voice_sessions (actor_user_id) where actor_user_id is not null;
create index voice_sessions_conversation_idx on public.voice_sessions (conversation_id) where conversation_id is not null;
create index voice_sessions_transcript_expiry_idx on public.voice_sessions (transcript_expires_at);

create table public.voice_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entry_type text not null,
  amount_minor bigint not null,
  currency text not null default 'NGN',
  balance_after_minor bigint not null,
  provider text,
  provider_reference text,
  idempotency_key text not null,
  correlation_id uuid not null,
  description text not null,
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint voice_wallet_ledger_entry_type_check check (entry_type in ('topup', 'usage', 'refund', 'adjustment', 'expiry')),
  constraint voice_wallet_ledger_amount_check check (
    (entry_type in ('topup', 'refund') and amount_minor > 0)
    or (entry_type in ('usage', 'expiry') and amount_minor < 0)
    or (entry_type = 'adjustment' and amount_minor <> 0)
  ),
  constraint voice_wallet_ledger_currency_check check (currency = 'NGN'),
  constraint voice_wallet_ledger_balance_check check (balance_after_minor >= 0),
  constraint voice_wallet_ledger_provider_reference_check check (
    (provider is null and provider_reference is null)
    or (provider is not null and provider_reference is not null)
  ),
  constraint voice_wallet_ledger_idempotency_check check (length(idempotency_key) between 1 and 160),
  unique (organization_id, idempotency_key),
  unique (provider, provider_reference)
);

create index voice_wallet_ledger_org_created_idx on public.voice_wallet_ledger (organization_id, created_at desc, id desc);

alter table public.orchestration_commands enable row level security;
alter table public.webhook_receipts enable row level security;
alter table public.reminder_deliveries enable row level security;
alter table public.phone_number_assignments enable row level security;
alter table public.voice_sessions enable row level security;
alter table public.voice_wallet_ledger enable row level security;

create policy orchestration_commands_member_select on public.orchestration_commands
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy reminder_deliveries_member_select on public.reminder_deliveries
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy phone_number_assignments_member_select on public.phone_number_assignments
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy voice_sessions_member_select on public.voice_sessions
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy voice_wallet_ledger_admin_select on public.voice_wallet_ledger
  for select to authenticated using ((select private.has_org_role(organization_id, array['owner', 'admin'])));

revoke all on table public.orchestration_commands, public.webhook_receipts,
  public.reminder_deliveries, public.phone_number_assignments,
  public.voice_sessions, public.voice_wallet_ledger
  from public, anon, authenticated, service_role;
grant select on table public.orchestration_commands, public.reminder_deliveries,
  public.voice_sessions, public.voice_wallet_ledger to authenticated;
grant select (id, organization_id, provider, display_hint, provider_number_id, status, verified_at, created_at, updated_at)
  on public.phone_number_assignments to authenticated;
grant select on table public.orchestration_commands, public.webhook_receipts,
  public.reminder_deliveries, public.phone_number_assignments,
  public.voice_sessions, public.voice_wallet_ledger to service_role;

create or replace function private.claim_orchestration_command(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_conversation_id uuid,
  p_schema_version integer,
  p_channel text,
  p_intent text,
  p_retry_class text,
  p_action_id uuid,
  p_correlation_id uuid,
  p_idempotency_key text,
  p_canonical_payload_hash text,
  p_redacted_payload jsonb,
  p_lease_owner text,
  p_lease_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_command public.orchestration_commands%rowtype;
  v_now timestamptz := now();
  v_lease_token uuid;
begin
  if p_lease_owner is null or length(p_lease_owner) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'invalid lease owner';
  end if;
  if p_lease_seconds not between 15 and 300 then
    raise exception using errcode = '22023', message = 'invalid lease duration';
  end if;
  if p_retry_class not in ('safe_read', 'provider_idempotent', 'never') then
    raise exception using errcode = '22023', message = 'invalid retry class';
  end if;
  if p_actor_user_id is not null and not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'code', 'actor_not_active_member');
  end if;
  if not exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.status in ('active', 'past_due')
  ) then
    return jsonb_build_object('ok', false, 'code', 'organization_unavailable');
  end if;

  insert into public.orchestration_commands (
    organization_id, actor_user_id, conversation_id, schema_version, channel,
    intent, retry_class, action_id, correlation_id, idempotency_key,
    canonical_payload_hash, redacted_payload, status
  ) values (
    p_organization_id, p_actor_user_id, p_conversation_id, p_schema_version,
    p_channel, p_intent, p_retry_class, p_action_id, p_correlation_id,
    p_idempotency_key, p_canonical_payload_hash,
    coalesce(p_redacted_payload, '{}'::jsonb), 'pending'
  )
  on conflict (organization_id, idempotency_key) do nothing;

  select * into v_command
  from public.orchestration_commands
  where organization_id = p_organization_id and idempotency_key = p_idempotency_key
  for update;

  if v_command.canonical_payload_hash <> p_canonical_payload_hash then
    return jsonb_build_object('ok', false, 'code', 'idempotency_payload_mismatch', 'commandId', v_command.id);
  end if;
  if v_command.actor_user_id is distinct from p_actor_user_id
     or v_command.conversation_id is distinct from p_conversation_id
     or v_command.schema_version <> p_schema_version
     or v_command.channel <> p_channel
     or v_command.intent <> p_intent
     or v_command.retry_class <> p_retry_class
     or v_command.action_id is distinct from p_action_id then
    return jsonb_build_object('ok', false, 'code', 'idempotency_context_mismatch', 'commandId', v_command.id);
  end if;

  if v_command.status in ('succeeded', 'failed', 'uncertain') then
    return jsonb_build_object(
      'ok', true, 'claimed', false, 'replayed', true,
      'commandId', v_command.id, 'status', v_command.status,
      'result', v_command.result_redacted, 'errorCode', v_command.error_code
    );
  end if;

  if v_command.status = 'executing' and v_command.lease_expires_at > v_now then
    return jsonb_build_object(
      'ok', true, 'claimed', false, 'replayed', true,
      'commandId', v_command.id, 'status', 'executing',
      'leaseExpiresAt', v_command.lease_expires_at
    );
  end if;

  if v_command.status = 'executing'
     and v_command.retry_class = 'never'
     and v_command.dispatch_started_at is not null then
    update public.orchestration_commands
    set status = 'uncertain', lease_owner = null, lease_token = null,
        lease_expires_at = null, completed_at = v_now, updated_at = v_now,
        error_code = 'expired_after_dispatch', error_retryable = false
    where id = v_command.id;
    return jsonb_build_object(
      'ok', true, 'claimed', false, 'replayed', true,
      'commandId', v_command.id, 'status', 'uncertain',
      'errorCode', 'expired_after_dispatch'
    );
  end if;

  if v_command.status = 'executing'
     and v_command.attempt_count >= v_command.max_attempts then
    update public.orchestration_commands
    set status = case when v_command.retry_class = 'safe_read' then 'failed' else 'uncertain' end,
        lease_owner = null, lease_token = null, lease_expires_at = null,
        completed_at = v_now, updated_at = v_now,
        error_code = 'retry_attempts_exhausted', error_retryable = false
    where id = v_command.id
    returning * into v_command;
    return jsonb_build_object(
      'ok', true, 'claimed', false, 'replayed', true,
      'commandId', v_command.id, 'status', v_command.status,
      'errorCode', v_command.error_code
    );
  end if;

  v_lease_token := gen_random_uuid();
  update public.orchestration_commands
  set status = 'executing', lease_owner = p_lease_owner,
      lease_token = v_lease_token,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1, dispatch_started_at = null,
      result_redacted = '{}'::jsonb, result_fingerprint = null,
      error_code = null, error_retryable = null, updated_at = v_now
  where id = v_command.id
  returning * into v_command;

  return jsonb_build_object(
    'ok', true, 'claimed', true, 'replayed', false,
    'commandId', v_command.id, 'status', v_command.status,
    'attempt', v_command.attempt_count, 'leaseToken', v_command.lease_token,
    'leaseExpiresAt', v_command.lease_expires_at
  );
end;
$function$;

create or replace function private.mark_orchestration_dispatch_started(
  p_organization_id uuid,
  p_command_id uuid,
  p_lease_token uuid,
  p_attempt integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_command public.orchestration_commands%rowtype;
begin
  select * into v_command from public.orchestration_commands
  where id = p_command_id and organization_id = p_organization_id
  for update;
  if not found
     or v_command.status <> 'executing'
     or v_command.lease_token <> p_lease_token
     or v_command.attempt_count <> p_attempt
     or v_command.lease_expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'lease_mismatch');
  end if;
  if v_command.dispatch_started_at is not null then
    return jsonb_build_object(
      'ok', true, 'replayed', true,
      'dispatchStartedAt', v_command.dispatch_started_at
    );
  end if;

  update public.orchestration_commands
  set dispatch_started_at = now(), updated_at = now()
  where id = v_command.id
  returning * into v_command;

  return jsonb_build_object(
    'ok', true, 'replayed', false,
    'dispatchStartedAt', v_command.dispatch_started_at
  );
end;
$function$;

create or replace function private.finish_orchestration_command(
  p_organization_id uuid,
  p_command_id uuid,
  p_lease_token uuid,
  p_attempt integer,
  p_status text,
  p_result_redacted jsonb default '{}'::jsonb,
  p_result_fingerprint text default null,
  p_error_code text default null,
  p_error_retryable boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_command public.orchestration_commands%rowtype;
begin
  if p_status not in ('succeeded', 'failed', 'uncertain') then
    raise exception using errcode = '22023', message = 'invalid terminal command status';
  end if;
  if p_result_fingerprint is not null and p_result_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid result fingerprint';
  end if;
  if p_status = 'succeeded' and p_result_fingerprint is null then
    raise exception using errcode = '22023', message = 'successful commands require a result fingerprint';
  end if;

  select * into v_command
  from public.orchestration_commands
  where id = p_command_id and organization_id = p_organization_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_command.status in ('succeeded', 'failed', 'uncertain') then
    if v_command.status = p_status
       and v_command.result_fingerprint is not distinct from p_result_fingerprint
       and v_command.error_code is not distinct from p_error_code
       and v_command.error_retryable is not distinct from p_error_retryable then
      return jsonb_build_object('ok', true, 'replayed', true, 'commandId', v_command.id, 'status', v_command.status);
    end if;
    return jsonb_build_object('ok', false, 'code', 'terminal_result_mismatch', 'status', v_command.status);
  end if;
  if v_command.status <> 'executing'
     or v_command.lease_token <> p_lease_token
     or v_command.attempt_count <> p_attempt then
    return jsonb_build_object('ok', false, 'code', 'lease_mismatch', 'status', v_command.status);
  end if;

  update public.orchestration_commands
  set status = p_status, result_redacted = coalesce(p_result_redacted, '{}'::jsonb),
      result_fingerprint = p_result_fingerprint, error_code = p_error_code,
      error_retryable = p_error_retryable, lease_owner = null,
      lease_token = null, lease_expires_at = null,
      completed_at = now(), updated_at = now()
  where id = v_command.id;

  return jsonb_build_object('ok', true, 'replayed', false, 'commandId', v_command.id, 'status', p_status);
end;
$function$;

create or replace function private.claim_due_reminders(
  p_lease_owner text,
  p_limit integer default 50,
  p_lease_seconds integer default 120
)
returns setof public.reminders
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_lease_owner is null or length(p_lease_owner) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'invalid lease owner';
  end if;
  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid claim limit';
  end if;
  if p_lease_seconds not between 30 and 600 then
    raise exception using errcode = '22023', message = 'invalid lease duration';
  end if;

  -- A provider call may have succeeded even when the worker disappeared. Once
  -- dispatch began, an expired lease becomes uncertain and is never resent.
  update public.reminder_deliveries d
  set status = 'uncertain', error_code = 'expired_after_dispatch', completed_at = now()
  from public.reminders r
  where d.reminder_id = r.id and d.organization_id = r.organization_id
    and d.attempt_number = r.attempt_count and d.status = 'processing'
    and d.dispatch_started_at is not null and r.status = 'processing'
    and (r.lease_expires_at is null or r.lease_expires_at <= now());

  update public.reminders r
  set status = 'uncertain', lease_owner = null, lease_token = null,
      lease_expires_at = null, last_error_code = 'expired_after_dispatch',
      updated_at = now()
  where r.status = 'processing'
    and exists (
      select 1 from public.reminder_deliveries d
      where d.reminder_id = r.id and d.attempt_number = r.attempt_count
        and d.status = 'uncertain' and d.error_code = 'expired_after_dispatch'
    );

  -- If no provider dispatch occurred, the abandoned attempt is safe to close
  -- and a new leased attempt may be claimed below.
  update public.reminder_deliveries d
  set status = 'failed', error_code = 'lease_expired_before_dispatch', completed_at = now()
  from public.reminders r
  where d.reminder_id = r.id and d.organization_id = r.organization_id
    and d.attempt_number = r.attempt_count and d.status = 'processing'
    and d.dispatch_started_at is null and r.status = 'processing'
    and (r.lease_expires_at is null or r.lease_expires_at <= now());

  return query
  with candidates as (
    select r.id
    from public.reminders r
    join public.organizations o on o.id = r.organization_id
    where o.status in ('active', 'past_due')
      and r.remind_at <= now()
      and r.attempt_count < r.max_attempts
      and (
        r.status = 'scheduled'
        or (r.status = 'processing' and (r.lease_expires_at is null or r.lease_expires_at <= now()))
      )
    order by r.remind_at, r.id
    for update of r skip locked
    limit p_limit
  ), claimed as (
    update public.reminders r
    set status = 'processing', lease_owner = p_lease_owner,
        lease_token = gen_random_uuid(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        attempt_count = r.attempt_count + 1,
        last_correlation_id = gen_random_uuid(), updated_at = now()
    from candidates c
    where r.id = c.id
    returning r.*
  ), deliveries as (
    insert into public.reminder_deliveries (
      organization_id, reminder_id, attempt_number, lease_token,
      delivery_channel, status, correlation_id
    )
    select organization_id, id, attempt_count, lease_token,
      delivery_channel, 'processing', last_correlation_id
    from claimed
    returning reminder_id
  )
  select claimed.* from claimed join deliveries on deliveries.reminder_id = claimed.id;
end;
$function$;

create or replace function private.mark_reminder_dispatch_started(
  p_organization_id uuid,
  p_reminder_id uuid,
  p_lease_token uuid,
  p_attempt integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_started_at timestamptz;
begin
  update public.reminder_deliveries d
  set dispatch_started_at = coalesce(d.dispatch_started_at, now())
  from public.reminders r
  where d.reminder_id = p_reminder_id and d.organization_id = p_organization_id
    and d.attempt_number = p_attempt and d.lease_token = p_lease_token
    and d.status = 'processing' and r.id = d.reminder_id
    and r.organization_id = d.organization_id and r.status = 'processing'
    and r.lease_token = p_lease_token and r.attempt_count = p_attempt
    and r.lease_expires_at > now()
  returning d.dispatch_started_at into v_started_at;

  if not found then return jsonb_build_object('ok', false, 'code', 'lease_mismatch'); end if;
  return jsonb_build_object('ok', true, 'dispatchStartedAt', v_started_at);
end;
$function$;

create or replace function private.complete_reminder_delivery(
  p_organization_id uuid,
  p_reminder_id uuid,
  p_lease_token uuid,
  p_attempt integer,
  p_status text,
  p_provider_message_id text default null,
  p_error_code text default null,
  p_retry_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reminder public.reminders%rowtype;
  v_next_status text;
begin
  if p_status not in ('sent', 'failed', 'uncertain') then
    raise exception using errcode = '22023', message = 'invalid reminder delivery status';
  end if;

  select * into v_reminder
  from public.reminders
  where id = p_reminder_id and organization_id = p_organization_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_reminder.status <> 'processing'
     or v_reminder.lease_token <> p_lease_token
     or v_reminder.attempt_count <> p_attempt then
    return jsonb_build_object('ok', false, 'code', 'lease_mismatch', 'status', v_reminder.status);
  end if;

  update public.reminder_deliveries
  set status = p_status, provider_message_id = p_provider_message_id,
      error_code = p_error_code, completed_at = now()
  where reminder_id = p_reminder_id and attempt_number = p_attempt
    and lease_token = p_lease_token and status = 'processing'
    and (p_status = 'failed' or dispatch_started_at is not null);
  if not found then
    return jsonb_build_object('ok', false, 'code', 'delivery_attempt_mismatch');
  end if;

  if p_status = 'sent' then
    v_next_status := 'sent';
  elsif p_status = 'uncertain' then
    v_next_status := 'uncertain';
  elsif p_retry_at is not null and v_reminder.attempt_count < v_reminder.max_attempts then
    v_next_status := 'scheduled';
  else
    v_next_status := 'failed';
  end if;

  update public.reminders
  set status = v_next_status,
      remind_at = case when v_next_status = 'scheduled' then greatest(p_retry_at, now() + interval '15 seconds') else remind_at end,
      lease_owner = null, lease_token = null, lease_expires_at = null,
      last_error_code = p_error_code, updated_at = now()
  where id = p_reminder_id;

  return jsonb_build_object('ok', true, 'status', v_next_status, 'attempt', p_attempt);
end;
$function$;

create or replace function private.receive_webhook(
  p_provider text,
  p_provider_event_id text,
  p_correlation_id uuid,
  p_payload_hash text,
  p_signature_hash text,
  p_payload_redacted jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_receipt public.webhook_receipts%rowtype;
begin
  if p_signature_hash is null or p_signature_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid webhook signature hash';
  end if;

  insert into public.webhook_receipts (
    provider, provider_event_id, correlation_id, payload_hash,
    signature_hash, payload_redacted
  ) values (
    p_provider, p_provider_event_id, p_correlation_id, p_payload_hash,
    p_signature_hash, coalesce(p_payload_redacted, '{}'::jsonb)
  ) on conflict (provider, provider_event_id) do nothing
  returning * into v_receipt;

  if found then
    return jsonb_build_object(
      'ok', true, 'receiptId', v_receipt.id,
      'duplicate', false, 'status', v_receipt.status
    );
  end if;

  select * into v_receipt from public.webhook_receipts
  where provider = p_provider and provider_event_id = p_provider_event_id
  for update;

  if v_receipt.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'code', 'provider_event_payload_mismatch');
  end if;
  return jsonb_build_object(
    'ok', true, 'receiptId', v_receipt.id,
    'duplicate', true, 'status', v_receipt.status
  );
end;
$function$;

create or replace function private.claim_webhook_receipts(
  p_lease_owner text,
  p_provider text default null,
  p_limit integer default 50,
  p_lease_seconds integer default 120
)
returns setof public.webhook_receipts
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_lease_owner is null or length(p_lease_owner) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'invalid lease owner';
  end if;
  if p_limit not between 1 and 100 or p_lease_seconds not between 30 and 600 then
    raise exception using errcode = '22023', message = 'invalid webhook claim settings';
  end if;

  update public.webhook_receipts
  set status = 'uncertain', error_code = 'retry_attempts_exhausted',
      lease_owner = null, lease_token = null, lease_expires_at = null,
      processed_at = now(), updated_at = now()
  where status = 'processing'
    and lease_expires_at <= now()
    and attempt_count >= max_attempts;

  return query
  with candidates as (
    select w.id from public.webhook_receipts w
    where (p_provider is null or w.provider = p_provider)
      and (w.status = 'received'
        or (w.status = 'processing' and (w.lease_expires_at is null or w.lease_expires_at <= now())))
      and w.attempt_count < w.max_attempts
    order by w.received_at, w.id
    for update skip locked
    limit p_limit
  )
  update public.webhook_receipts w
  set status = 'processing', lease_owner = p_lease_owner,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1, updated_at = now()
  from candidates c where w.id = c.id
  returning w.*;
end;
$function$;

create or replace function private.finish_webhook_receipt(
  p_receipt_id uuid,
  p_lease_token uuid,
  p_status text,
  p_organization_id uuid default null,
  p_http_status integer default null,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_status not in ('processed', 'rejected', 'failed', 'uncertain') then
    raise exception using errcode = '22023', message = 'invalid webhook terminal status';
  end if;

  update public.webhook_receipts
  set status = p_status, organization_id = coalesce(p_organization_id, organization_id),
      http_status = p_http_status, error_code = p_error_code,
      lease_owner = null, lease_token = null, lease_expires_at = null,
      processed_at = now(), updated_at = now()
  where id = p_receipt_id and status = 'processing' and lease_token = p_lease_token
    and (
      organization_id is null
      or p_organization_id is null
      or organization_id = p_organization_id
    );

  if not found then return jsonb_build_object('ok', false, 'code', 'lease_or_tenant_mismatch'); end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end;
$function$;

create or replace function private.post_voice_wallet_entry(
  p_organization_id uuid,
  p_entry_type text,
  p_amount_minor bigint,
  p_provider text,
  p_provider_reference text,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_description text,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing public.voice_wallet_ledger%rowtype;
  v_provider text := nullif(p_provider, '');
  v_provider_reference text := nullif(p_provider_reference, '');
  v_metadata jsonb := coalesce(p_metadata_redacted, '{}'::jsonb);
  v_balance bigint;
  v_new_balance bigint;
  v_entry public.voice_wallet_ledger%rowtype;
begin
  if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'invalid wallet idempotency key';
  end if;
  if p_correlation_id is null or p_description is null or length(trim(p_description)) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'invalid wallet audit metadata';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':voice-wallet', 0));

  select * into v_existing from public.voice_wallet_ledger
  where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.entry_type <> p_entry_type or v_existing.amount_minor <> p_amount_minor
       or v_existing.provider is distinct from v_provider
       or v_existing.provider_reference is distinct from v_provider_reference
       or v_existing.description <> p_description
       or v_existing.metadata_redacted <> v_metadata then
      return jsonb_build_object('ok', false, 'code', 'idempotency_payload_mismatch');
    end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'entryId', v_existing.id, 'balanceAfterMinor', v_existing.balance_after_minor);
  end if;

  if v_provider is not null and v_provider_reference is not null then
    select * into v_existing
    from public.voice_wallet_ledger
    where provider = v_provider and provider_reference = v_provider_reference;
    if found then
      return jsonb_build_object(
        'ok', false,
        'code', 'provider_reference_conflict',
        'entryId', v_existing.id
      );
    end if;
  end if;

  select balance_after_minor into v_balance
  from public.voice_wallet_ledger
  where organization_id = p_organization_id
  order by created_at desc, id desc limit 1;
  v_new_balance := coalesce(v_balance, 0) + p_amount_minor;
  if v_new_balance < 0 then
    return jsonb_build_object('ok', false, 'code', 'insufficient_balance');
  end if;

  insert into public.voice_wallet_ledger (
    organization_id, entry_type, amount_minor, balance_after_minor,
    provider, provider_reference, idempotency_key, correlation_id,
    description, metadata_redacted
  ) values (
    p_organization_id, p_entry_type, p_amount_minor, v_new_balance,
    v_provider, v_provider_reference, p_idempotency_key,
    p_correlation_id, p_description, v_metadata
  ) returning * into v_entry;

  return jsonb_build_object('ok', true, 'replayed', false, 'entryId', v_entry.id, 'balanceAfterMinor', v_entry.balance_after_minor);
end;
$function$;

create or replace function private.prevent_ledger_change()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using errcode = '55000', message = 'ledger rows are immutable';
end;
$function$;

create or replace function private.protect_reminder_runtime_fields()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user = 'authenticated' and (
    new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.created_by is distinct from old.created_by
    or new.idempotency_key is distinct from old.idempotency_key
    or new.created_at is distinct from old.created_at
    or new.lease_owner is distinct from old.lease_owner
    or new.lease_token is distinct from old.lease_token
    or new.lease_expires_at is distinct from old.lease_expires_at
    or new.attempt_count is distinct from old.attempt_count
    or new.max_attempts is distinct from old.max_attempts
    or new.last_error_code is distinct from old.last_error_code
    or new.last_correlation_id is distinct from old.last_correlation_id
    or (new.status is distinct from old.status and new.status <> 'cancelled')
  ) then
    raise exception using errcode = '42501', message = 'reminder runtime fields are service managed';
  end if;
  return new;
end;
$function$;

create or replace function private.protect_task_binding()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user = 'authenticated' and (
    new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.created_by is distinct from old.created_by
    or new.idempotency_key is distinct from old.idempotency_key
    or new.created_at is distinct from old.created_at
  ) then
    raise exception using errcode = '42501', message = 'task binding fields are immutable';
  end if;
  return new;
end;
$function$;

revoke all on function private.claim_orchestration_command(uuid, uuid, uuid, integer, text, text, text, uuid, uuid, text, text, jsonb, text, integer) from public, anon, authenticated;
revoke all on function private.mark_orchestration_dispatch_started(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function private.finish_orchestration_command(uuid, uuid, uuid, integer, text, jsonb, text, text, boolean) from public, anon, authenticated;
revoke all on function private.claim_due_reminders(text, integer, integer) from public, anon, authenticated;
revoke all on function private.mark_reminder_dispatch_started(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function private.complete_reminder_delivery(uuid, uuid, uuid, integer, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.receive_webhook(text, text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.claim_webhook_receipts(text, text, integer, integer) from public, anon, authenticated;
revoke all on function private.finish_webhook_receipt(uuid, uuid, text, uuid, integer, text) from public, anon, authenticated;
revoke all on function private.post_voice_wallet_entry(uuid, text, bigint, text, text, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.prevent_ledger_change() from public, anon, authenticated;
revoke all on function private.protect_reminder_runtime_fields() from public, anon, authenticated, service_role;
revoke all on function private.protect_task_binding() from public, anon, authenticated, service_role;

grant execute on function private.claim_orchestration_command(uuid, uuid, uuid, integer, text, text, text, uuid, uuid, text, text, jsonb, text, integer) to service_role;
grant execute on function private.mark_orchestration_dispatch_started(uuid, uuid, uuid, integer) to service_role;
grant execute on function private.finish_orchestration_command(uuid, uuid, uuid, integer, text, jsonb, text, text, boolean) to service_role;
grant execute on function private.claim_due_reminders(text, integer, integer) to service_role;
grant execute on function private.mark_reminder_dispatch_started(uuid, uuid, uuid, integer) to service_role;
grant execute on function private.complete_reminder_delivery(uuid, uuid, uuid, integer, text, text, text, timestamptz) to service_role;
grant execute on function private.receive_webhook(text, text, uuid, text, text, jsonb) to service_role;
grant execute on function private.claim_webhook_receipts(text, text, integer, integer) to service_role;
grant execute on function private.finish_webhook_receipt(uuid, uuid, text, uuid, integer, text) to service_role;
grant execute on function private.post_voice_wallet_entry(uuid, text, bigint, text, text, text, uuid, text, jsonb) to service_role;

create or replace function public.claim_orchestration_command(
  p_organization_id uuid, p_actor_user_id uuid, p_conversation_id uuid,
  p_schema_version integer, p_channel text, p_intent text, p_retry_class text,
  p_action_id uuid, p_correlation_id uuid, p_idempotency_key text,
  p_canonical_payload_hash text, p_redacted_payload jsonb,
  p_lease_owner text, p_lease_seconds integer default 60
)
returns jsonb language sql security invoker set search_path = '' as $function$
  select private.claim_orchestration_command(
    p_organization_id, p_actor_user_id, p_conversation_id, p_schema_version,
    p_channel, p_intent, p_retry_class, p_action_id, p_correlation_id,
    p_idempotency_key, p_canonical_payload_hash, p_redacted_payload,
    p_lease_owner, p_lease_seconds
  );
$function$;

create or replace function public.mark_orchestration_dispatch_started(
  p_organization_id uuid, p_command_id uuid, p_lease_token uuid, p_attempt integer
)
returns jsonb language sql security invoker set search_path = '' as $function$
  select private.mark_orchestration_dispatch_started(p_organization_id, p_command_id, p_lease_token, p_attempt);
$function$;

create or replace function public.finish_orchestration_command(
  p_organization_id uuid, p_command_id uuid, p_lease_token uuid,
  p_attempt integer, p_status text, p_result_redacted jsonb default '{}'::jsonb,
  p_result_fingerprint text default null, p_error_code text default null,
  p_error_retryable boolean default null
)
returns jsonb language sql security invoker set search_path = '' as $function$
  select private.finish_orchestration_command(
    p_organization_id, p_command_id, p_lease_token, p_attempt, p_status,
    p_result_redacted, p_result_fingerprint, p_error_code, p_error_retryable
  );
$function$;

create or replace function public.claim_due_reminders(
  p_lease_owner text, p_limit integer default 50, p_lease_seconds integer default 120
)
returns setof public.reminders language sql security invoker set search_path = '' as $function$
  select * from private.claim_due_reminders(p_lease_owner, p_limit, p_lease_seconds);
$function$;

create or replace function public.complete_reminder_delivery(
  p_organization_id uuid, p_reminder_id uuid, p_lease_token uuid,
  p_attempt integer, p_status text, p_provider_message_id text default null,
  p_error_code text default null, p_retry_at timestamptz default null
)
returns jsonb language sql security invoker set search_path = '' as $function$
  select private.complete_reminder_delivery(
    p_organization_id, p_reminder_id, p_lease_token, p_attempt, p_status,
    p_provider_message_id, p_error_code, p_retry_at
  );
$function$;

create or replace function public.mark_reminder_dispatch_started(
  p_organization_id uuid, p_reminder_id uuid,
  p_lease_token uuid, p_attempt integer
)
returns jsonb language sql security invoker set search_path = '' as $function$
  select private.mark_reminder_dispatch_started(
    p_organization_id, p_reminder_id, p_lease_token, p_attempt
  );
$function$;

create or replace function public.receive_webhook(
  p_provider text, p_provider_event_id text, p_correlation_id uuid,
  p_payload_hash text, p_signature_hash text, p_payload_redacted jsonb default '{}'::jsonb
)
returns jsonb language sql security invoker set search_path = '' as $function$
  select private.receive_webhook(
    p_provider, p_provider_event_id, p_correlation_id,
    p_payload_hash, p_signature_hash, p_payload_redacted
  );
$function$;

create or replace function public.claim_webhook_receipts(
  p_lease_owner text, p_provider text default null,
  p_limit integer default 50, p_lease_seconds integer default 120
)
returns setof public.webhook_receipts language sql security invoker set search_path = '' as $function$
  select * from private.claim_webhook_receipts(p_lease_owner, p_provider, p_limit, p_lease_seconds);
$function$;

create or replace function public.finish_webhook_receipt(
  p_receipt_id uuid, p_lease_token uuid, p_status text,
  p_organization_id uuid default null, p_http_status integer default null,
  p_error_code text default null
)
returns jsonb language sql security invoker set search_path = '' as $function$
  select private.finish_webhook_receipt(
    p_receipt_id, p_lease_token, p_status, p_organization_id, p_http_status, p_error_code
  );
$function$;

create or replace function public.post_voice_wallet_entry(
  p_organization_id uuid, p_entry_type text, p_amount_minor bigint,
  p_provider text, p_provider_reference text, p_idempotency_key text,
  p_correlation_id uuid, p_description text,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns jsonb language sql security invoker set search_path = '' as $function$
  select private.post_voice_wallet_entry(
    p_organization_id, p_entry_type, p_amount_minor, p_provider,
    p_provider_reference, p_idempotency_key, p_correlation_id,
    p_description, p_metadata_redacted
  );
$function$;

revoke all on function public.claim_orchestration_command(uuid, uuid, uuid, integer, text, text, text, uuid, uuid, text, text, jsonb, text, integer) from public, anon, authenticated;
revoke all on function public.mark_orchestration_dispatch_started(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_orchestration_command(uuid, uuid, uuid, integer, text, jsonb, text, text, boolean) from public, anon, authenticated;
revoke all on function public.claim_due_reminders(text, integer, integer) from public, anon, authenticated;
revoke all on function public.mark_reminder_dispatch_started(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_reminder_delivery(uuid, uuid, uuid, integer, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.receive_webhook(text, text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.claim_webhook_receipts(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.finish_webhook_receipt(uuid, uuid, text, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.post_voice_wallet_entry(uuid, text, bigint, text, text, text, uuid, text, jsonb) from public, anon, authenticated;

grant execute on function public.claim_orchestration_command(uuid, uuid, uuid, integer, text, text, text, uuid, uuid, text, text, jsonb, text, integer) to service_role;
grant execute on function public.mark_orchestration_dispatch_started(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.finish_orchestration_command(uuid, uuid, uuid, integer, text, jsonb, text, text, boolean) to service_role;
grant execute on function public.claim_due_reminders(text, integer, integer) to service_role;
grant execute on function public.mark_reminder_dispatch_started(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.complete_reminder_delivery(uuid, uuid, uuid, integer, text, text, text, timestamptz) to service_role;
grant execute on function public.receive_webhook(text, text, uuid, text, text, jsonb) to service_role;
grant execute on function public.claim_webhook_receipts(text, text, integer, integer) to service_role;
grant execute on function public.finish_webhook_receipt(uuid, uuid, text, uuid, integer, text) to service_role;
grant execute on function public.post_voice_wallet_entry(uuid, text, bigint, text, text, text, uuid, text, jsonb) to service_role;

create trigger voice_wallet_ledger_immutable
before update or delete on public.voice_wallet_ledger
for each row execute function private.prevent_ledger_change();

create trigger reminders_protect_runtime_fields
before update on public.reminders
for each row execute function private.protect_reminder_runtime_fields();

create trigger tasks_protect_binding
before update on public.tasks
for each row execute function private.protect_task_binding();

create trigger orchestration_commands_updated_at before update on public.orchestration_commands for each row execute function private.set_updated_at();
create trigger webhook_receipts_updated_at before update on public.webhook_receipts for each row execute function private.set_updated_at();
create trigger phone_number_assignments_updated_at before update on public.phone_number_assignments for each row execute function private.set_updated_at();
create trigger voice_sessions_updated_at before update on public.voice_sessions for each row execute function private.set_updated_at();

do $block$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'tasks', 'reminders', 'workflow_events', 'approval_requests',
      'approval_decisions', 'integration_connections', 'channel_identities',
      'usage_counters', 'orchestration_commands', 'reminder_deliveries',
      'voice_sessions', 'voice_wallet_ledger'
    ]
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$block$;

notify pgrst, 'reload schema';
