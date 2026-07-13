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
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_id uuid;
begin
  if p_plan_code not in ('solo','business','scale') then
    raise exception 'invalid plan';
  end if;

  insert into public.billing_customers (
    organization_id, provider, provider_customer_code, email, updated_at
  ) values (
    p_organization_id, 'paystack', nullif(p_customer_code,''), p_email, now()
  )
  on conflict (organization_id) do update set
    provider_customer_code = coalesce(excluded.provider_customer_code, public.billing_customers.provider_customer_code),
    email = excluded.email,
    updated_at = now()
  returning id into customer_id;

  insert into public.subscriptions (
    organization_id, billing_customer_id, plan_code, status,
    provider_subscription_code, provider_plan_code,
    current_period_start, current_period_end, updated_at
  ) values (
    p_organization_id, customer_id, p_plan_code, 'active',
    nullif(p_subscription_code,''), nullif(p_provider_plan_code,''),
    coalesce(p_period_start,now()), p_period_end, now()
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
$$;

create or replace function public.set_subscription_status(
  p_organization_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('past_due','cancelled','expired','paused') then
    raise exception 'invalid subscription status';
  end if;
  update public.subscriptions
  set status = p_status, updated_at = now()
  where organization_id = p_organization_id;
end;
$$;

revoke all on function public.apply_paystack_subscription_event(uuid,text,text,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.set_subscription_status(uuid,text) from public, anon, authenticated;
grant execute on function public.apply_paystack_subscription_event(uuid,text,text,text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.set_subscription_status(uuid,text) to service_role;
