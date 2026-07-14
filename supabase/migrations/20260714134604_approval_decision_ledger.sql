create table public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  approval_request_id uuid not null unique references public.approval_requests(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  decision text not null,
  action_type text not null,
  action_payload_hash text not null,
  approval_idempotency_key text not null,
  decision_idempotency_key text not null,
  decided_at timestamptz not null default now(),
  constraint approval_decisions_value_check check (decision in ('approved', 'rejected')),
  unique (organization_id, decision_idempotency_key)
);

create index approval_decisions_org_decided_idx
  on public.approval_decisions (organization_id, decided_at desc);

alter table public.approval_decisions enable row level security;

create policy approval_decisions_member_select
  on public.approval_decisions
  for select
  to authenticated
  using ((select private.is_org_member(organization_id)));

revoke all on table public.approval_decisions from public, anon, authenticated;
grant select on table public.approval_decisions to authenticated;
grant all on table public.approval_decisions to service_role;

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
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_request public.approval_requests%rowtype;
  v_existing public.approval_decisions%rowtype;
  v_now timestamptz := now();
begin
  if p_decision not in ('approved', 'rejected') then
    return jsonb_build_object('ok', false, 'code', 'invalid_decision');
  end if;

  select *
    into v_request
    from public.approval_requests
   where id = p_approval_request_id
     and organization_id = p_organization_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_request.action_payload_hash <> p_expected_payload_hash
     or v_request.idempotency_key <> p_expected_approval_idempotency_key then
    return jsonb_build_object('ok', false, 'code', 'binding_mismatch');
  end if;

  if v_request.status in ('approved', 'rejected') then
    select * into v_existing
      from public.approval_decisions
     where approval_request_id = v_request.id;
    if found
       and v_existing.decision = p_decision
       and v_existing.decision_idempotency_key = p_decision_idempotency_key then
      return jsonb_build_object(
        'ok', true,
        'replayed', true,
        'approvalId', v_request.id,
        'status', v_request.status,
        'decidedAt', v_existing.decided_at
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'already_decided', 'status', v_request.status);
  end if;

  if v_request.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'not_pending', 'status', v_request.status);
  end if;

  if v_request.expires_at <= v_now then
    update public.approval_requests
       set status = 'expired'
     where id = v_request.id;
    return jsonb_build_object('ok', false, 'code', 'expired', 'status', 'expired');
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
    v_now
  );

  update public.approval_requests
     set status = p_decision,
         decided_by = p_actor_user_id,
         decided_at = v_now
   where id = v_request.id;

  return jsonb_build_object(
    'ok', true,
    'replayed', false,
    'approvalId', v_request.id,
    'status', p_decision,
    'decidedAt', v_now
  );
end;
$function$;

revoke all on function public.decide_approval(uuid, uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.decide_approval(uuid, uuid, uuid, text, text, text, text)
  to service_role;
