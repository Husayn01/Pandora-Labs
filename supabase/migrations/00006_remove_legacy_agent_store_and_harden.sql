-- Remove verified-empty Agent Store/RAG infrastructure and preserve historical message attribution.

update public.messages m
set metadata = coalesce(m.metadata,'{}'::jsonb) || jsonb_build_object('legacy_agent_name',ac.name)
from public.user_agents ua join public.agent_catalog ac on ac.id=ua.catalog_agent_id
where m.user_agent_id=ua.id and m.user_agent_id is not null;

alter table public.messages drop column if exists user_agent_id;
alter table public.messages drop column if exists agent_id;
alter table public.agent_knowledge_files drop column if exists user_agent_id;

drop policy if exists "Users can upload their own knowledge files" on storage.objects;
drop policy if exists "Users can update their own knowledge files" on storage.objects;
drop policy if exists "Users can read their own knowledge files" on storage.objects;
drop policy if exists "Users can delete their own knowledge files" on storage.objects;
-- 00001 used "knowledge storage objects" in the deployed policy names. Keep
-- both spellings so fresh resets and older projects converge safely.
drop policy if exists "Users can upload their own knowledge storage objects" on storage.objects;
drop policy if exists "Users can update their own knowledge storage objects" on storage.objects;
drop policy if exists "Users can read their own knowledge storage objects" on storage.objects;
drop policy if exists "Users can delete their own knowledge storage objects" on storage.objects;
-- The empty legacy bucket is intentionally left in place because Supabase protects
-- bucket deletion at SQL level. Remove it through the Storage API during rollout.

drop table if exists public.knowledge_embeddings cascade;
drop table if exists public.agent_knowledge_files cascade;
drop table if exists public.user_agents cascade;
drop table if exists public.agent_catalog cascade;
drop table if exists public.agents cascade;
drop table if exists public.integrations cascade;
drop table if exists public.user_connectors cascade;
drop extension if exists vector;

-- Explicit server-only policies remove advisor ambiguity while remaining deny-by-default.
create policy billing_events_server_only on public.billing_events for all to authenticated using (false) with check (false);
create policy oauth_states_server_only on public.integration_oauth_states for all to authenticated using (false) with check (false);

-- Avoid duplicate permissive SELECT policies created by FOR ALL rules.
drop policy if exists integrations_admin_write on public.integration_connections;
create policy integrations_admin_insert on public.integration_connections for insert to authenticated with check ((select private.has_org_role(organization_id,array['owner','admin'])));
create policy integrations_admin_update on public.integration_connections for update to authenticated using ((select private.has_org_role(organization_id,array['owner','admin']))) with check ((select private.has_org_role(organization_id,array['owner','admin'])));
create policy integrations_admin_delete on public.integration_connections for delete to authenticated using ((select private.has_org_role(organization_id,array['owner','admin'])));

drop policy if exists channels_admin_write on public.channel_identities;
create policy channels_admin_insert on public.channel_identities for insert to authenticated with check ((select private.has_org_role(organization_id,array['owner','admin'])));
create policy channels_admin_update on public.channel_identities for update to authenticated using ((select private.has_org_role(organization_id,array['owner','admin']))) with check ((select private.has_org_role(organization_id,array['owner','admin'])));
create policy channels_admin_delete on public.channel_identities for delete to authenticated using ((select private.has_org_role(organization_id,array['owner','admin'])));

drop policy if exists reminders_member_write on public.reminders;
create policy reminders_member_insert on public.reminders for insert to authenticated with check ((select private.is_org_member(organization_id)));
create policy reminders_member_update on public.reminders for update to authenticated using ((select private.is_org_member(organization_id))) with check ((select private.is_org_member(organization_id)));
create policy reminders_admin_delete on public.reminders for delete to authenticated using ((select private.has_org_role(organization_id,array['owner','admin'])));

drop policy if exists knowledge_admin_write on public.knowledge_sources;
create policy knowledge_admin_insert on public.knowledge_sources for insert to authenticated with check ((select private.has_org_role(organization_id,array['owner','admin'])));
create policy knowledge_admin_update on public.knowledge_sources for update to authenticated using ((select private.has_org_role(organization_id,array['owner','admin']))) with check ((select private.has_org_role(organization_id,array['owner','admin'])));
create policy knowledge_admin_delete on public.knowledge_sources for delete to authenticated using ((select private.has_org_role(organization_id,array['owner','admin'])));

drop policy if exists invoices_member_write on public.invoices;
create policy invoices_member_insert on public.invoices for insert to authenticated with check ((select private.is_org_member(organization_id)));
create policy invoices_member_update on public.invoices for update to authenticated using ((select private.is_org_member(organization_id))) with check ((select private.is_org_member(organization_id)));
create policy invoices_admin_delete on public.invoices for delete to authenticated using ((select private.has_org_role(organization_id,array['owner','admin'])));

drop policy if exists invoice_items_member_write on public.invoice_items;
create policy invoice_items_member_insert on public.invoice_items for insert to authenticated with check (exists(select 1 from public.invoices i where i.id=invoice_id and (select private.is_org_member(i.organization_id))));
create policy invoice_items_member_update on public.invoice_items for update to authenticated using (exists(select 1 from public.invoices i where i.id=invoice_id and (select private.is_org_member(i.organization_id)))) with check (exists(select 1 from public.invoices i where i.id=invoice_id and (select private.is_org_member(i.organization_id))));
create policy invoice_items_member_delete on public.invoice_items for delete to authenticated using (exists(select 1 from public.invoices i where i.id=invoice_id and (select private.has_org_role(i.organization_id,array['owner','admin']))));

-- Cover foreign keys used by deletes, joins, and authorization filters.
create index if not exists organizations_owner_idx on public.organizations(owner_user_id);
create index if not exists conversations_actor_idx on public.conversations(actor_user_id);
create index if not exists conversations_user_idx on public.conversations(user_id);
create index if not exists integration_connections_connected_by_idx on public.integration_connections(connected_by);
create index if not exists channel_identities_user_idx on public.channel_identities(user_id);
create index if not exists channel_link_tokens_org_idx on public.channel_link_tokens(organization_id);
create index if not exists channel_link_tokens_user_idx on public.channel_link_tokens(user_id);
create index if not exists approval_requests_conversation_idx on public.approval_requests(conversation_id);
create index if not exists approval_requests_requested_by_idx on public.approval_requests(requested_by);
create index if not exists approval_requests_decided_by_idx on public.approval_requests(decided_by);
create index if not exists billing_events_org_idx on public.billing_events(organization_id);
create index if not exists oauth_states_org_idx on public.integration_oauth_states(organization_id);
create index if not exists oauth_states_user_idx on public.integration_oauth_states(user_id);
create index if not exists invoices_created_by_idx on public.invoices(created_by);
create index if not exists knowledge_sources_created_by_idx on public.knowledge_sources(created_by);
create index if not exists reminders_created_by_idx on public.reminders(created_by);
create index if not exists reminders_task_idx on public.reminders(task_id);
create index if not exists tasks_created_by_idx on public.tasks(created_by);
create index if not exists tasks_assignee_idx on public.tasks(assignee_id);
create index if not exists workflow_events_actor_idx on public.workflow_events(actor_user_id);
create index if not exists workflow_events_conversation_idx on public.workflow_events(conversation_id);
create index if not exists subscriptions_billing_customer_idx on public.subscriptions(billing_customer_id);
