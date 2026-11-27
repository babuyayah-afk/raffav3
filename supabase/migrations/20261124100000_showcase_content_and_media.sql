create table public.site_sections (
  section_key text primary key,
  title text not null,
  display_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.site_sections (section_key, title, display_order)
values
  ('home.heroCards', 'Homepage hero cards', 10),
  ('home.stats', 'Homepage counters', 20),
  ('home.services', 'Homepage services', 30),
  ('home.projects', 'Portfolio', 40),
  ('home.testimonials', 'Testimonials', 50),
  ('home.packages', 'Event and dessert packages', 60),
  ('home.faq', 'Frequently asked questions', 70),
  ('apparel.catalog', 'Apparel catalogue', 80),
  ('apparel.newsletter', 'Apparel newsletter', 90)
on conflict (section_key) do nothing;

create table public.site_content_drafts (
  content_key text primary key,
  value_json jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.showcase_items (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (
    content_type in ('dessert_package', 'event_package', 'portfolio_item', 'faq')
  ),
  slug text not null,
  title text not null,
  summary text not null default '',
  body text not null default '',
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  image_asset_id uuid references public.media_assets (id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'published')),
  draft_data jsonb check (draft_data is null or jsonb_typeof(draft_data) = 'object'),
  is_visible boolean not null default true,
  is_featured boolean not null default false,
  display_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (content_type, slug)
);

create index showcase_items_public_order
  on public.showcase_items (content_type, display_order, created_at)
  where status = 'published' and is_visible and archived_at is null;

create table public.media_asset_usage (
  asset_id uuid not null references public.media_assets (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (asset_id, entity_type, entity_id)
);

alter table public.site_sections enable row level security;
alter table public.site_content_drafts enable row level security;
alter table public.showcase_items enable row level security;
alter table public.media_asset_usage enable row level security;

revoke all on public.site_sections, public.site_content_drafts,
  public.showcase_items, public.media_asset_usage
  from anon, authenticated;
grant select, insert, update, delete on public.site_sections,
  public.site_content_drafts, public.showcase_items, public.media_asset_usage
  to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('showcase-media', 'showcase-media', false, 2097152, array['image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/webp'];

create or replace function public.save_site_content_state(
  p_actor_user_id uuid,
  p_content_key text,
  p_value_json jsonb,
  p_status text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_value jsonb;
  saved_at timestamptz := pg_catalog.now();
begin
  if p_status is null or p_status not in ('draft', 'published')
      or p_value_json is null
      or jsonb_typeof(p_value_json) not in ('object', 'array') then
    raise exception 'Website content state is invalid.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.admin_profiles ap
    join public.role_permissions rp on rp.role_key = ap.role_key
    where ap.id = p_actor_user_id and ap.is_active
      and rp.permission_key = 'content.write'
  ) then
    raise exception 'Content write permission is required.' using errcode = '42501';
  end if;

  select value_json into before_value
  from public.site_content where content_key = p_content_key;

  if p_status = 'draft' then
    insert into public.site_content_drafts (content_key, value_json, updated_by, updated_at)
    values (p_content_key, p_value_json, p_actor_user_id, saved_at)
    on conflict (content_key) do update set
      value_json = excluded.value_json,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
  else
    insert into public.site_content (content_key, value_json, updated_at)
    values (p_content_key, p_value_json, saved_at)
    on conflict (content_key) do update set
      value_json = excluded.value_json,
      updated_at = excluded.updated_at;
    delete from public.site_content_drafts where content_key = p_content_key;
  end if;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id
  ) values (
    p_actor_user_id,
    case when p_status = 'draft' then 'site_content.draft_saved' else 'site_content.published' end,
    'site_content',
    p_content_key,
    before_value,
    jsonb_build_object('status', p_status, 'value', p_value_json),
    p_request_id
  );

  return jsonb_build_object(
    'content_key', p_content_key,
    'value_json', p_value_json,
    'status', p_status,
    'updated_at', saved_at
  );
end;
$$;

create or replace function public.save_showcase_item(
  p_actor_user_id uuid,
  p_item_id uuid,
  p_content_type text,
  p_slug text,
  p_title text,
  p_summary text,
  p_body text,
  p_details jsonb,
  p_image_asset_id uuid,
  p_status text,
  p_is_visible boolean,
  p_is_featured boolean,
  p_display_order integer,
  p_request_id text default null
)
returns public.showcase_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_item public.showcase_items;
  saved_item public.showcase_items;
begin
  if not exists (
    select 1 from public.admin_profiles ap
    join public.role_permissions rp on rp.role_key = ap.role_key
    where ap.id = p_actor_user_id and ap.is_active and rp.permission_key = 'content.write'
  ) then
    raise exception 'Content write permission is required.' using errcode = '42501';
  end if;
  if p_content_type is null or p_content_type not in ('dessert_package', 'event_package', 'portfolio_item', 'faq')
      or p_slug is null
      or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or length(p_slug) > 120
      or p_title is null or length(btrim(p_title)) not between 1 and 160
      or length(coalesce(p_summary, '')) > 1000
      or length(coalesce(p_body, '')) > 10000
      or p_details is null or jsonb_typeof(p_details) <> 'object'
      or p_status is null or p_status not in ('draft', 'published')
      or p_is_visible is null or p_is_featured is null
      or p_display_order is null or p_display_order not between 0 and 10000 then
    raise exception 'Showcase item fields are invalid.' using errcode = '22023';
  end if;
  if p_image_asset_id is not null and not exists (
    select 1 from public.media_assets
    where id = p_image_asset_id and archived_at is null
  ) then
    raise exception 'The selected image is unavailable.' using errcode = '23503';
  end if;

  if p_item_id is not null then
    select * into existing_item from public.showcase_items
    where id = p_item_id and archived_at is null for update;
  end if;

  if existing_item.id is null then
    insert into public.showcase_items (
      id, content_type, slug, title, summary, body, details, image_asset_id,
      status, is_visible, is_featured, display_order, created_by, updated_by, draft_data
    ) values (
      coalesce(p_item_id, gen_random_uuid()), p_content_type, p_slug, btrim(p_title),
      coalesce(p_summary, ''), coalesce(p_body, ''), p_details, p_image_asset_id,
      p_status, p_is_visible, p_is_featured, p_display_order, p_actor_user_id, p_actor_user_id,
      null
    ) returning * into saved_item;
  elsif p_status = 'draft' and existing_item.status = 'published' then
    update public.showcase_items set
      draft_data = jsonb_build_object(
        'content_type', p_content_type,
        'slug', p_slug,
        'title', btrim(p_title),
        'summary', coalesce(p_summary, ''),
        'body', coalesce(p_body, ''),
        'details', p_details,
        'image_asset_id', p_image_asset_id,
        'is_visible', p_is_visible,
        'is_featured', p_is_featured,
        'display_order', p_display_order
      ),
      updated_by = p_actor_user_id,
      updated_at = pg_catalog.now()
    where id = existing_item.id
    returning * into saved_item;
  else
    update public.showcase_items set
      content_type = p_content_type,
      slug = p_slug,
      title = btrim(p_title),
      summary = coalesce(p_summary, ''),
      body = coalesce(p_body, ''),
      details = p_details,
      image_asset_id = p_image_asset_id,
      status = p_status,
      is_visible = p_is_visible,
      is_featured = p_is_featured,
      display_order = p_display_order,
      draft_data = null,
      updated_by = p_actor_user_id,
      updated_at = pg_catalog.now()
    where id = existing_item.id
    returning * into saved_item;
  end if;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id
  ) values (
    p_actor_user_id,
    case when existing_item.id is null then 'showcase.created' else 'showcase.updated' end,
    p_content_type, saved_item.id::text,
    case when existing_item.id is null then null else to_jsonb(existing_item) end,
    to_jsonb(saved_item), p_request_id
  );
  return saved_item;
end;
$$;

create or replace function public.archive_showcase_item(
  p_actor_user_id uuid,
  p_item_id uuid,
  p_request_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_item public.showcase_items;
begin
  if not exists (
    select 1 from public.admin_profiles ap
    join public.role_permissions rp on rp.role_key = ap.role_key
    where ap.id = p_actor_user_id and ap.is_active and rp.permission_key = 'content.write'
  ) then
    raise exception 'Content write permission is required.' using errcode = '42501';
  end if;
  update public.showcase_items set archived_at = pg_catalog.now(),
    updated_by = p_actor_user_id, updated_at = pg_catalog.now()
  where id = p_item_id and archived_at is null
  returning * into existing_item;
  if existing_item.id is null then return false; end if;
  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id
  ) values (
    p_actor_user_id, 'showcase.archived', existing_item.content_type,
    existing_item.id::text, to_jsonb(existing_item),
    jsonb_build_object('archived_at', existing_item.archived_at), p_request_id
  );
  return true;
end;
$$;

create or replace function public.set_site_sections(
  p_actor_user_id uuid,
  p_sections jsonb,
  p_request_id text default null
)
returns setof public.site_sections
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry jsonb;
  section_row public.site_sections;
begin
  if not exists (
    select 1 from public.admin_profiles ap
    join public.role_permissions rp on rp.role_key = ap.role_key
    where ap.id = p_actor_user_id and ap.is_active and rp.permission_key = 'content.write'
  ) then
    raise exception 'Content write permission is required.' using errcode = '42501';
  end if;
  if p_sections is null or jsonb_typeof(p_sections) <> 'array'
      or jsonb_array_length(p_sections) > 50 then
    raise exception 'Section list is invalid.' using errcode = '22023';
  end if;

  for entry in select * from jsonb_array_elements(p_sections)
  loop
    if length(coalesce(entry->>'section_key', '')) = 0
        or length(coalesce(entry->>'section_key', '')) > 120
        or coalesce((entry->>'display_order')::integer, -1) not between 0 and 10000
        or coalesce(entry->>'is_visible', '') not in ('true', 'false')
        or length(coalesce(entry->>'title', '')) not between 1 and 160 then
      raise exception 'Section entry is invalid.' using errcode = '22023';
    end if;
    update public.site_sections set
      title = left(coalesce(entry->>'title', section_key), 160),
      display_order = (entry->>'display_order')::integer,
      is_visible = (entry->>'is_visible')::boolean,
      updated_at = pg_catalog.now(),
      updated_by = p_actor_user_id
    where section_key = entry->>'section_key'
    returning * into section_row;
    if section_row.section_key is null then
      raise exception 'Unknown site section.' using errcode = 'P0002';
    end if;
    insert into public.audit_logs (
      actor_user_id, action, entity_type, entity_id, after_data, request_id
    ) values (
      p_actor_user_id, 'site_section.updated', 'site_section',
      section_row.section_key, to_jsonb(section_row), p_request_id
    );
    return next section_row;
  end loop;
end;
$$;

create or replace function public.sync_showcase_media_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.media_asset_usage
  where entity_type in ('showcase_item', 'showcase_item_draft')
    and entity_id = case when tg_op = 'DELETE' then old.id else new.id end;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.image_asset_id is not null and new.archived_at is null then
    insert into public.media_asset_usage (asset_id, entity_type, entity_id)
    values (new.image_asset_id, 'showcase_item', new.id)
    on conflict (asset_id, entity_type, entity_id) do nothing;
  end if;
  if new.archived_at is null and new.draft_data ? 'image_asset_id'
      and new.draft_data->>'image_asset_id' is not null then
    insert into public.media_asset_usage (asset_id, entity_type, entity_id)
    values ((new.draft_data->>'image_asset_id')::uuid, 'showcase_item_draft', new.id)
    on conflict (asset_id, entity_type, entity_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger showcase_items_sync_media_usage
  after insert or update or delete on public.showcase_items
  for each row execute function public.sync_showcase_media_usage();

insert into public.media_asset_usage (asset_id, entity_type, entity_id)
select image_asset_id, 'showcase_item', id
from public.showcase_items
where image_asset_id is not null and archived_at is null
on conflict (asset_id, entity_type, entity_id) do nothing;

insert into public.media_asset_usage (asset_id, entity_type, entity_id)
select (draft_data->>'image_asset_id')::uuid, 'showcase_item_draft', id
from public.showcase_items
where archived_at is null
  and draft_data ? 'image_asset_id'
  and draft_data->>'image_asset_id' is not null
on conflict (asset_id, entity_type, entity_id) do nothing;

create or replace function public.register_showcase_media(
  p_actor_user_id uuid,
  p_storage_path text,
  p_original_name text,
  p_file_size_bytes integer,
  p_alt_text text,
  p_request_id text default null
)
returns public.media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset public.media_assets;
begin
  if not exists (
    select 1 from public.admin_profiles ap
    join public.role_permissions rp on rp.role_key = ap.role_key
    where ap.id = p_actor_user_id and ap.is_active and rp.permission_key = 'media.write'
  ) then
    raise exception 'Media write permission is required.' using errcode = '42501';
  end if;
  if p_storage_path !~ '^[0-9a-f-]{36}\.webp$'
      or p_file_size_bytes not between 1 and 2097152
      or length(coalesce(p_original_name, '')) not between 1 and 150
      or length(coalesce(p_alt_text, '')) > 500 then
    raise exception 'Media asset metadata is invalid.' using errcode = '22023';
  end if;
  insert into public.media_assets (
    storage_path, original_name, content_type, file_size_bytes,
    alt_text, uploaded_by, metadata
  ) values (
    p_storage_path, p_original_name, 'image/webp', p_file_size_bytes,
    coalesce(p_alt_text, ''), p_actor_user_id,
    jsonb_build_object('bucket', 'showcase-media')
  ) returning * into asset;
  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, after_data, request_id
  ) values (
    p_actor_user_id, 'media.uploaded', 'media_asset', asset.id::text,
    to_jsonb(asset), p_request_id
  );
  return asset;
end;
$$;

create or replace function public.update_showcase_media(
  p_actor_user_id uuid,
  p_asset_id uuid,
  p_alt_text text,
  p_archive boolean default false,
  p_request_id text default null
)
returns public.media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_asset public.media_assets;
  saved_asset public.media_assets;
begin
  if not exists (
    select 1 from public.admin_profiles ap
    join public.role_permissions rp on rp.role_key = ap.role_key
    where ap.id = p_actor_user_id and ap.is_active and rp.permission_key = 'media.write'
  ) then
    raise exception 'Media write permission is required.' using errcode = '42501';
  end if;
  select * into existing_asset from public.media_assets
  where id = p_asset_id and archived_at is null for update;
  if not found then
    raise exception 'Media asset not found.' using errcode = 'P0002';
  end if;
  if p_archive and exists (
    select 1 from public.showcase_items
    where archived_at is null
      and (image_asset_id = p_asset_id
        or draft_data->>'image_asset_id' = p_asset_id::text)
  ) then
    raise exception 'Media asset is in use by showcase content.' using errcode = '23503';
  end if;
  if length(coalesce(p_alt_text, '')) > 500 then
    raise exception 'Alternative text is too long.' using errcode = '22023';
  end if;
  update public.media_assets set
    alt_text = coalesce(p_alt_text, ''),
    archived_at = case when p_archive then pg_catalog.now() else null end
  where id = p_asset_id
  returning * into saved_asset;
  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id
  ) values (
    p_actor_user_id,
    case when p_archive then 'media.archived' else 'media.updated' end,
    'media_asset', p_asset_id::text, to_jsonb(existing_asset), to_jsonb(saved_asset), p_request_id
  );
  return saved_asset;
end;
$$;

revoke all on function public.save_site_content_state(uuid, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.save_showcase_item(uuid, uuid, text, text, text, text, text, jsonb, uuid, text, boolean, boolean, integer, text) from public, anon, authenticated;
revoke all on function public.archive_showcase_item(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.set_site_sections(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.register_showcase_media(uuid, text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.update_showcase_media(uuid, uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.sync_showcase_media_usage() from public, anon, authenticated;
grant execute on function public.save_site_content_state(uuid, text, jsonb, text, text) to service_role;
grant execute on function public.save_showcase_item(uuid, uuid, text, text, text, text, text, jsonb, uuid, text, boolean, boolean, integer, text) to service_role;
grant execute on function public.archive_showcase_item(uuid, uuid, text) to service_role;
grant execute on function public.set_site_sections(uuid, jsonb, text) to service_role;
grant execute on function public.register_showcase_media(uuid, text, text, integer, text, text) to service_role;
grant execute on function public.update_showcase_media(uuid, uuid, text, boolean, text) to service_role;
