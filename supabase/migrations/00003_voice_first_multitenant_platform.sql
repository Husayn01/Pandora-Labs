-- Pandora Labs voice-first, multi-tenant production foundation.
-- Additive migration: legacy agent-store data is preserved until a verified cleanup migration.

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tenant, identity, and entitlement foundation
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    phone_number text,
    timezone text not null default 'Africa/Lagos',
    onboarding_completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- `profiles` already exists when this migration follows the legacy ops
-- baseline. CREATE TABLE IF NOT EXISTS does not merge missing columns, so the
-- transition must be explicit for a clean database replay.
alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

create table if not exists public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    owner_user_id uuid not null references auth.users(id) on delete restrict,
    timezone text not null default 'Africa/Lagos',
    locale text not null default 'en-NG',
    plan_code text not null default 'free',
    status text not null default 'active',
    business_profile jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint organizations_plan_check check (plan_code in ('free','solo','business','scale')),
    constraint organizations_status_check check (status in ('active','past_due','suspended','closed'))
);

create table if not exists public.organization_members (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'member',
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, user_id),
    constraint organization_members_role_check check (role in ('owner','admin','member','viewer')),
    constraint organization_members_status_check check (status in ('invited','active','suspended'))
);

create table if not exists public.integration_connections (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    connected_by uuid references auth.users(id) on delete set null,
    provider text not null,
    status text not null default 'pending',
    scopes text[] not null default '{}',
    vault_secret_id uuid,
    external_account_id text,
    external_account_label text,
    token_expires_at timestamptz,
    last_checked_at timestamptz,
    last_error_code text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, provider, external_account_id),
    constraint integration_provider_check check (provider in ('google_workspace','twilio','telegram','whatsapp','elevenlabs')),
    constraint integration_status_check check (status in ('pending','connected','expired','revoked','error'))
);

create table if not exists public.channel_identities (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null,
    channel text not null,
    external_id_hash text not null,
    display_hint text,
    role text not null default 'public_customer',
    verified_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (channel, external_id_hash),
    constraint channel_identities_channel_check check (channel in ('web','phone','sms','telegram','whatsapp','ussd','elevenlabs')),
    constraint channel_identities_role_check check (role in ('public_customer','owner','admin','member'))
);

alter table public.channel_identities
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists external_id_hash text,
  add column if not exists display_hint text,
  add column if not exists role text not null default 'public_customer',
  add column if not exists verified_at timestamptz;

alter table public.channel_identities
  drop constraint if exists channel_identities_channel_check,
  drop constraint if exists channel_identities_role_check;
alter table public.channel_identities
  add constraint channel_identities_channel_check
    check (channel in ('web','phone','sms','telegram','whatsapp','ussd','elevenlabs')),
  add constraint channel_identities_role_check
    check (role in ('public_customer','owner','admin','member'));

create table if not exists public.channel_link_tokens (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    channel text not null,
    token_hash text not null unique,
    expires_at timestamptz not null,
    redeemed_at timestamptz,
    created_at timestamptz not null default now(),
    constraint channel_link_tokens_channel_check check (channel in ('phone','sms','telegram','whatsapp'))
);

-- ---------------------------------------------------------------------------
-- Conversations and business operations
-- ---------------------------------------------------------------------------

alter table public.conversations add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.conversations add column if not exists actor_user_id uuid references auth.users(id) on delete set null;
alter table public.conversations add column if not exists correlation_id uuid default gen_random_uuid();
alter table public.conversations add column if not exists elevenlabs_conversation_id text;
alter table public.conversations add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.messages add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.tasks (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    created_by uuid references auth.users(id) on delete set null,
    assignee_id uuid references auth.users(id) on delete set null,
    title text not null,
    description text,
    status text not null default 'open',
    priority text not null default 'normal',
    due_at timestamptz,
    source_channel text not null default 'web',
    idempotency_key text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint tasks_status_check check (status in ('open','in_progress','blocked','done','cancelled')),
    constraint tasks_priority_check check (priority in ('low','normal','high','urgent')),
    unique (organization_id, idempotency_key)
);

alter table public.tasks
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists assignee_id uuid references auth.users(id) on delete set null,
  add column if not exists idempotency_key text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.reminders (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    task_id uuid references public.tasks(id) on delete set null,
    created_by uuid references auth.users(id) on delete set null,
    title text not null,
    body text,
    remind_at timestamptz not null,
    status text not null default 'scheduled',
    delivery_channel text not null default 'web',
    idempotency_key text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint reminders_status_check check (status in ('scheduled','processing','sent','cancelled','failed')),
    constraint reminders_delivery_check check (delivery_channel in ('web','email','sms','phone','telegram','whatsapp')),
    unique (organization_id, idempotency_key)
);

alter table public.reminders
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists idempotency_key text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.reminders
  drop constraint if exists reminders_status_check,
  drop constraint if exists reminders_delivery_channel_check,
  drop constraint if exists reminders_delivery_check;
alter table public.reminders
  add constraint reminders_status_check
    check (status in ('scheduled','processing','sent','cancelled','failed')),
  add constraint reminders_delivery_check
    check (delivery_channel in ('web','email','sms','phone','telegram','whatsapp'));

create table if not exists public.approval_requests (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    conversation_id uuid references public.conversations(id) on delete set null,
    requested_by uuid references auth.users(id) on delete set null,
    action_type text not null,
    risk_level text not null,
    status text not null default 'pending',
    action_preview jsonb not null,
    action_payload_hash text not null,
    idempotency_key text not null,
    expires_at timestamptz not null,
    decided_by uuid references auth.users(id) on delete set null,
    decided_at timestamptz,
    created_at timestamptz not null default now(),
    unique (organization_id, idempotency_key),
    constraint approval_risk_check check (risk_level in ('low','normal','high','destructive','financial')),
    constraint approval_status_check check (status in ('pending','approved','rejected','expired','executed','failed'))
);

create table if not exists public.workflow_events (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    actor_user_id uuid references auth.users(id) on delete set null,
    conversation_id uuid references public.conversations(id) on delete set null,
    workflow_name text not null,
    execution_id text,
    correlation_id text not null,
    event_type text not null,
    status text not null default 'info',
    summary text,
    redacted_payload jsonb not null default '{}'::jsonb,
    idempotency_key text,
    created_at timestamptz not null default now(),
    constraint workflow_events_status_check check (status in ('info','success','warning','error')),
    unique (organization_id, idempotency_key)
);

alter table public.workflow_events
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists correlation_id text,
  add column if not exists redacted_payload jsonb not null default '{}'::jsonb,
  add column if not exists idempotency_key text;

create table if not exists public.knowledge_sources (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    created_by uuid references auth.users(id) on delete set null,
    source_type text not null,
    title text not null,
    elevenlabs_document_id text,
    source_url text,
    status text not null default 'pending',
    byte_size bigint not null default 0,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint knowledge_source_type_check check (source_type in ('text','file','url')),
    constraint knowledge_source_status_check check (status in ('pending','ready','failed','archived'))
);

create table if not exists public.invoices (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    created_by uuid references auth.users(id) on delete set null,
    invoice_number text not null,
    customer_name text not null,
    customer_email text,
    currency text not null default 'NGN',
    status text not null default 'draft',
    subtotal_minor bigint not null default 0,
    tax_minor bigint not null default 0,
    total_minor bigint not null default 0,
    due_at timestamptz,
    notes text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, invoice_number),
    constraint invoice_status_check check (status in ('draft','approved','sent','paid','overdue','void'))
);

create table if not exists public.invoice_items (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid not null references public.invoices(id) on delete cascade,
    description text not null,
    quantity numeric(12,2) not null default 1,
    unit_price_minor bigint not null,
    total_minor bigint not null,
    sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Billing and metering
-- ---------------------------------------------------------------------------

create table if not exists public.billing_customers (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null unique references public.organizations(id) on delete cascade,
    provider text not null default 'paystack',
    provider_customer_code text unique,
    email text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint billing_provider_check check (provider in ('paystack'))
);

create table if not exists public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null unique references public.organizations(id) on delete cascade,
    billing_customer_id uuid references public.billing_customers(id) on delete set null,
    plan_code text not null default 'free',
    status text not null default 'active',
    provider_subscription_code text unique,
    provider_plan_code text,
    current_period_start timestamptz,
    current_period_end timestamptz,
    cancel_at_period_end boolean not null default false,
    voice_credit_minor bigint not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint subscriptions_plan_check check (plan_code in ('free','solo','business','scale')),
    constraint subscriptions_status_check check (status in ('active','trialing','past_due','cancelled','expired','paused'))
);

create table if not exists public.billing_events (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations(id) on delete set null,
    provider text not null default 'paystack',
    provider_event_id text not null unique,
    event_type text not null,
    signature_verified boolean not null default false,
    processed_at timestamptz,
    payload_hash text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.usage_events (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    metric text not null,
    quantity numeric(14,4) not null,
    source_id text not null,
    period_key text not null,
    occurred_at timestamptz not null default now(),
    metadata jsonb not null default '{}'::jsonb,
    unique (organization_id, metric, source_id)
);

create table if not exists public.usage_counters (
    organization_id uuid not null references public.organizations(id) on delete cascade,
    metric text not null,
    period_key text not null,
    quantity numeric(14,4) not null default 0,
    updated_at timestamptz not null default now(),
    primary key (organization_id, metric, period_key)
);

-- ---------------------------------------------------------------------------
-- Backfill one isolated organization per existing user without losing data.
-- ---------------------------------------------------------------------------

-- Remove the legacy user-scoped policies before dropping legacy ownership
-- columns. The tenant-scoped replacements are created later in this migration.
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles',
        'channel_identities',
        'conversations',
        'messages',
        'tasks',
        'reminders',
        'workflow_events'
      )
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end
$$;

insert into public.profiles (user_id, display_name)
select id, nullif(raw_user_meta_data ->> 'full_name', '')
from auth.users
on conflict (user_id) do nothing;

alter table public.profiles
  drop column if exists default_calendar_id,
  drop column if exists approval_channel;

insert into public.organizations (name, slug, owner_user_id, timezone)
select
    coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1), 'Pandora') || '''s workspace',
    'workspace-' || replace(u.id::text, '-', ''),
    u.id,
    'Africa/Lagos'
from auth.users u
where not exists (select 1 from public.organizations o where o.owner_user_id = u.id);

insert into public.organization_members (organization_id, user_id, role, status)
select o.id, o.owner_user_id, 'owner', 'active'
from public.organizations o
on conflict (organization_id, user_id) do nothing;

-- Legacy channel identities were user-owned and stored a plaintext external
-- identifier. A reset database should normally have no rows here. For a
-- legacy replay, bind each row to the user's isolated workspace, preserve only
-- a short display hint, and replace the plaintext value with a deterministic
-- one-way transition hash. Production identifiers must subsequently be linked
-- through the trusted gateway using CHANNEL_IDENTITY_PEPPER.
update public.channel_identities ci
set organization_id = o.id,
    external_id_hash = coalesce(
      ci.external_id_hash,
      pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(o.id::text || ':' || ci.channel || ':' || ci.external_id, 'UTF8'),
          'sha256'
        ),
        'hex'
      )
    ),
    display_hint = coalesce(ci.display_hint, right(ci.external_id, 4)),
    role = coalesce(m.role, 'member'),
    verified_at = coalesce(ci.verified_at, ci.created_at)
from public.organizations o
join public.organization_members m
  on m.organization_id = o.id
 and m.user_id = o.owner_user_id
where ci.user_id = o.owner_user_id
  and ci.organization_id is null;

alter table public.channel_identities
  alter column organization_id set not null,
  alter column external_id_hash set not null;
alter table public.channel_identities
  drop column if exists external_id,
  drop column if exists is_primary;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'channel_identities_channel_external_hash_key'
      and conrelid = 'public.channel_identities'::regclass
  ) then
    alter table public.channel_identities
      add constraint channel_identities_channel_external_hash_key
      unique (channel, external_id_hash);
  end if;
end
$$;

update public.tasks t
set organization_id = o.id,
    created_by = coalesce(t.created_by, t.user_id),
    metadata = coalesce(t.metadata, '{}'::jsonb) || coalesce(t.external_ref, '{}'::jsonb)
from public.organizations o
where t.user_id = o.owner_user_id
  and t.organization_id is null;

alter table public.tasks alter column organization_id set not null;
alter table public.tasks
  drop column if exists user_id,
  drop column if exists external_ref;

update public.reminders r
set organization_id = o.id,
    created_by = coalesce(r.created_by, r.user_id),
    metadata = coalesce(r.metadata, '{}'::jsonb) || coalesce(r.external_ref, '{}'::jsonb)
from public.organizations o
where r.user_id = o.owner_user_id
  and r.organization_id is null;

alter table public.reminders alter column organization_id set not null;
alter table public.reminders
  drop column if exists user_id,
  drop column if exists source_channel,
  drop column if exists external_ref;

update public.workflow_events e
set organization_id = o.id,
    actor_user_id = coalesce(e.actor_user_id, e.user_id),
    correlation_id = coalesce(e.correlation_id, gen_random_uuid()::text),
    redacted_payload = jsonb_build_object('legacy_event', true)
from public.organizations o
where e.user_id = o.owner_user_id
  and e.organization_id is null;

alter table public.workflow_events
  alter column organization_id set not null,
  alter column correlation_id set not null;
alter table public.workflow_events
  drop column if exists user_id,
  drop column if exists payload;

update public.conversations c
set organization_id = o.id,
    actor_user_id = c.user_id
from public.organizations o
where c.organization_id is null and o.owner_user_id = c.user_id;

alter table public.conversations alter column organization_id set not null;

-- Recreate the idempotency constraints skipped when the legacy tables already
-- existed. PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS syntax.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_organization_id_idempotency_key_key'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_organization_id_idempotency_key_key
      unique (organization_id, idempotency_key);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reminders_organization_id_idempotency_key_key'
      and conrelid = 'public.reminders'::regclass
  ) then
    alter table public.reminders
      add constraint reminders_organization_id_idempotency_key_key
      unique (organization_id, idempotency_key);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'workflow_events_organization_id_idempotency_key_key'
      and conrelid = 'public.workflow_events'::regclass
  ) then
    alter table public.workflow_events
      add constraint workflow_events_organization_id_idempotency_key_key
      unique (organization_id, idempotency_key);
  end if;
end
$$;

insert into public.subscriptions (organization_id, plan_code, status)
select id, plan_code, 'active' from public.organizations
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------------------
-- Safe helpers and lifecycle triggers
-- ---------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function private.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function private.has_org_role(target_org uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_org_role(uuid,text[]) from public;
grant usage on schema private to authenticated, service_role;
grant execute on function private.is_org_member(uuid) to authenticated, service_role;
grant execute on function private.has_org_role(uuid,text[]) to authenticated, service_role;

create or replace function private.provision_pandora_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare new_org_id uuid;
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;

  insert into public.organizations (name, slug, owner_user_id)
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1), 'Pandora') || '''s workspace',
    'workspace-' || replace(new.id::text, '-', ''),
    new.id
  ) returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (new_org_id, new.id, 'owner', 'active');

  insert into public.subscriptions (organization_id, plan_code, status)
  values (new_org_id, 'free', 'active');
  return new;
end;
$$;

revoke all on function private.provision_pandora_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_install_default_agents on auth.users;
drop trigger if exists on_auth_user_created_profile on auth.users;
drop function if exists private.auto_install_default_agents();
drop function if exists private.auto_create_profile();
drop trigger if exists on_auth_user_created_pandora on auth.users;
create trigger on_auth_user_created_pandora
after insert on auth.users
for each row execute function private.provision_pandora_user();

-- Remove legacy public privileged RPC exposure and browser access to raw tokens.
drop function if exists public.auto_install_router_agent() cascade;
drop function if exists public.increment_messages_handled(uuid) cascade;
revoke all on public.user_connectors from anon, authenticated;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='user_connectors'
  loop execute format('drop policy if exists %I on public.user_connectors', p.policyname); end loop;
end $$;

-- Updated-at triggers for production tables.
do $$
declare t text;
begin
  foreach t in array array['profiles','organizations','organization_members','integration_connections','channel_identities','tasks','reminders','knowledge_sources','invoices','billing_customers','subscriptions']
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', t, t);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function private.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists organization_members_user_idx on public.organization_members(user_id, status);
create index if not exists organization_members_org_role_idx on public.organization_members(organization_id, role, status);
create index if not exists integration_connections_org_idx on public.integration_connections(organization_id, provider, status);
create index if not exists channel_identities_org_idx on public.channel_identities(organization_id, channel);
create index if not exists channel_link_tokens_expiry_idx on public.channel_link_tokens(expires_at) where redeemed_at is null;
create index if not exists conversations_org_created_idx on public.conversations(organization_id, created_at desc);
create unique index if not exists conversations_elevenlabs_unique_idx on public.conversations(elevenlabs_conversation_id) where elevenlabs_conversation_id is not null;
create index if not exists tasks_org_status_due_idx on public.tasks(organization_id, status, due_at);
create index if not exists reminders_org_status_at_idx on public.reminders(organization_id, status, remind_at);
create index if not exists approvals_org_status_expiry_idx on public.approval_requests(organization_id, status, expires_at);
create index if not exists workflow_events_org_created_idx on public.workflow_events(organization_id, created_at desc);
create index if not exists workflow_events_correlation_idx on public.workflow_events(correlation_id);
create index if not exists knowledge_sources_org_idx on public.knowledge_sources(organization_id, status);
create index if not exists invoices_org_status_idx on public.invoices(organization_id, status, due_at);
create index if not exists invoice_items_invoice_idx on public.invoice_items(invoice_id);
create index if not exists usage_events_org_period_idx on public.usage_events(organization_id, period_key, metric);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.integration_connections enable row level security;
alter table public.channel_identities enable row level security;
alter table public.channel_link_tokens enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.tasks enable row level security;
alter table public.reminders enable row level security;
alter table public.approval_requests enable row level security;
alter table public.workflow_events enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.usage_events enable row level security;
alter table public.usage_counters enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_self_update on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy organizations_member_select on public.organizations for select to authenticated using ((select private.is_org_member(id)));
create policy organizations_admin_update on public.organizations for update to authenticated using ((select private.has_org_role(id, array['owner','admin']))) with check ((select private.has_org_role(id, array['owner','admin'])));
create policy members_member_select on public.organization_members for select to authenticated using ((select private.is_org_member(organization_id)));
create policy members_admin_insert on public.organization_members for insert to authenticated with check ((select private.has_org_role(organization_id, array['owner','admin'])));
create policy members_admin_update on public.organization_members for update to authenticated using ((select private.has_org_role(organization_id, array['owner','admin']))) with check ((select private.has_org_role(organization_id, array['owner','admin'])));
create policy members_admin_delete on public.organization_members for delete to authenticated using ((select private.has_org_role(organization_id, array['owner','admin'])) and user_id <> (select auth.uid()));

create policy integrations_member_select on public.integration_connections for select to authenticated using ((select private.is_org_member(organization_id)));
create policy integrations_admin_write on public.integration_connections for all to authenticated using ((select private.has_org_role(organization_id, array['owner','admin']))) with check ((select private.has_org_role(organization_id, array['owner','admin'])));
create policy channels_member_select on public.channel_identities for select to authenticated using ((select private.is_org_member(organization_id)));
create policy channels_admin_write on public.channel_identities for all to authenticated using ((select private.has_org_role(organization_id, array['owner','admin']))) with check ((select private.has_org_role(organization_id, array['owner','admin'])));
create policy channel_tokens_owner_select on public.channel_link_tokens for select to authenticated using (user_id = (select auth.uid()) and (select private.is_org_member(organization_id)));

-- Replace legacy user-only chat policies with organization policies.
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname='public' and tablename in ('conversations','messages')
  loop execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename); end loop;
end $$;
create policy conversations_member_select on public.conversations for select to authenticated using ((select private.is_org_member(organization_id)));
create policy conversations_member_insert on public.conversations for insert to authenticated with check ((select private.is_org_member(organization_id)) and (actor_user_id is null or actor_user_id = (select auth.uid())));
create policy conversations_member_update on public.conversations for update to authenticated using ((select private.is_org_member(organization_id))) with check ((select private.is_org_member(organization_id)));
create policy conversations_member_delete on public.conversations for delete to authenticated using ((select private.has_org_role(organization_id, array['owner','admin'])) or actor_user_id = (select auth.uid()));
create policy messages_member_select on public.messages for select to authenticated using (exists (select 1 from public.conversations c where c.id=conversation_id and (select private.is_org_member(c.organization_id))));
create policy messages_member_insert on public.messages for insert to authenticated with check (exists (select 1 from public.conversations c where c.id=conversation_id and (select private.is_org_member(c.organization_id))));

create policy tasks_member_select on public.tasks for select to authenticated using ((select private.is_org_member(organization_id)));
create policy tasks_member_insert on public.tasks for insert to authenticated with check ((select private.is_org_member(organization_id)) and (created_by is null or created_by=(select auth.uid())));
create policy tasks_member_update on public.tasks for update to authenticated using ((select private.is_org_member(organization_id))) with check ((select private.is_org_member(organization_id)));
create policy tasks_admin_delete on public.tasks for delete to authenticated using ((select private.has_org_role(organization_id, array['owner','admin'])));
create policy reminders_member_select on public.reminders for select to authenticated using ((select private.is_org_member(organization_id)));
create policy reminders_member_write on public.reminders for all to authenticated using ((select private.is_org_member(organization_id))) with check ((select private.is_org_member(organization_id)));
create policy approvals_member_select on public.approval_requests for select to authenticated using ((select private.is_org_member(organization_id)));
create policy workflow_events_member_select on public.workflow_events for select to authenticated using ((select private.is_org_member(organization_id)));
create policy knowledge_member_select on public.knowledge_sources for select to authenticated using ((select private.is_org_member(organization_id)));
create policy knowledge_admin_write on public.knowledge_sources for all to authenticated using ((select private.has_org_role(organization_id, array['owner','admin']))) with check ((select private.has_org_role(organization_id, array['owner','admin'])));
create policy invoices_member_select on public.invoices for select to authenticated using ((select private.is_org_member(organization_id)));
create policy invoices_member_write on public.invoices for all to authenticated using ((select private.is_org_member(organization_id))) with check ((select private.is_org_member(organization_id)));
create policy invoice_items_member_select on public.invoice_items for select to authenticated using (exists (select 1 from public.invoices i where i.id=invoice_id and (select private.is_org_member(i.organization_id))));
create policy invoice_items_member_write on public.invoice_items for all to authenticated using (exists (select 1 from public.invoices i where i.id=invoice_id and (select private.is_org_member(i.organization_id)))) with check (exists (select 1 from public.invoices i where i.id=invoice_id and (select private.is_org_member(i.organization_id))));
create policy billing_customer_admin_select on public.billing_customers for select to authenticated using ((select private.has_org_role(organization_id, array['owner','admin'])));
create policy subscription_member_select on public.subscriptions for select to authenticated using ((select private.is_org_member(organization_id)));
create policy usage_member_select on public.usage_events for select to authenticated using ((select private.is_org_member(organization_id)));
create policy counters_member_select on public.usage_counters for select to authenticated using ((select private.is_org_member(organization_id)));

-- Browser grants are narrow; server automation uses service_role through trusted boundaries.
grant usage on schema public to authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.channel_identities from anon, authenticated;
revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.tasks from anon, authenticated;
revoke all on table public.reminders from anon, authenticated;
revoke all on table public.workflow_events from anon, authenticated;
revoke all on table public.approval_requests from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update, delete on public.integration_connections to authenticated;
grant select, insert, update, delete on public.channel_identities to authenticated;
grant select on public.channel_link_tokens to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.reminders to authenticated;
grant select on public.approval_requests to authenticated;
grant select on public.workflow_events to authenticated;
grant select, insert, update, delete on public.knowledge_sources to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_items to authenticated;
grant select on public.billing_customers, public.subscriptions, public.usage_events, public.usage_counters to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
