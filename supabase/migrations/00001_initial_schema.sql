-- Pandora Labs initial schema
-- Matches the current React app, Vercel API functions, and Supabase Storage usage.

create schema if not exists extensions;
create schema if not exists private;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

-- Agent catalog shown in the Agent Store.
create table public.agent_catalog (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    name text not null,
    description text,
    category text not null,
    icon text not null default 'Bot',
    type text not null,
    default_system_prompt text,
    capabilities jsonb not null default '[]'::jsonb,
    required_connectors jsonb not null default '[]'::jsonb,
    is_default boolean not null default false,
    is_premium boolean not null default false,
    sort_order integer not null default 100,
    created_at timestamptz not null default timezone('utc'::text, now())
);

-- Installed agents per user.
create table public.user_agents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    catalog_agent_id uuid not null references public.agent_catalog(id) on delete restrict,
    is_active boolean not null default true,
    custom_system_prompt text,
    config jsonb not null default '{}'::jsonb,
    messages_handled integer not null default 0,
    installed_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now()),
    unique (user_id, catalog_agent_id)
);

-- Uploaded knowledge files for RAG-style agents.
create table public.agent_knowledge_files (
    id uuid primary key default gen_random_uuid(),
    user_agent_id uuid not null references public.user_agents(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    file_name text not null,
    storage_path text not null unique,
    file_type text,
    file_size integer,
    status text not null default 'processing',
    created_at timestamptz not null default timezone('utc'::text, now()),
    constraint agent_knowledge_files_status_check
        check (status in ('processing', 'completed', 'failed'))
);

-- Embeddings generated from uploaded knowledge files.
create table public.knowledge_embeddings (
    id uuid primary key default gen_random_uuid(),
    file_id uuid not null references public.agent_knowledge_files(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    content text not null,
    embedding extensions.vector(768),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc'::text, now())
);

-- OAuth connectors. Tokens are server-managed and not exposed to the browser by RLS.
create table public.user_connectors (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    provider text not null,
    access_token text,
    refresh_token text,
    token_expiry timestamptz,
    scopes text[] not null default '{}',
    metadata jsonb not null default '{}'::jsonb,
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now()),
    unique (user_id, provider)
);

-- Chat conversations.
create table public.conversations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text,
    channel text not null default 'web',
    external_channel text,
    external_user_id text,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now())
);

create table public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    user_agent_id uuid references public.user_agents(id) on delete set null,
    sender_type text not null,
    content text not null,
    created_at timestamptz not null default timezone('utc'::text, now()),
    constraint messages_sender_type_check
        check (sender_type in ('user', 'agent', 'system'))
);

-- Indexes for RLS filters, joins, and chat ordering.
create index agent_catalog_sort_order_idx on public.agent_catalog (sort_order);
create index user_agents_user_id_idx on public.user_agents (user_id);
create index user_agents_catalog_agent_id_idx on public.user_agents (catalog_agent_id);
create index agent_knowledge_files_user_id_idx on public.agent_knowledge_files (user_id);
create index agent_knowledge_files_user_agent_id_idx on public.agent_knowledge_files (user_agent_id);
create index knowledge_embeddings_file_id_idx on public.knowledge_embeddings (file_id);
create index knowledge_embeddings_user_id_idx on public.knowledge_embeddings (user_id);
create index knowledge_embeddings_embedding_idx
    on public.knowledge_embeddings
    using ivfflat (embedding extensions.vector_cosine_ops)
    with (lists = 100);
create index user_connectors_user_id_idx on public.user_connectors (user_id);
create index conversations_user_id_created_at_idx on public.conversations (user_id, created_at desc);
create index messages_conversation_id_created_at_idx on public.messages (conversation_id, created_at);
create index messages_user_agent_id_idx on public.messages (user_agent_id);

-- Timestamp maintenance.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$;

create trigger set_user_agents_updated_at
before update on public.user_agents
for each row execute function private.set_updated_at();

create trigger set_user_connectors_updated_at
before update on public.user_connectors
for each row execute function private.set_updated_at();

create trigger set_conversations_updated_at
before update on public.conversations
for each row execute function private.set_updated_at();

-- Public RPC used by the server-side chat API. Only service_role can execute it.
create or replace function public.increment_messages_handled(row_id uuid)
returns void
language sql
set search_path = public
as $$
    update public.user_agents
    set messages_handled = messages_handled + 1,
        updated_at = timezone('utc'::text, now())
    where id = row_id;
$$;

revoke all on function public.increment_messages_handled(uuid) from public, anon, authenticated;
grant execute on function public.increment_messages_handled(uuid) to service_role;

-- Automatically install default agents, including the Pandora Router, for new users.
create or replace function private.auto_install_default_agents()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
    insert into public.user_agents (user_id, catalog_agent_id, is_active)
    select new.id, id, true
    from public.agent_catalog
    where is_default = true
    on conflict (user_id, catalog_agent_id) do nothing;

    return new;
end;
$$;

create trigger on_auth_user_created_install_default_agents
after insert on auth.users
for each row execute function private.auto_install_default_agents();

-- Seed the default catalog.
insert into public.agent_catalog (
    slug,
    name,
    description,
    category,
    icon,
    type,
    default_system_prompt,
    capabilities,
    required_connectors,
    is_default,
    is_premium,
    sort_order
) values
(
    'pandora-router',
    'Pandora Router',
    'Routes each user request to the best installed specialist agent.',
    'core',
    'Brain',
    'router',
    'You are the Pandora Router Agent. Decide which installed specialist should handle each request, then respond clearly and helpfully.',
    '["routing", "general_chat", "agent_orchestration"]'::jsonb,
    '[]'::jsonb,
    true,
    false,
    0
),
(
    'support-rag',
    'Customer Support Agent',
    'Answers customer questions using uploaded knowledge base files.',
    'communication',
    'Headphones',
    'support',
    'You are a customer support agent. Use the available business context and answer in a calm, practical tone.',
    '["knowledge_base", "faq_answers", "support_handoff"]'::jsonb,
    '[]'::jsonb,
    false,
    false,
    10
),
(
    'appointment-setter',
    'Appointment Setter',
    'Helps schedule meetings and manage calendar requests.',
    'productivity',
    'Calendar',
    'appointment',
    'You are an appointment-setting agent. Clarify dates, times, attendees, and intent before taking calendar actions.',
    '["calendar_scheduling", "meeting_planning", "reminders"]'::jsonb,
    '["google_calendar"]'::jsonb,
    false,
    false,
    20
),
(
    'invoice-payments',
    'Invoice & Payments Agent',
    'Drafts invoices, payment reminders, and receivables follow-ups.',
    'finance',
    'Receipt',
    'invoice',
    'You are an invoice and payments agent. Help prepare clear invoices, payment reminders, and finance summaries.',
    '["invoice_drafting", "payment_reminders", "receivables_tracking"]'::jsonb,
    '[]'::jsonb,
    false,
    false,
    30
),
(
    'daily-insights',
    'Daily Insights Agent',
    'Summarizes business activity and highlights operational trends.',
    'analytics',
    'BarChart3',
    'insights',
    'You are a business insights agent. Summarize trends, risks, and next actions using concise operational language.',
    '["daily_summary", "trend_analysis", "operational_insights"]'::jsonb,
    '[]'::jsonb,
    false,
    false,
    40
)
on conflict (slug) do update set
    name = excluded.name,
    description = excluded.description,
    category = excluded.category,
    icon = excluded.icon,
    type = excluded.type,
    default_system_prompt = excluded.default_system_prompt,
    capabilities = excluded.capabilities,
    required_connectors = excluded.required_connectors,
    is_default = excluded.is_default,
    is_premium = excluded.is_premium,
    sort_order = excluded.sort_order;

-- Storage bucket for uploaded knowledge files.
insert into storage.buckets (id, name, public, file_size_limit)
values ('knowledge_files', 'knowledge_files', false, 10485760)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit;

-- Row Level Security.
alter table public.agent_catalog enable row level security;
alter table public.user_agents enable row level security;
alter table public.agent_knowledge_files enable row level security;
alter table public.knowledge_embeddings enable row level security;
alter table public.user_connectors enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "Agent catalog is readable"
on public.agent_catalog for select
to anon, authenticated
using (true);

create policy "Users can view their installed agents"
on public.user_agents for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can install agents"
on public.user_agents for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their installed agents"
on public.user_agents for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can uninstall their installed agents"
on public.user_agents for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view their knowledge files"
on public.agent_knowledge_files for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their knowledge files"
on public.agent_knowledge_files for insert
to authenticated
with check (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.user_agents ua
        where ua.id = user_agent_id
        and ua.user_id = (select auth.uid())
    )
);

create policy "Users can update their knowledge files"
on public.agent_knowledge_files for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their knowledge files"
on public.agent_knowledge_files for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view their embeddings"
on public.knowledge_embeddings for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their embeddings"
on public.knowledge_embeddings for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their embeddings"
on public.knowledge_embeddings for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their embeddings"
on public.knowledge_embeddings for delete
to authenticated
using ((select auth.uid()) = user_id);

-- No browser policies for user_connectors. Server APIs use service_role.

create policy "Users can view their conversations"
on public.conversations for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their conversations"
on public.conversations for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their conversations"
on public.conversations for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their conversations"
on public.conversations for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view messages in their conversations"
on public.messages for select
to authenticated
using (
    exists (
        select 1
        from public.conversations c
        where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
);

create policy "Users can create messages in their conversations"
on public.messages for insert
to authenticated
with check (
    exists (
        select 1
        from public.conversations c
        where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
);

create policy "Users can delete messages in their conversations"
on public.messages for delete
to authenticated
using (
    exists (
        select 1
        from public.conversations c
        where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
);

create policy "Users can read their own knowledge storage objects"
on storage.objects for select
to authenticated
using (
    bucket_id = 'knowledge_files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can upload their own knowledge storage objects"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'knowledge_files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can update their own knowledge storage objects"
on storage.objects for update
to authenticated
using (
    bucket_id = 'knowledge_files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
    bucket_id = 'knowledge_files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete their own knowledge storage objects"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'knowledge_files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Explicit grants for Supabase Data API access. RLS remains the row-level gate.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.agent_catalog to anon, authenticated;
grant select, insert, update, delete on public.user_agents to authenticated;
grant select, insert, update, delete on public.agent_knowledge_files to authenticated;
grant select, insert, update, delete on public.knowledge_embeddings to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, delete on public.messages to authenticated;
grant all on all tables in schema public to service_role;
grant all on all routines in schema public to service_role;
grant all on all sequences in schema public to service_role;
