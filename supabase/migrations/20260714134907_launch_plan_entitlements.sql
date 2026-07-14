alter table public.plan_entitlements
  alter column seat_limit drop not null,
  alter column web_command_limit drop not null,
  alter column web_voice_seconds_limit drop not null,
  alter column total_voice_seconds_limit drop not null;

insert into public.plan_entitlements (
  plan_code,
  monthly_price_minor,
  seat_limit,
  web_command_limit,
  web_voice_seconds_limit,
  total_voice_seconds_limit,
  features
) values
  (
    'free',
    0,
    1,
    100,
    900,
    900,
    '{"audit_days":7,"google_connections":1,"external_sends":false,"pstn":false,"phone_trial_seconds":300,"telegram":false,"whatsapp":false}'::jsonb
  ),
  (
    'solo',
    2000000,
    3,
    750,
    6000,
    6000,
    '{"audit_days":30,"google_connections":1,"external_sends":true,"pstn_prepaid":true,"reminders":true,"invoice_drafts":true,"reports":true,"telegram":false,"whatsapp":false}'::jsonb
  ),
  (
    'business',
    6000000,
    10,
    3000,
    30000,
    30000,
    '{"audit_days":90,"google_connections":5,"external_sends":true,"pstn_prepaid":true,"multi_inbox":true,"advanced_reports":true,"approval_policies":true,"dedicated_channel_eligible":true,"telegram":false,"whatsapp":false}'::jsonb
  ),
  (
    'scale',
    20000000,
    null,
    null,
    null,
    null,
    '{"audit_days":null,"google_connections":null,"external_sends":true,"pstn_prepaid":true,"dedicated_sip":true,"api":true,"onboarding":true,"sla":true,"telegram":false,"whatsapp":false}'::jsonb
  )
on conflict (plan_code) do update
set monthly_price_minor = excluded.monthly_price_minor,
    seat_limit = excluded.seat_limit,
    web_command_limit = excluded.web_command_limit,
    web_voice_seconds_limit = excluded.web_voice_seconds_limit,
    total_voice_seconds_limit = excluded.total_voice_seconds_limit,
    features = excluded.features;
