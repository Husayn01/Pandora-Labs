create or replace function public.reserve_web_command_usage(
  p_organization_id uuid,
  p_source_id text,
  p_period_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  usage_limit integer;
  used numeric(14,4);
  inserted_id uuid;
begin
  if p_source_id is null or length(p_source_id) = 0 or length(p_source_id) > 160 then
    raise exception 'invalid source id';
  end if;
  if p_period_key !~ '^\d{4}-\d{2}$' then
    raise exception 'invalid period';
  end if;

  -- Serialize quota reservations for the same tenant/month without blocking
  -- unrelated tenants.
  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':web_commands:' || p_period_key, 0)
  );

  select e.web_command_limit
  into usage_limit
  from public.organizations o
  join public.plan_entitlements e on e.plan_code = o.plan_code
  where o.id = p_organization_id;

  if usage_limit is null then
    raise exception 'organization entitlement not found';
  end if;

  if exists (
    select 1 from public.usage_events
    where organization_id = p_organization_id
      and metric = 'web_commands'
      and source_id = p_source_id
  ) then
    return true;
  end if;

  select coalesce(quantity, 0)
  into used
  from public.usage_counters
  where organization_id = p_organization_id
    and metric = 'web_commands'
    and period_key = p_period_key;

  if coalesce(used, 0) + 1 > usage_limit then
    return false;
  end if;

  insert into public.usage_events (
    organization_id, metric, quantity, source_id, period_key, metadata
  ) values (
    p_organization_id, 'web_commands', 1, p_source_id, p_period_key,
    '{"channel":"web"}'::jsonb
  )
  returning id into inserted_id;

  return inserted_id is not null;
end;
$$;

revoke all on function public.reserve_web_command_usage(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.reserve_web_command_usage(uuid, text, text)
to service_role;
