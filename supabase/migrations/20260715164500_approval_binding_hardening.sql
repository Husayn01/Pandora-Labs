-- Approval requests are immutable, tenant-bound commands. Browser clients may
-- read requests and decisions but can never mutate either ledger directly.

create or replace function private.compute_approval_binding_hash(
  p_organization_id uuid,
  p_action_type text,
  p_action_payload_hash text,
  p_request_actor_user_id uuid,
  p_expires_at timestamptz,
  p_approval_idempotency_key text
)
returns text
language sql
stable
set search_path = ''
as $function$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'organizationId', p_organization_id::text,
          'actionType', p_action_type,
          'actionPayloadHash', pg_catalog.lower(p_action_payload_hash),
          'requestActorUserId', p_request_actor_user_id::text,
          'expiresAt', pg_catalog.to_char(
            p_expires_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
          ),
          'approvalIdempotencyKey', p_approval_idempotency_key
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$function$;

revoke all on function private.compute_approval_binding_hash(uuid, text, text, uuid, timestamptz, text)
  from PUBLIC, anon, authenticated, service_role;

alter table public.approval_requests
  add column if not exists binding_hash text;

alter table public.approval_decisions
  add column if not exists request_actor_user_id uuid,
  add column if not exists request_expires_at timestamptz,
  add column if not exists binding_hash text;

update public.approval_requests
set action_payload_hash = pg_catalog.lower(action_payload_hash),
    binding_hash = private.compute_approval_binding_hash(
      organization_id,
      action_type,
      action_payload_hash,
      requested_by,
      expires_at,
      idempotency_key
    );

update public.approval_decisions d
set action_payload_hash = pg_catalog.lower(d.action_payload_hash),
    request_actor_user_id = r.requested_by,
    request_expires_at = r.expires_at,
    binding_hash = r.binding_hash
from public.approval_requests r
where r.id = d.approval_request_id;

alter table public.approval_requests
  alter column binding_hash set not null,
  add constraint approval_requests_id_organization_unique unique (id, organization_id);

alter table public.approval_decisions
  alter column request_expires_at set not null,
  alter column binding_hash set not null;

alter table public.approval_requests
  drop constraint if exists approval_requests_payload_hash_format_check,
  drop constraint if exists approval_requests_binding_hash_format_check;
alter table public.approval_requests
  add constraint approval_requests_payload_hash_format_check
    check (action_payload_hash ~ '^[a-f0-9]{64}$') not valid,
  add constraint approval_requests_binding_hash_format_check
    check (binding_hash ~ '^[a-f0-9]{64}$');

alter table public.approval_decisions
  drop constraint if exists approval_decisions_payload_hash_format_check,
  drop constraint if exists approval_decisions_binding_hash_format_check,
  drop constraint if exists approval_decisions_request_actor_user_id_fkey,
  drop constraint if exists approval_decisions_organization_id_fkey,
  drop constraint if exists approval_decisions_approval_request_id_fkey;
alter table public.approval_decisions
  add constraint approval_decisions_payload_hash_format_check
    check (action_payload_hash ~ '^[a-f0-9]{64}$') not valid,
  add constraint approval_decisions_binding_hash_format_check
    check (binding_hash ~ '^[a-f0-9]{64}$'),
  add constraint approval_decisions_request_actor_user_id_fkey
    foreign key (request_actor_user_id) references auth.users(id) on delete restrict,
  add constraint approval_decisions_organization_id_fkey
    foreign key (organization_id) references public.organizations(id) on delete restrict,
  add constraint approval_decisions_request_tenant_fk
    foreign key (approval_request_id, organization_id)
    references public.approval_requests(id, organization_id) on delete restrict;

alter table public.channel_link_tokens
  drop constraint if exists channel_link_tokens_user_id_fkey,
  add constraint channel_link_tokens_membership_fk
    foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id)
    on delete cascade;

alter table public.channel_identities
  drop constraint if exists channel_identities_user_id_fkey,
  drop constraint if exists channel_identities_linked_role_check,
  add constraint channel_identities_membership_fk
    foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id)
    on delete cascade,
  add constraint channel_identities_linked_role_check
    check (user_id is not null or role = 'public_customer');

create index if not exists approval_decisions_actor_user_idx
  on public.approval_decisions (actor_user_id);
create index if not exists approval_decisions_request_actor_user_idx
  on public.approval_decisions (request_actor_user_id)
  where request_actor_user_id is not null;
create index if not exists channel_link_tokens_membership_idx
  on public.channel_link_tokens (organization_id, user_id);
create index if not exists channel_identities_membership_idx
  on public.channel_identities (organization_id, user_id)
  where user_id is not null;

create or replace function private.enforce_approval_request_binding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expected_binding_hash text;
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '55000',
      message = 'approval requests cannot be deleted';
  end if;

  new.action_payload_hash := pg_catalog.lower(new.action_payload_hash);
  v_expected_binding_hash := private.compute_approval_binding_hash(
    new.organization_id,
    new.action_type,
    new.action_payload_hash,
    new.requested_by,
    new.expires_at,
    new.idempotency_key
  );

  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.decided_by is not null or new.decided_at is not null then
      raise exception using
        errcode = '23514',
        message = 'approval requests must start pending and undecided';
    end if;
    new.binding_hash := v_expected_binding_hash;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.conversation_id is distinct from old.conversation_id
     or new.requested_by is distinct from old.requested_by
     or new.action_type is distinct from old.action_type
     or new.risk_level is distinct from old.risk_level
     or new.action_preview is distinct from old.action_preview
     or new.action_payload_hash is distinct from old.action_payload_hash
     or new.idempotency_key is distinct from old.idempotency_key
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at
     or new.binding_hash is distinct from old.binding_hash then
    raise exception using
      errcode = '55000',
      message = 'approval binding fields are immutable';
  end if;

  if new.binding_hash is distinct from v_expected_binding_hash then
    raise exception using
      errcode = '23514',
      message = 'approval binding hash mismatch';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'pending' and new.status in ('approved', 'rejected', 'expired'))
      or (old.status = 'approved' and new.status in ('executed', 'failed'))
    ) then
      raise exception using
        errcode = '23514',
        message = 'invalid approval status transition';
    end if;
  end if;

  if new.status in ('approved', 'rejected', 'executed', 'failed')
     and (new.decided_by is null or new.decided_at is null) then
    raise exception using
      errcode = '23514',
      message = 'decided approvals require an actor and timestamp';
  end if;

  if new.status in ('approved', 'rejected', 'executed', 'failed')
     and not exists (
       select 1
       from public.approval_decisions d
       where d.approval_request_id = new.id
         and d.organization_id = new.organization_id
         and d.binding_hash = new.binding_hash
         and d.action_type = new.action_type
         and d.action_payload_hash = new.action_payload_hash
         and d.approval_idempotency_key = new.idempotency_key
         and d.actor_user_id = new.decided_by
         and (
           (new.status in ('executed', 'failed') and d.decision = 'approved')
           or d.decision = new.status
         )
     ) then
    raise exception using
      errcode = '23514',
      message = 'decided approval requires a matching immutable ledger entry';
  end if;

  if new.status in ('pending', 'expired')
     and (new.decided_by is not null or new.decided_at is not null) then
    raise exception using
      errcode = '23514',
      message = 'pending or expired approvals cannot contain decision metadata';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_approval_request_binding()
  from PUBLIC, anon, authenticated, service_role;

drop trigger if exists approval_requests_binding_guard on public.approval_requests;
create trigger approval_requests_binding_guard
before insert or update or delete on public.approval_requests
for each row execute function private.enforce_approval_request_binding();

create or replace function private.prevent_ledger_change()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'immutable ledger rows cannot be changed';
end;
$function$;

revoke all on function private.prevent_ledger_change()
  from PUBLIC, anon, authenticated, service_role;

drop trigger if exists approval_decisions_immutable on public.approval_decisions;
create trigger approval_decisions_immutable
before update or delete on public.approval_decisions
for each row execute function private.prevent_ledger_change();

create or replace function private.decide_approval(
  p_organization_id uuid,
  p_approval_request_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_expected_payload_hash text,
  p_expected_approval_idempotency_key text,
  p_decision_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request public.approval_requests%rowtype;
  v_existing public.approval_decisions%rowtype;
  v_expected_binding_hash text;
  v_now timestamptz := now();
begin
  if p_decision not in ('approved', 'rejected') then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_decision');
  end if;

  if p_decision_idempotency_key is null
     or pg_catalog.length(p_decision_idempotency_key) not between 1 and 160 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_idempotency_key');
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'actor_forbidden');
  end if;

  select *
  into v_request
  from public.approval_requests
  where id = p_approval_request_id
    and organization_id = p_organization_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  v_expected_binding_hash := private.compute_approval_binding_hash(
    v_request.organization_id,
    v_request.action_type,
    v_request.action_payload_hash,
    v_request.requested_by,
    v_request.expires_at,
    v_request.idempotency_key
  );

  if v_request.binding_hash is distinct from v_expected_binding_hash
     or v_request.action_payload_hash <> pg_catalog.lower(p_expected_payload_hash)
     or v_request.idempotency_key <> p_expected_approval_idempotency_key then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'binding_mismatch');
  end if;

  if v_request.status in ('approved', 'rejected') then
    select *
    into v_existing
    from public.approval_decisions
    where approval_request_id = v_request.id;

    if found
       and v_existing.binding_hash = v_request.binding_hash
       and v_existing.decision = p_decision
       and v_existing.decision_idempotency_key = p_decision_idempotency_key then
      return pg_catalog.jsonb_build_object(
        'ok', true,
        'replayed', true,
        'approvalId', v_request.id,
        'status', v_request.status,
        'decidedAt', v_existing.decided_at
      );
    end if;

    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'already_decided',
      'status', v_request.status
    );
  end if;

  if v_request.status <> 'pending' then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'not_pending',
      'status', v_request.status
    );
  end if;

  select *
  into v_existing
  from public.approval_decisions
  where organization_id = p_organization_id
    and decision_idempotency_key = p_decision_idempotency_key;

  if found then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'decision_idempotency_conflict',
      'approvalId', v_existing.approval_request_id
    );
  end if;

  if v_request.expires_at <= v_now then
    update public.approval_requests
    set status = 'expired'
    where id = v_request.id;

    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'expired',
      'status', 'expired'
    );
  end if;

  insert into public.approval_decisions (
    organization_id,
    approval_request_id,
    actor_user_id,
    decision,
    action_type,
    action_payload_hash,
    approval_idempotency_key,
    decision_idempotency_key,
    request_actor_user_id,
    request_expires_at,
    binding_hash,
    decided_at
  ) values (
    v_request.organization_id,
    v_request.id,
    p_actor_user_id,
    p_decision,
    v_request.action_type,
    v_request.action_payload_hash,
    v_request.idempotency_key,
    p_decision_idempotency_key,
    v_request.requested_by,
    v_request.expires_at,
    v_request.binding_hash,
    v_now
  );

  update public.approval_requests
  set status = p_decision,
      decided_by = p_actor_user_id,
      decided_at = v_now
  where id = v_request.id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'replayed', false,
    'approvalId', v_request.id,
    'status', p_decision,
    'decidedAt', v_now
  );
end;
$function$;

revoke all on function private.decide_approval(uuid, uuid, uuid, text, text, text, text)
  from PUBLIC, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.decide_approval(uuid, uuid, uuid, text, text, text, text)
  to service_role;

create or replace function public.decide_approval(
  p_organization_id uuid,
  p_approval_request_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_expected_payload_hash text,
  p_expected_approval_idempotency_key text,
  p_decision_idempotency_key text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.decide_approval(
    p_organization_id,
    p_approval_request_id,
    p_actor_user_id,
    p_decision,
    p_expected_payload_hash,
    p_expected_approval_idempotency_key,
    p_decision_idempotency_key
  );
$function$;

revoke all on function public.decide_approval(uuid, uuid, uuid, text, text, text, text)
  from PUBLIC, anon, authenticated;
grant execute on function public.decide_approval(uuid, uuid, uuid, text, text, text, text)
  to service_role;

create or replace function private.protect_membership_binding()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user <> 'authenticated' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      raise exception using errcode = '42501', message = 'owner membership is service managed';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at
     or old.role = 'owner'
     or new.role = 'owner' then
    raise exception using errcode = '42501', message = 'membership binding is service managed';
  end if;

  return new;
end;
$function$;

revoke all on function private.protect_membership_binding()
  from PUBLIC, anon, authenticated, service_role;

drop trigger if exists organization_members_protect_binding on public.organization_members;
create trigger organization_members_protect_binding
before update or delete on public.organization_members
for each row execute function private.protect_membership_binding();

-- Remove every known legacy browser policy by exact name, then recreate the
-- current least-privilege policy set. This is intentionally idempotent across
-- the consolidated reset baseline and the timestamped production history.
drop policy if exists "Users can view their profile" on public.profiles;
drop policy if exists "Users can create their profile" on public.profiles;
drop policy if exists "Users can update their profile" on public.profiles;
drop policy if exists "Users can view their channel identities" on public.channel_identities;
drop policy if exists "Users can create their channel identities" on public.channel_identities;
drop policy if exists "Users can update their channel identities" on public.channel_identities;
drop policy if exists "Users can delete their channel identities" on public.channel_identities;
drop policy if exists "Users can view their tasks" on public.tasks;
drop policy if exists "Users can create their tasks" on public.tasks;
drop policy if exists "Users can update their tasks" on public.tasks;
drop policy if exists "Users can delete their tasks" on public.tasks;
drop policy if exists "Users can view their reminders" on public.reminders;
drop policy if exists "Users can create their reminders" on public.reminders;
drop policy if exists "Users can update their reminders" on public.reminders;
drop policy if exists "Users can delete their reminders" on public.reminders;
drop policy if exists "Users can view their workflow events" on public.workflow_events;
drop policy if exists "Users can create their workflow events" on public.workflow_events;
drop policy if exists approvals_decider_update on public.approval_requests;

drop policy if exists members_admin_insert on public.organization_members;
drop policy if exists members_admin_update on public.organization_members;
drop policy if exists members_admin_delete on public.organization_members;
create policy members_role_managed_insert on public.organization_members
  for insert to authenticated
  with check (
    (
      (select private.has_org_role(organization_id, array['owner']))
      and role in ('admin', 'member', 'viewer')
    )
    or (
      (select private.has_org_role(organization_id, array['admin']))
      and role in ('member', 'viewer')
    )
  );
create policy members_role_managed_update on public.organization_members
  for update to authenticated
  using (
    (
      (select private.has_org_role(organization_id, array['owner']))
      and role <> 'owner'
      and user_id <> (select auth.uid())
    )
    or (
      (select private.has_org_role(organization_id, array['admin']))
      and role in ('member', 'viewer')
      and user_id <> (select auth.uid())
    )
  )
  with check (
    (
      (select private.has_org_role(organization_id, array['owner']))
      and role in ('admin', 'member', 'viewer')
    )
    or (
      (select private.has_org_role(organization_id, array['admin']))
      and role in ('member', 'viewer')
    )
  );
create policy members_role_managed_delete on public.organization_members
  for delete to authenticated
  using (
    user_id <> (select auth.uid())
    and (
      (
        (select private.has_org_role(organization_id, array['owner']))
        and role <> 'owner'
      )
      or (
        (select private.has_org_role(organization_id, array['admin']))
        and role in ('member', 'viewer')
      )
    )
  );

drop policy if exists profiles_self_select on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_select on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy profiles_self_update on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists channels_self_or_admin_select on public.channel_identities;
drop policy if exists channels_admin_write on public.channel_identities;
drop policy if exists channels_admin_insert on public.channel_identities;
drop policy if exists channels_admin_update on public.channel_identities;
drop policy if exists channels_admin_delete on public.channel_identities;
create policy channels_self_or_admin_select on public.channel_identities
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.has_org_role(organization_id, array['owner', 'admin']))
  );

drop policy if exists integrations_admin_write on public.integration_connections;
drop policy if exists integrations_admin_insert on public.integration_connections;
drop policy if exists integrations_admin_update on public.integration_connections;
drop policy if exists integrations_admin_delete on public.integration_connections;

drop policy if exists tasks_member_select on public.tasks;
drop policy if exists tasks_member_insert on public.tasks;
drop policy if exists tasks_member_update on public.tasks;
drop policy if exists tasks_admin_delete on public.tasks;
create policy tasks_member_select on public.tasks
  for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy tasks_member_insert on public.tasks
  for insert to authenticated
  with check (
    (select private.is_org_member(organization_id))
    and (created_by is null or created_by = (select auth.uid()))
  );
create policy tasks_member_update on public.tasks
  for update to authenticated
  using ((select private.is_org_member(organization_id)))
  with check ((select private.is_org_member(organization_id)));
create policy tasks_admin_delete on public.tasks
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'admin'])));

drop policy if exists reminders_member_select on public.reminders;
drop policy if exists reminders_member_insert on public.reminders;
drop policy if exists reminders_member_update on public.reminders;
drop policy if exists reminders_admin_delete on public.reminders;
create policy reminders_member_select on public.reminders
  for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy reminders_member_insert on public.reminders
  for insert to authenticated
  with check ((select private.is_org_member(organization_id)));
create policy reminders_member_update on public.reminders
  for update to authenticated
  using ((select private.is_org_member(organization_id)))
  with check ((select private.is_org_member(organization_id)));
create policy reminders_admin_delete on public.reminders
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'admin'])));

drop policy if exists workflow_events_member_select on public.workflow_events;
create policy workflow_events_member_select on public.workflow_events
  for select to authenticated
  using ((select private.is_org_member(organization_id)));

drop policy if exists approvals_member_select on public.approval_requests;
create policy approvals_member_select on public.approval_requests
  for select to authenticated
  using ((select private.is_org_member(organization_id)));

drop policy if exists approval_decisions_member_select on public.approval_decisions;
create policy approval_decisions_member_select on public.approval_decisions
  for select to authenticated
  using ((select private.is_org_member(organization_id)));

drop policy if exists "Users can upload their own knowledge files" on storage.objects;
drop policy if exists "Users can update their own knowledge files" on storage.objects;
drop policy if exists "Users can read their own knowledge files" on storage.objects;
drop policy if exists "Users can delete their own knowledge files" on storage.objects;
drop policy if exists "Users can upload their own knowledge storage objects" on storage.objects;
drop policy if exists "Users can update their own knowledge storage objects" on storage.objects;
drop policy if exists "Users can read their own knowledge storage objects" on storage.objects;
drop policy if exists "Users can delete their own knowledge storage objects" on storage.objects;

revoke all on table public.profiles from PUBLIC, anon, authenticated;
revoke all on table public.organizations from PUBLIC, anon, authenticated;
revoke all on table public.organization_members from PUBLIC, anon, authenticated;
revoke all on table public.integration_connections from PUBLIC, anon, authenticated;
revoke all on table public.channel_identities from PUBLIC, anon, authenticated;
revoke all on table public.tasks from PUBLIC, anon, authenticated;
revoke all on table public.reminders from PUBLIC, anon, authenticated;
revoke all on table public.workflow_events from PUBLIC, anon, authenticated;
revoke all on table public.approval_requests from PUBLIC, anon, authenticated;
revoke all on table public.approval_decisions from PUBLIC, anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select on table public.organizations to authenticated;
grant update (name, slug, timezone, locale, business_profile)
  on table public.organizations to authenticated;
grant select, insert, update, delete on table public.organization_members to authenticated;
grant select (
  id, organization_id, connected_by, provider, status, scopes,
  external_account_label, token_expires_at, last_checked_at,
  last_error_code, created_at, updated_at
) on table public.integration_connections to authenticated;
grant select (
  id, organization_id, user_id, channel, display_hint, role,
  verified_at, created_at, updated_at
) on table public.channel_identities to authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;
grant select, insert, update, delete on table public.reminders to authenticated;
grant select on table public.workflow_events to authenticated;
grant select on table public.approval_requests to authenticated;
grant select on table public.approval_decisions to authenticated;

revoke delete on table public.approval_requests from service_role;
grant select, insert, update on table public.approval_requests to service_role;
revoke insert, update, delete on table public.approval_decisions from service_role;
grant select on table public.approval_decisions to service_role;

notify pgrst, 'reload schema';
