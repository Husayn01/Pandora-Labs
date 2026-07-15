-- Keep privileged implementation bodies outside the Data API schema. Public
-- functions below are service-role-only, security-invoker RPC adapters.

alter table public.billing_customers
  add constraint billing_customers_id_organization_unique unique (id, organization_id);

alter table public.subscriptions
  drop constraint if exists subscriptions_billing_customer_id_fkey,
  add constraint subscriptions_billing_customer_tenant_fk
    foreign key (billing_customer_id, organization_id)
    references public.billing_customers(id, organization_id)
    on delete set null (billing_customer_id);

create or replace function private.store_integration_secret(
  p_secret_value text,
  p_secret_name text,
  p_secret_description text default ''
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select vault.create_secret(p_secret_value, p_secret_name, p_secret_description);
$function$;

create or replace function private.read_integration_secret(p_secret_id uuid)
returns text
language sql
security definer
set search_path = ''
as $function$
  select decrypted_secret
  from vault.decrypted_secrets
  where id = p_secret_id;
$function$;

create or replace function private.delete_integration_secret(p_secret_id uuid)
returns void
language sql
security definer
set search_path = ''
as $function$
  delete from vault.secrets where id = p_secret_id;
$function$;

create or replace function private.read_connection_secret(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider text
)
returns text
language sql
security definer
set search_path = ''
as $function$
  select d.decrypted_secret
  from public.integration_connections c
  join vault.decrypted_secrets d on d.id = c.vault_secret_id
  where c.id = p_connection_id
    and c.organization_id = p_organization_id
    and c.provider = p_provider
    and c.status = 'connected';
$function$;

create or replace function private.rotate_connection_secret(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider text,
  p_expected_secret_id uuid,
  p_secret_value text,
  p_token_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_connection public.integration_connections%rowtype;
  v_new_secret_id uuid;
begin
  select * into v_connection
  from public.integration_connections
  where id = p_connection_id
    and organization_id = p_organization_id
    and provider = p_provider
    and status = 'connected'
  for update;

  if not found or v_connection.vault_secret_id <> p_expected_secret_id then
    return null;
  end if;

  v_new_secret_id := vault.create_secret(
    p_secret_value,
    'connection-' || p_provider || '-' || p_organization_id::text || '-' || gen_random_uuid()::text,
    'Rotated provider credential'
  );

  update public.integration_connections
  set vault_secret_id = v_new_secret_id,
      token_expires_at = p_token_expires_at,
      last_checked_at = now(),
      last_error_code = null,
      updated_at = now()
  where id = p_connection_id;

  delete from vault.secrets where id = p_expected_secret_id;
  return v_new_secret_id;
end;
$function$;

create or replace function private.apply_paystack_subscription_event(
  p_organization_id uuid,
  p_email text,
  p_customer_code text,
  p_plan_code text,
  p_provider_plan_code text,
  p_subscription_code text,
  p_period_start timestamptz default now(),
  p_period_end timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_customer_id uuid;
begin
  if p_plan_code not in ('solo', 'business', 'scale') then
    raise exception using errcode = '22023', message = 'invalid plan';
  end if;
  if p_email is null or length(trim(p_email)) = 0 then
    raise exception using errcode = '22023', message = 'invalid billing email';
  end if;

  insert into public.billing_customers (
    organization_id, provider, provider_customer_code, email, updated_at
  ) values (
    p_organization_id, 'paystack', nullif(p_customer_code, ''), lower(trim(p_email)), now()
  )
  on conflict (organization_id) do update set
    provider_customer_code = coalesce(excluded.provider_customer_code, public.billing_customers.provider_customer_code),
    email = excluded.email,
    updated_at = now()
  returning id into v_customer_id;

  insert into public.subscriptions (
    organization_id, billing_customer_id, plan_code, status,
    provider_subscription_code, provider_plan_code,
    current_period_start, current_period_end, updated_at
  ) values (
    p_organization_id, v_customer_id, p_plan_code, 'active',
    nullif(p_subscription_code, ''), nullif(p_provider_plan_code, ''),
    coalesce(p_period_start, now()), p_period_end, now()
  )
  on conflict (organization_id) do update set
    billing_customer_id = excluded.billing_customer_id,
    plan_code = excluded.plan_code,
    status = 'active',
    provider_subscription_code = coalesce(excluded.provider_subscription_code, public.subscriptions.provider_subscription_code),
    provider_plan_code = coalesce(excluded.provider_plan_code, public.subscriptions.provider_plan_code),
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = false,
    updated_at = now();

  update public.organizations
  set plan_code = p_plan_code, status = 'active', updated_at = now()
  where id = p_organization_id;
end;
$function$;

create or replace function private.set_subscription_status(
  p_organization_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_status not in ('past_due', 'cancelled', 'expired', 'paused') then
    raise exception using errcode = '22023', message = 'invalid subscription status';
  end if;

  update public.subscriptions
  set status = p_status, updated_at = now()
  where organization_id = p_organization_id;

  if p_status = 'past_due' then
    update public.organizations
    set status = 'past_due', updated_at = now()
    where id = p_organization_id and status = 'active';
  else
    update public.organizations
    set status = 'suspended', updated_at = now()
    where id = p_organization_id and status in ('active', 'past_due');
  end if;
end;
$function$;

create or replace function private.reserve_web_command_usage(
  p_organization_id uuid,
  p_source_id text,
  p_period_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_usage_limit integer;
  v_entitlement_found boolean := false;
  v_used numeric(14,4);
begin
  if p_source_id is null or length(p_source_id) = 0 or length(p_source_id) > 160 then
    raise exception using errcode = '22023', message = 'invalid source id';
  end if;
  if p_period_key <> to_char(timezone('UTC', now()), 'YYYY-MM') then
    raise exception using errcode = '22023', message = 'invalid active usage period';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':web_commands:' || p_period_key, 0)
  );

  select e.web_command_limit, true
  into v_usage_limit, v_entitlement_found
  from public.organizations o
  join public.plan_entitlements e on e.plan_code = o.plan_code
  where o.id = p_organization_id and o.status in ('active', 'past_due');

  if not v_entitlement_found then
    raise exception using errcode = 'P0002', message = 'organization entitlement not found';
  end if;

  if exists (
    select 1 from public.usage_events
    where organization_id = p_organization_id
      and metric = 'web_commands'
      and source_id = p_source_id
  ) then
    return true;
  end if;

  if v_usage_limit is not null then
    select coalesce(quantity, 0)
    into v_used
    from public.usage_counters
    where organization_id = p_organization_id
      and metric = 'web_commands'
      and period_key = p_period_key;

    if coalesce(v_used, 0) + 1 > v_usage_limit then
      return false;
    end if;
  end if;

  insert into public.usage_events (
    organization_id, metric, quantity, source_id, period_key, metadata
  ) values (
    p_organization_id, 'web_commands', 1, p_source_id, p_period_key,
    '{"channel":"web"}'::jsonb
  );

  return true;
end;
$function$;

revoke all on function private.store_integration_secret(text, text, text) from public, anon, authenticated;
revoke all on function private.read_integration_secret(uuid) from public, anon, authenticated;
revoke all on function private.delete_integration_secret(uuid) from public, anon, authenticated;
revoke all on function private.read_connection_secret(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.rotate_connection_secret(uuid, uuid, text, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.apply_paystack_subscription_event(uuid, text, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.set_subscription_status(uuid, text) from public, anon, authenticated;
revoke all on function private.reserve_web_command_usage(uuid, text, text) from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.store_integration_secret(text, text, text) to service_role;
grant execute on function private.read_integration_secret(uuid) to service_role;
grant execute on function private.delete_integration_secret(uuid) to service_role;
grant execute on function private.read_connection_secret(uuid, uuid, text) to service_role;
grant execute on function private.rotate_connection_secret(uuid, uuid, text, uuid, text, timestamptz) to service_role;
grant execute on function private.apply_paystack_subscription_event(uuid, text, text, text, text, text, timestamptz, timestamptz) to service_role;
grant execute on function private.set_subscription_status(uuid, text) to service_role;
grant execute on function private.reserve_web_command_usage(uuid, text, text) to service_role;

create or replace function public.store_integration_secret(
  secret_value text,
  secret_name text,
  secret_description text default ''
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.store_integration_secret(secret_value, secret_name, secret_description);
$function$;

create or replace function public.read_integration_secret(secret_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $function$
  select private.read_integration_secret(secret_id);
$function$;

create or replace function public.delete_integration_secret(secret_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.delete_integration_secret(secret_id);
$function$;

create or replace function public.read_connection_secret(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider text
)
returns text
language sql
security invoker
set search_path = ''
as $function$
  select private.read_connection_secret(p_organization_id, p_connection_id, p_provider);
$function$;

create or replace function public.rotate_connection_secret(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider text,
  p_expected_secret_id uuid,
  p_secret_value text,
  p_token_expires_at timestamptz
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.rotate_connection_secret(
    p_organization_id, p_connection_id, p_provider,
    p_expected_secret_id, p_secret_value, p_token_expires_at
  );
$function$;

create or replace function public.apply_paystack_subscription_event(
  p_organization_id uuid,
  p_email text,
  p_customer_code text,
  p_plan_code text,
  p_provider_plan_code text,
  p_subscription_code text,
  p_period_start timestamptz default now(),
  p_period_end timestamptz default null
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.apply_paystack_subscription_event(
    p_organization_id, p_email, p_customer_code, p_plan_code,
    p_provider_plan_code, p_subscription_code, p_period_start, p_period_end
  );
$function$;

create or replace function public.set_subscription_status(
  p_organization_id uuid,
  p_status text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.set_subscription_status(p_organization_id, p_status);
$function$;

create or replace function public.reserve_web_command_usage(
  p_organization_id uuid,
  p_source_id text,
  p_period_key text
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.reserve_web_command_usage(p_organization_id, p_source_id, p_period_key);
$function$;

revoke all on function public.store_integration_secret(text, text, text) from public, anon, authenticated;
revoke all on function public.read_integration_secret(uuid) from public, anon, authenticated;
revoke all on function public.delete_integration_secret(uuid) from public, anon, authenticated;
revoke all on function public.read_connection_secret(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.rotate_connection_secret(uuid, uuid, text, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.apply_paystack_subscription_event(uuid, text, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.set_subscription_status(uuid, text) from public, anon, authenticated;
revoke all on function public.reserve_web_command_usage(uuid, text, text) from public, anon, authenticated;

grant execute on function public.store_integration_secret(text, text, text) to service_role;
grant execute on function public.read_integration_secret(uuid) to service_role;
grant execute on function public.delete_integration_secret(uuid) to service_role;
grant execute on function public.read_connection_secret(uuid, uuid, text) to service_role;
grant execute on function public.rotate_connection_secret(uuid, uuid, text, uuid, text, timestamptz) to service_role;
grant execute on function public.apply_paystack_subscription_event(uuid, text, text, text, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.set_subscription_status(uuid, text) to service_role;
grant execute on function public.reserve_web_command_usage(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
