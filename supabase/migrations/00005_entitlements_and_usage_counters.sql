create table if not exists public.plan_entitlements (
  plan_code text primary key,
  monthly_price_minor bigint not null,
  seat_limit integer not null,
  web_command_limit integer not null,
  web_voice_seconds_limit integer not null,
  total_voice_seconds_limit integer not null,
  features jsonb not null default '{}'::jsonb,
  constraint plan_entitlements_code_check check (plan_code in ('free','solo','business','scale'))
);

insert into public.plan_entitlements(plan_code,monthly_price_minor,seat_limit,web_command_limit,web_voice_seconds_limit,total_voice_seconds_limit,features) values
('free',0,1,500,900,900,'{"external_sends":false,"pstn":false,"telegram":false,"whatsapp":false}'::jsonb),
('solo',2990000,2,5000,6000,6000,'{"external_sends":true,"pstn":true,"telegram":true,"whatsapp":false}'::jsonb),
('business',7990000,5,25000,24000,24000,'{"external_sends":true,"pstn":true,"telegram":true,"whatsapp":true,"dedicated_channel_eligible":true}'::jsonb),
('scale',19990000,15,100000,72000,72000,'{"external_sends":true,"pstn":true,"telegram":true,"whatsapp":true,"dedicated_sip":true,"api":true}'::jsonb)
on conflict(plan_code) do update set monthly_price_minor=excluded.monthly_price_minor,seat_limit=excluded.seat_limit,web_command_limit=excluded.web_command_limit,web_voice_seconds_limit=excluded.web_voice_seconds_limit,total_voice_seconds_limit=excluded.total_voice_seconds_limit,features=excluded.features;

alter table public.plan_entitlements enable row level security;
create policy plan_entitlements_authenticated_read on public.plan_entitlements for select to authenticated using (true);
grant select on public.plan_entitlements to authenticated;
grant all on public.plan_entitlements to service_role;

create or replace function private.aggregate_usage_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.usage_counters(organization_id,metric,period_key,quantity,updated_at)
  values(new.organization_id,new.metric,new.period_key,new.quantity,now())
  on conflict(organization_id,metric,period_key) do update
    set quantity=public.usage_counters.quantity+excluded.quantity,updated_at=now();
  return new;
end; $$;
revoke all on function private.aggregate_usage_event() from public,anon,authenticated;
drop trigger if exists aggregate_usage_event on public.usage_events;
create trigger aggregate_usage_event after insert on public.usage_events for each row execute function private.aggregate_usage_event();
