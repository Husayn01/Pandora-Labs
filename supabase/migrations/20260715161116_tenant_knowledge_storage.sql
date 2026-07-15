create extension if not exists vector with schema extensions;

alter table public.knowledge_sources
  drop constraint if exists knowledge_source_status_check,
  add column if not exists version integer not null default 1,
  add column if not exists parent_source_id uuid,
  add column if not exists visibility text not null default 'member',
  add column if not exists allowed_roles text[] not null default '{}',
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists content_checksum text,
  add column if not exists malware_scan_status text not null default 'pending',
  add column if not exists ingestion_error_code text,
  add column if not exists deleted_at timestamptz,
  add constraint knowledge_source_status_check
    check (status in ('pending', 'scanning', 'ingesting', 'ready', 'failed', 'archived', 'deleted')),
  add constraint knowledge_source_version_check check (version > 0),
  add constraint knowledge_source_visibility_check check (visibility in ('public', 'member', 'role')),
  add constraint knowledge_source_allowed_roles_check check (
    (visibility = 'role' and cardinality(allowed_roles) > 0 and allowed_roles <@ array['owner', 'admin', 'member', 'viewer']::text[])
    or (visibility <> 'role' and cardinality(allowed_roles) = 0)
  ),
  add constraint knowledge_source_size_check check (byte_size between 0 and 26214400),
  add constraint knowledge_source_checksum_check check (content_checksum is null or content_checksum ~ '^[a-f0-9]{64}$'),
  add constraint knowledge_source_malware_status_check check (malware_scan_status in ('pending', 'clean', 'infected', 'failed', 'not_applicable')),
  add constraint knowledge_source_mime_check check (
    mime_type is null or mime_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'text/csv'
    )
  ),
  -- Existing production rows must be inventoried before this constraint is
  -- validated. It still blocks every new or changed tenant source immediately.
  add constraint knowledge_source_tenant_native_only_check
    check (elevenlabs_document_id is null) not valid,
  add constraint knowledge_sources_id_organization_unique unique (id, organization_id),
  add constraint knowledge_sources_parent_tenant_fk
    foreign key (parent_source_id, organization_id)
    references public.knowledge_sources(id, organization_id)
    on delete set null (parent_source_id);

create unique index knowledge_sources_org_checksum_unique
  on public.knowledge_sources (organization_id, content_checksum)
  where content_checksum is not null and deleted_at is null;
create index knowledge_sources_org_visibility_status_idx
  on public.knowledge_sources (organization_id, visibility, status)
  where deleted_at is null;
create index knowledge_sources_parent_tenant_idx
  on public.knowledge_sources (parent_source_id, organization_id)
  where parent_source_id is not null;

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid not null,
  source_version integer not null,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(384) not null,
  embedding_model text not null default 'gte-small',
  token_count integer,
  page_number integer,
  section_title text,
  content_checksum text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint knowledge_chunks_source_tenant_fk
    foreign key (source_id, organization_id)
    references public.knowledge_sources(id, organization_id) on delete cascade,
  constraint knowledge_chunks_version_check check (source_version > 0),
  constraint knowledge_chunks_index_check check (chunk_index >= 0),
  constraint knowledge_chunks_content_check check (length(content) between 1 and 12000),
  constraint knowledge_chunks_model_check check (embedding_model = 'gte-small'),
  constraint knowledge_chunks_token_check check (token_count is null or token_count between 1 and 4096),
  constraint knowledge_chunks_page_check check (page_number is null or page_number > 0),
  constraint knowledge_chunks_checksum_check check (content_checksum ~ '^[a-f0-9]{64}$'),
  unique (source_id, source_version, chunk_index)
);

create index knowledge_chunks_org_source_idx on public.knowledge_chunks (organization_id, source_id, chunk_index);
create index knowledge_chunks_embedding_hnsw_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

alter table public.knowledge_chunks enable row level security;

drop policy if exists knowledge_member_select on public.knowledge_sources;
drop policy if exists knowledge_admin_write on public.knowledge_sources;
drop policy if exists knowledge_admin_insert on public.knowledge_sources;
drop policy if exists knowledge_admin_update on public.knowledge_sources;
drop policy if exists knowledge_admin_delete on public.knowledge_sources;
create policy knowledge_visibility_select on public.knowledge_sources
  for select to authenticated
  using (
    (select private.is_org_member(organization_id))
    and deleted_at is null
    and (
      visibility in ('public', 'member')
      or exists (
        select 1 from public.organization_members m
        where m.organization_id = knowledge_sources.organization_id
          and m.user_id = (select auth.uid())
          and m.status = 'active'
          and m.role = any(knowledge_sources.allowed_roles)
      )
    )
  );

create policy knowledge_chunks_visibility_select on public.knowledge_chunks
  for select to authenticated
  using (
    exists (
      select 1 from public.knowledge_sources s
      where s.id = knowledge_chunks.source_id
        and s.organization_id = knowledge_chunks.organization_id
        and s.deleted_at is null
        and s.status = 'ready'
        and (select private.is_org_member(s.organization_id))
        and (
          s.visibility in ('public', 'member')
          or exists (
            select 1 from public.organization_members m
            where m.organization_id = s.organization_id
              and m.user_id = (select auth.uid())
              and m.status = 'active'
              and m.role = any(s.allowed_roles)
          )
        )
    )
  );

revoke all on table public.knowledge_chunks from public, anon, authenticated;
grant select on table public.knowledge_chunks to authenticated;
grant select, insert, update, delete on table public.knowledge_chunks to service_role;

-- Knowledge ingestion and deletion are trusted server operations. Browser
-- clients may read sources allowed by RLS but cannot forge malware, checksum,
-- storage, or ingestion state.
revoke all on table public.knowledge_sources from public, anon, authenticated;
grant select on table public.knowledge_sources to authenticated;

create or replace function private.match_knowledge_chunks(
  p_organization_id uuid,
  p_query_embedding extensions.vector(384),
  p_include_member boolean default false,
  p_roles text[] default '{}',
  p_similarity_threshold real default 0.72,
  p_match_count integer default 8
)
returns table (
  source_id uuid,
  source_title text,
  chunk_id uuid,
  content text,
  citation jsonb,
  similarity real
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_match_count not between 1 and 20 then
    raise exception using errcode = '22023', message = 'invalid knowledge match count';
  end if;
  if p_similarity_threshold < 0 or p_similarity_threshold > 1 then
    raise exception using errcode = '22023', message = 'invalid knowledge similarity threshold';
  end if;
  if not coalesce(p_roles, '{}') <@ array['owner', 'admin', 'member', 'viewer']::text[] then
    raise exception using errcode = '22023', message = 'invalid knowledge roles';
  end if;

  return query
  select
    s.id,
    s.title,
    c.id,
    c.content,
    jsonb_build_object(
      'sourceId', s.id,
      'title', s.title,
      'version', c.source_version,
      'page', c.page_number,
      'section', c.section_title,
      'sourceUrl', s.source_url
    ),
    (1 - (c.embedding <=> p_query_embedding))::real
  from public.knowledge_chunks c
  join public.knowledge_sources s
    on s.id = c.source_id and s.organization_id = c.organization_id
  where c.organization_id = p_organization_id
    and s.status = 'ready'
    and s.deleted_at is null
    and (
      s.visibility = 'public'
      or (s.visibility = 'member' and p_include_member)
      or (s.visibility = 'role' and s.allowed_roles && coalesce(p_roles, '{}'))
    )
    and 1 - (c.embedding <=> p_query_embedding) >= p_similarity_threshold
  order by c.embedding <=> p_query_embedding, c.id
  limit p_match_count;
end;
$function$;

create or replace function private.purge_deleted_knowledge_chunks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.knowledge_chunks where source_id = new.id;
  end if;
  return new;
end;
$function$;

revoke all on function private.match_knowledge_chunks(uuid, extensions.vector, boolean, text[], real, integer)
  from public, anon, authenticated;
revoke all on function private.purge_deleted_knowledge_chunks()
  from public, anon, authenticated;
grant execute on function private.match_knowledge_chunks(uuid, extensions.vector, boolean, text[], real, integer)
  to service_role;

create or replace function public.match_knowledge_chunks(
  p_organization_id uuid,
  p_query_embedding extensions.vector(384),
  p_include_member boolean default false,
  p_roles text[] default '{}',
  p_similarity_threshold real default 0.72,
  p_match_count integer default 8
)
returns table (
  source_id uuid,
  source_title text,
  chunk_id uuid,
  content text,
  citation jsonb,
  similarity real
)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.match_knowledge_chunks(
    p_organization_id, p_query_embedding, p_include_member,
    p_roles, p_similarity_threshold, p_match_count
  );
$function$;

revoke all on function public.match_knowledge_chunks(uuid, extensions.vector, boolean, text[], real, integer)
  from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks(uuid, extensions.vector, boolean, text[], real, integer)
  to service_role;

create trigger knowledge_sources_purge_deleted_chunks
after update of deleted_at on public.knowledge_sources
for each row execute function private.purge_deleted_knowledge_chunks();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-knowledge',
  'tenant-knowledge',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
