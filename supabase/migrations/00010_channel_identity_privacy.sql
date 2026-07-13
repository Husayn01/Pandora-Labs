-- Phone and messaging identifiers are private account data. Ordinary members may
-- only read their own mappings; workspace owners/admins retain support access.
drop policy if exists channels_member_select on public.channel_identities;

create policy channels_self_or_admin_select
on public.channel_identities
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_org_role(organization_id, array['owner', 'admin']))
);
