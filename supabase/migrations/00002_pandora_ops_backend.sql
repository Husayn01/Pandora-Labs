-- Pandora n8n backend pivot tables.
-- Adds owner profile, channel identity, task, reminder, and workflow audit data.

create table public.profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    phone_number text unique,
    timezone text not null default 'Africa/Lagos',
    default_calendar_id text,
    approval_channel text not null default 'web',
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now()),
    constraint profiles_approval_channel_check
        check (approval_channel in ('web', 'sms', 'email', 'none'))
);

create table public.channel_identities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    channel text not null,
    external_id text not null,
    is_primary boolean not null default false,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now()),
    constraint channel_identities_channel_check
        check (channel in ('web', 'phone', 'sms', 'whatsapp', 'ussd', 'elevenlabs')),
    unique (channel, external_id)
);

create table public.tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null,
    description text,
    status text not null default 'open',
    priority text not null default 'normal',
    due_at timestamptz,
    source_channel text not null default 'web',
    external_ref jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now()),
    constraint tasks_status_check
        check (status in ('open', 'in_progress', 'blocked', 'done', 'cancelled')),
    constraint tasks_priority_check
        check (priority in ('low', 'normal', 'high', 'urgent'))
);

create table public.reminders (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    task_id uuid references public.tasks(id) on delete set null,
    title text not null,
    body text,
    remind_at timestamptz not null,
    status text not null default 'scheduled',
    delivery_channel text not null default 'web',
    source_channel text not null default 'web',
    external_ref jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now()),
    constraint reminders_status_check
        check (status in ('scheduled', 'sent', 'cancelled', 'failed')),
    constraint reminders_delivery_channel_check
        check (delivery_channel in ('web', 'sms', 'email', 'phone', 'whatsapp'))
);

create table public.workflow_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    conversation_id uuid references public.conversations(id) on delete set null,
    workflow_name text not null,
    execution_id text,
    event_type text not null,
    status text not null default 'info',
    summary text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc'::text, now()),
    constraint workflow_events_status_check
        check (status in ('info', 'success', 'warning', 'error'))
);

create index profiles_phone_number_idx on public.profiles (phone_number) where phone_number is not null;
create index channel_identities_user_id_idx on public.channel_identities (user_id);
create index channel_identities_channel_external_id_idx on public.channel_identities (channel, external_id);
create index tasks_user_id_status_due_at_idx on public.tasks (user_id, status, due_at);
create index reminders_user_id_status_remind_at_idx on public.reminders (user_id, status, remind_at);
create index workflow_events_user_id_created_at_idx on public.workflow_events (user_id, created_at desc);
create index workflow_events_conversation_id_idx on public.workflow_events (conversation_id);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger set_channel_identities_updated_at
before update on public.channel_identities
for each row execute function private.set_updated_at();

create trigger set_tasks_updated_at
before update on public.tasks
for each row execute function private.set_updated_at();

create trigger set_reminders_updated_at
before update on public.reminders
for each row execute function private.set_updated_at();

create or replace function private.auto_create_profile()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
    insert into public.profiles (user_id, display_name, phone_number)
    values (
        new.id,
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        nullif(new.raw_user_meta_data ->> 'phone', '')
    )
    on conflict (user_id) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function private.auto_create_profile();

insert into public.profiles (user_id, display_name)
select id, nullif(raw_user_meta_data ->> 'full_name', '')
from auth.users
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;
alter table public.channel_identities enable row level security;
alter table public.tasks enable row level security;
alter table public.reminders enable row level security;
alter table public.workflow_events enable row level security;

create policy "Users can view their profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their profile"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can view their channel identities"
on public.channel_identities for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their channel identities"
on public.channel_identities for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their channel identities"
on public.channel_identities for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their channel identities"
on public.channel_identities for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view their tasks"
on public.tasks for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their tasks"
on public.tasks for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their tasks"
on public.tasks for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their tasks"
on public.tasks for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view their reminders"
on public.reminders for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their reminders"
on public.reminders for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their reminders"
on public.reminders for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their reminders"
on public.reminders for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view their workflow events"
on public.workflow_events for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their workflow events"
on public.workflow_events for insert
to authenticated
with check ((select auth.uid()) = user_id);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.channel_identities to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.reminders to authenticated;
grant select, insert on public.workflow_events to authenticated;
grant all on public.profiles to service_role;
grant all on public.channel_identities to service_role;
grant all on public.tasks to service_role;
grant all on public.reminders to service_role;
grant all on public.workflow_events to service_role;
