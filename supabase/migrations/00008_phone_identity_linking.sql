alter table public.channel_link_tokens
  add column if not exists external_id_hash text,
  add column if not exists display_hint text,
  add column if not exists attempt_count integer not null default 0;

alter table public.channel_link_tokens
  drop constraint if exists channel_link_tokens_attempt_count_check;
alter table public.channel_link_tokens
  add constraint channel_link_tokens_attempt_count_check
  check (attempt_count between 0 and 10);

create index if not exists channel_link_tokens_user_channel_created_idx
  on public.channel_link_tokens (user_id, channel, created_at desc);
create index if not exists channel_link_tokens_external_hash_idx
  on public.channel_link_tokens (channel, external_id_hash)
  where redeemed_at is null;
