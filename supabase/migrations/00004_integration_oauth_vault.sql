-- Server-only OAuth state and Vault access. The functions remain inaccessible to browsers.

create table if not exists public.integration_oauth_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  state_hash text not null unique,
  verifier_secret_id uuid not null,
  redirect_uri text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.integration_oauth_states enable row level security;
revoke all on public.integration_oauth_states from anon, authenticated;
create index if not exists integration_oauth_states_expiry_idx on public.integration_oauth_states(expires_at) where consumed_at is null;

create or replace function public.store_integration_secret(secret_value text, secret_name text, secret_description text default '')
returns uuid
language sql
security definer
set search_path = ''
as $$
  select vault.create_secret(secret_value, secret_name, secret_description);
$$;

create or replace function public.read_integration_secret(secret_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where id = secret_id;
$$;

create or replace function public.delete_integration_secret(secret_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where id = secret_id;
$$;

revoke all on function public.store_integration_secret(text,text,text) from public, anon, authenticated;
revoke all on function public.read_integration_secret(uuid) from public, anon, authenticated;
revoke all on function public.delete_integration_secret(uuid) from public, anon, authenticated;
grant execute on function public.store_integration_secret(text,text,text) to service_role;
grant execute on function public.read_integration_secret(uuid) to service_role;
grant execute on function public.delete_integration_secret(uuid) to service_role;
grant all on public.integration_oauth_states to service_role;
