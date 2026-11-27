create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id),
  type text not null check (type in ('events', 'desserts', 'general', 'apparels')),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'quote_sent', 'confirmed', 'completed', 'lost', 'declined')),
  status_reason text,
  source text not null default 'website',
  name text not null,
  email text not null,
  phone text,
  message text not null default '',
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  assignee_id uuid references public.admin_profiles (id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  follow_up_notified_at timestamptz,
  check (
    (status in ('lost', 'declined') and nullif(btrim(status_reason), '') is not null)
    or (status not in ('lost', 'declined') and status_reason is null)
  )
);

create index inquiries_created_at on public.inquiries (created_at desc);
create index inquiries_status_created_at on public.inquiries (status, created_at desc);
create index inquiries_type_created_at on public.inquiries (type, created_at desc);
create index inquiries_assignee_created_at on public.inquiries (assignee_id, created_at desc);
create index inquiries_last_activity_at on public.inquiries (last_activity_at);
create index inquiries_unread_created_at on public.inquiries (created_at desc) where not is_read;
create index inquiries_email_lower on public.inquiries (lower(email));

create table public.inquiry_activity (
  id bigint generated always as identity primary key,
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  activity_type text not null check (
    activity_type in ('submitted', 'status_changed', 'assigned', 'note', 'follow_up_reminder')
  ),
  content text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index inquiry_activity_timeline
  on public.inquiry_activity (inquiry_id, created_at, id);

create table public.inquiry_attachments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  content_type text not null check (content_type = 'image/webp'),
  file_size_bytes integer not null check (file_size_bytes between 1 and 2097152),
  alt_text text not null default '',
  created_at timestamptz not null default now()
);

create index inquiry_attachments_inquiry_id on public.inquiry_attachments (inquiry_id);

create table public.reply_templates (
  id uuid primary key default gen_random_uuid(),
  inquiry_type text not null check (inquiry_type in ('events', 'desserts', 'general', 'apparels')),
  name text not null,
  subject text not null default '',
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (inquiry_type, name)
);

create table public.inquiry_notification_outbox (
  id bigint generated always as identity primary key,
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  recipients text[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (inquiry_id)
);

create index inquiry_notification_outbox_due
  on public.inquiry_notification_outbox (next_attempt_at, created_at)
  where status = 'pending';

insert into public.customers (display_name, email, phone)
select distinct on (lower(source.email))
  source.name,
  lower(source.email),
  source.phone
from (
  select customer_name as name, customer_email as email, customer_phone as phone, created_at
  from public.contact_inquiries
  union all
  select customer_name, customer_email, customer_phone, created_at
  from public.celebration_requests
) as source
where nullif(btrim(source.email), '') is not null
order by lower(source.email), source.created_at desc
on conflict (lower(email)) where email is not null
do update set
  display_name = excluded.display_name,
  phone = coalesce(excluded.phone, public.customers.phone),
  updated_at = pg_catalog.now();

insert into public.inquiries (
  customer_id, type, status, source, name, email, phone, message, details, created_at, updated_at, last_activity_at
)
select
  customer.id,
  case legacy.topic when 'apparels' then 'apparels' else legacy.topic end,
  case legacy.status
    when 'reviewed' then 'contacted'
    when 'responded' then 'quote_sent'
    when 'closed' then 'completed'
    else 'new'
  end,
  'legacy-contact',
  legacy.customer_name,
  lower(legacy.customer_email),
  legacy.customer_phone,
  coalesce(legacy.details_json->>'eventNotes', legacy.details_json->>'dessertNotes',
    legacy.details_json->>'apparelNotes', ''),
  legacy.details_json,
  legacy.created_at,
  legacy.created_at,
  legacy.created_at
from public.contact_inquiries legacy
join public.customers customer on lower(customer.email) = lower(legacy.customer_email)
where not exists (
  select 1 from public.inquiries existing
  where existing.source = 'legacy-contact'
    and existing.email = lower(legacy.customer_email)
    and existing.created_at = legacy.created_at
);

insert into public.inquiries (
  customer_id, type, status, source, name, email, phone, message, details, created_at, updated_at, last_activity_at
)
select
  customer.id,
  'events',
  case legacy.status
    when 'reviewed' then 'contacted'
    when 'responded' then 'quote_sent'
    when 'closed' then 'completed'
    else 'new'
  end,
  'legacy-celebration',
  legacy.customer_name,
  lower(legacy.customer_email),
  legacy.customer_phone,
  legacy.notes,
  jsonb_build_object(
    'occasion', legacy.occasion,
    'eventDate', legacy.event_date,
    'eventLocation', legacy.event_location,
    'guestCount', legacy.guest_count,
    'budget', legacy.budget,
    'selections', legacy.selections_json
  ),
  legacy.created_at,
  legacy.created_at,
  legacy.created_at
from public.celebration_requests legacy
join public.customers customer on lower(customer.email) = lower(legacy.customer_email)
where not exists (
  select 1 from public.inquiries existing
  where existing.source = 'legacy-celebration'
    and existing.email = lower(legacy.customer_email)
    and existing.created_at = legacy.created_at
);

insert into public.inquiry_activity (inquiry_id, activity_type, content, created_at)
select id, 'submitted', 'Imported from an earlier website inquiry form.', created_at
from public.inquiries
where source in ('legacy-contact', 'legacy-celebration');

insert into public.reply_templates (inquiry_type, name, subject, body) values
  ('general', 'We received your inquiry', 'Thanks for contacting RAFA',
   'Hello {{name}},\n\nThank you for reaching out to RAFA. We have received your inquiry and will get back to you shortly.\n\nWarm regards,\nRAFA'),
  ('events', 'Event details follow-up', 'A few details about your event',
   'Hello {{name}},\n\nThank you for considering RAFA for your event. We would be happy to learn a little more about your plans and help you explore the options.\n\nWarm regards,\nRAFA'),
  ('desserts', 'Dessert inquiry follow-up', 'Let us help with your dessert plans',
   'Hello {{name}},\n\nThank you for your dessert inquiry. We would be happy to discuss your date, servings, and flavour preferences.\n\nWarm regards,\nRAFA');

alter table public.inquiries enable row level security;
alter table public.inquiry_activity enable row level security;
alter table public.inquiry_attachments enable row level security;
alter table public.reply_templates enable row level security;
alter table public.inquiry_notification_outbox enable row level security;

revoke all on public.inquiries, public.inquiry_activity, public.inquiry_attachments,
  public.reply_templates, public.inquiry_notification_outbox
  from anon, authenticated;
grant select, insert, update, delete on public.inquiries, public.inquiry_activity,
  public.inquiry_attachments, public.reply_templates, public.inquiry_notification_outbox
  to service_role;
grant usage, select on sequence public.inquiry_activity_id_seq,
  public.inquiry_notification_outbox_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inquiry-references', 'inquiry-references', false, 2097152, array['image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.submit_public_inquiry(
  p_id uuid,
  p_type text,
  p_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_details jsonb,
  p_source text,
  p_attachments jsonb,
  p_recipients text[]
)
returns public.inquiries
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_inquiry public.inquiries;
  saved_customer_id uuid;
  attachment jsonb;
begin
  if p_type not in ('events', 'desserts', 'general', 'apparels')
      or p_name is null or length(btrim(p_name)) not between 2 and 100
      or p_email is null or length(p_email) > 254
      or p_message is null or length(p_message) > 2000
      or jsonb_typeof(p_details) <> 'object'
      or jsonb_typeof(p_attachments) <> 'array' then
    raise exception 'Inquiry fields are invalid.' using errcode = '22023';
  end if;

  insert into public.customers (display_name, email, phone)
  values (btrim(p_name), lower(btrim(p_email)), nullif(btrim(p_phone), ''))
  on conflict (lower(email)) where email is not null
  do update set
    display_name = excluded.display_name,
    phone = coalesce(excluded.phone, public.customers.phone),
    updated_at = pg_catalog.now()
  returning id into saved_customer_id;

  insert into public.inquiries (
    id, customer_id, type, source, name, email, phone, message, details
  ) values (
    p_id, saved_customer_id, p_type, left(coalesce(p_source, 'website'), 500),
    btrim(p_name), lower(btrim(p_email)), nullif(btrim(p_phone), ''),
    btrim(p_message), p_details
  )
  returning * into saved_inquiry;

  insert into public.inquiry_activity (inquiry_id, activity_type, content)
  values (saved_inquiry.id, 'submitted', 'Inquiry submitted through the website.');

  for attachment in select * from jsonb_array_elements(p_attachments)
  loop
    insert into public.inquiry_attachments (
      inquiry_id, storage_path, file_name, content_type, file_size_bytes
    ) values (
      saved_inquiry.id,
      attachment->>'storage_path',
      left(attachment->>'file_name', 150),
      attachment->>'content_type',
      (attachment->>'file_size_bytes')::integer
    );
  end loop;

  insert into public.inquiry_notification_outbox (inquiry_id, recipients)
  values (saved_inquiry.id, coalesce(p_recipients, '{}'));

  insert into public.audit_logs (action, entity_type, entity_id, after_data)
  values (
    'inquiry.submitted',
    'inquiry',
    saved_inquiry.id::text,
    jsonb_build_object('type', saved_inquiry.type, 'status', saved_inquiry.status)
  );

  return saved_inquiry;
end;
$$;

create or replace function public.list_admin_inquiries(
  p_actor_user_id uuid,
  p_search text default null,
  p_type text default null,
  p_status text default null,
  p_from date default null,
  p_to date default null,
  p_assignee uuid default null,
  p_sort text default 'created_at',
  p_direction text default 'desc',
  p_page integer default 1,
  p_limit integer default 25,
  p_follow_up_days integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_sort not in ('created_at', 'updated_at', 'last_activity_at', 'name', 'status')
      or p_direction not in ('asc', 'desc')
      or p_page not between 1 and 10000
      or p_limit not between 1 and 50
      or p_follow_up_days not between 1 and 365 then
    raise exception 'Inquiry list filters are invalid.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.admin_profiles ap
    join public.role_permissions rp on rp.role_key = ap.role_key
    where ap.id = p_actor_user_id
      and ap.is_active
      and rp.permission_key = 'inquiries.read'
  ) then
    raise exception 'Inquiry read permission is required.' using errcode = '42501';
  end if;

  with filtered as (
    select i.id, i.type, i.status, i.status_reason, i.name, i.email, i.phone,
      i.message, i.details, i.source, i.assignee_id, ap.display_name as assignee_name,
      i.customer_id, i.is_read, i.created_at, i.updated_at, i.last_activity_at,
      (i.last_activity_at <= pg_catalog.now() - (p_follow_up_days * interval '1 day')
        and i.status in ('new', 'contacted', 'quote_sent')) as follow_up_due
    from public.inquiries i
    left join public.admin_profiles ap on ap.id = i.assignee_id
    where (p_type is null or i.type = p_type)
      and (p_status is null or i.status = p_status)
      and (p_assignee is null or i.assignee_id = p_assignee)
      and (p_from is null or i.created_at >= p_from::timestamptz)
      and (p_to is null or i.created_at < (p_to + 1)::timestamptz)
      and (
        nullif(btrim(p_search), '') is null
        or lower(i.name) like '%' || lower(btrim(p_search)) || '%'
        or lower(i.email) like '%' || lower(btrim(p_search)) || '%'
        or coalesce(i.phone, '') like '%' || btrim(p_search) || '%'
      )
  ),
  page_rows as (
    select filtered.*,
      row_number() over (order by
        case when p_sort = 'created_at' and p_direction = 'asc' then created_at end asc,
        case when p_sort = 'created_at' and p_direction = 'desc' then created_at end desc,
        case when p_sort = 'updated_at' and p_direction = 'asc' then updated_at end asc,
        case when p_sort = 'updated_at' and p_direction = 'desc' then updated_at end desc,
        case when p_sort = 'last_activity_at' and p_direction = 'asc' then last_activity_at end asc,
        case when p_sort = 'last_activity_at' and p_direction = 'desc' then last_activity_at end desc,
        case when p_sort = 'name' and p_direction = 'asc' then lower(name) end asc,
        case when p_sort = 'name' and p_direction = 'desc' then lower(name) end desc,
        case when p_sort = 'status' and p_direction = 'asc' then status end asc,
        case when p_sort = 'status' and p_direction = 'desc' then status end desc,
        created_at desc
      ) as sort_order
    from filtered
    order by
      case when p_sort = 'created_at' and p_direction = 'asc' then created_at end asc,
      case when p_sort = 'created_at' and p_direction = 'desc' then created_at end desc,
      case when p_sort = 'updated_at' and p_direction = 'asc' then updated_at end asc,
      case when p_sort = 'updated_at' and p_direction = 'desc' then updated_at end desc,
      case when p_sort = 'last_activity_at' and p_direction = 'asc' then last_activity_at end asc,
      case when p_sort = 'last_activity_at' and p_direction = 'desc' then last_activity_at end desc,
      case when p_sort = 'name' and p_direction = 'asc' then lower(name) end asc,
      case when p_sort = 'name' and p_direction = 'desc' then lower(name) end desc,
      case when p_sort = 'status' and p_direction = 'asc' then status end asc,
      case when p_sort = 'status' and p_direction = 'desc' then status end desc,
      created_at desc
    offset (p_page - 1) * p_limit
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(page_rows) - 'sort_order' order by page_rows.sort_order)
      from page_rows
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'unread', (select count(*) from public.inquiries where not is_read)
  ) into result;

  return result;
end;
$$;

create or replace function public.update_admin_inquiry(
  p_actor_user_id uuid,
  p_inquiry_id uuid,
  p_status text default null,
  p_reason text default null,
  p_assignee_id uuid default null,
  p_assignee_set boolean default false
)
returns public.inquiries
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_inquiry public.inquiries;
  updated_inquiry public.inquiries;
  assignee_name text;
begin
  if not exists (
    select 1
    from public.admin_profiles ap
    join public.role_permissions rp on rp.role_key = ap.role_key
    where ap.id = p_actor_user_id
      and ap.is_active
      and rp.permission_key = 'inquiries.status.update'
  ) then
    raise exception 'Inquiry status permission is required.' using errcode = '42501';
  end if;
  select * into existing_inquiry
  from public.inquiries where id = p_inquiry_id for update;
  if not found then
    raise exception 'Inquiry not found.' using errcode = 'P0002';
  end if;

  if p_status is not null then
    if p_status not in ('new', 'contacted', 'quote_sent', 'confirmed', 'completed', 'lost', 'declined')
      or not (
        (existing_inquiry.status = 'new' and p_status in ('contacted', 'lost', 'declined'))
        or (existing_inquiry.status = 'contacted' and p_status in ('quote_sent', 'confirmed', 'lost', 'declined'))
        or (existing_inquiry.status = 'quote_sent' and p_status in ('contacted', 'confirmed', 'lost', 'declined'))
        or (existing_inquiry.status = 'confirmed' and p_status in ('completed', 'lost', 'declined'))
      ) then
      raise exception 'This inquiry status transition is not allowed.' using errcode = '22023';
    end if;
    if p_status in ('lost', 'declined') and nullif(btrim(p_reason), '') is null then
      raise exception 'A reason is required for lost or declined inquiries.' using errcode = '22023';
    end if;
  end if;

  if p_assignee_set then
    if not exists (
      select 1
      from public.admin_profiles ap
      join public.role_permissions rp on rp.role_key = ap.role_key
      where ap.id = p_actor_user_id
        and ap.is_active
        and rp.permission_key = 'inquiries.assign'
    ) then
      raise exception 'Inquiry assignment permission is required.' using errcode = '42501';
    end if;
  end if;
  if p_assignee_set and p_assignee_id is not null then
    select display_name into assignee_name
    from public.admin_profiles
    where id = p_assignee_id and is_active and role_key <> 'viewer';
    if not found then
      raise exception 'The selected assignee is unavailable.' using errcode = 'P0002';
    end if;
  end if;

  update public.inquiries
  set status = coalesce(p_status, status),
      status_reason = case
        when p_status in ('lost', 'declined') then btrim(p_reason)
        when p_status is not null then null
        else status_reason
      end,
      assignee_id = case when p_assignee_set then p_assignee_id else assignee_id end,
      updated_at = pg_catalog.now(),
      last_activity_at = pg_catalog.now(),
      follow_up_notified_at = null
  where id = p_inquiry_id
  returning * into updated_inquiry;

  if p_status is not null and p_status <> existing_inquiry.status then
    insert into public.inquiry_activity (inquiry_id, actor_user_id, activity_type, content, metadata)
    values (
      p_inquiry_id, p_actor_user_id, 'status_changed',
      case when p_status in ('lost', 'declined') then btrim(p_reason) else null end,
      jsonb_build_object('from', existing_inquiry.status, 'to', p_status)
    );
  end if;
  if p_assignee_set and p_assignee_id is distinct from existing_inquiry.assignee_id then
    insert into public.inquiry_activity (inquiry_id, actor_user_id, activity_type, content, metadata)
    values (
      p_inquiry_id, p_actor_user_id, 'assigned', assignee_name,
      jsonb_build_object('from', existing_inquiry.assignee_id, 'to', p_assignee_id)
    );
  end if;
  if p_status is not null and p_status <> existing_inquiry.status then
    insert into public.audit_logs (
      actor_user_id, action, entity_type, entity_id, before_data, after_data
    ) values (
      p_actor_user_id,
      'inquiry.status.changed',
      'inquiry',
      p_inquiry_id::text,
      jsonb_build_object('status', existing_inquiry.status, 'reason', existing_inquiry.status_reason),
      jsonb_build_object('status', updated_inquiry.status, 'reason', updated_inquiry.status_reason)
    );
  end if;
  if p_assignee_set and p_assignee_id is distinct from existing_inquiry.assignee_id then
    insert into public.audit_logs (
      actor_user_id, action, entity_type, entity_id, before_data, after_data
    ) values (
      p_actor_user_id,
      'inquiry.assigned',
      'inquiry',
      p_inquiry_id::text,
      jsonb_build_object('assignee_id', existing_inquiry.assignee_id),
      jsonb_build_object('assignee_id', updated_inquiry.assignee_id)
    );
  end if;
  return updated_inquiry;
end;
$$;

create or replace function public.add_admin_inquiry_note(
  p_actor_user_id uuid,
  p_inquiry_id uuid,
  p_note text
)
returns public.inquiry_activity
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_note public.inquiry_activity;
begin
  if not exists (
    select 1
    from public.admin_profiles ap
    join public.role_permissions rp on rp.role_key = ap.role_key
    where ap.id = p_actor_user_id
      and ap.is_active
      and rp.permission_key = 'inquiries.notes.write'
  ) then
    raise exception 'Inquiry note permission is required.' using errcode = '42501';
  end if;
  if p_note is null or length(btrim(p_note)) not between 1 and 2000 then
    raise exception 'Note must contain 1 to 2000 characters.' using errcode = '22023';
  end if;
  update public.inquiries
  set updated_at = pg_catalog.now(),
      last_activity_at = pg_catalog.now(),
      follow_up_notified_at = null
  where id = p_inquiry_id;
  if not found then
    raise exception 'Inquiry not found.' using errcode = 'P0002';
  end if;
  insert into public.inquiry_activity (inquiry_id, actor_user_id, activity_type, content)
  values (p_inquiry_id, p_actor_user_id, 'note', btrim(p_note))
  returning * into saved_note;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, after_data)
  values (
    p_actor_user_id,
    'inquiry.note.added',
    'inquiry',
    p_inquiry_id::text,
    jsonb_build_object('activity_id', saved_note.id)
  );
  return saved_note;
end;
$$;

create or replace function public.mark_inquiry_followup_reminder(
  p_inquiry_id uuid,
  p_follow_up_days integer default 3
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_follow_up_days not between 1 and 365 then
    raise exception 'Follow-up days must be from 1 to 365.' using errcode = '22023';
  end if;
  update public.inquiries
  set follow_up_notified_at = pg_catalog.now()
  where id = p_inquiry_id
    and follow_up_notified_at is null
    and status in ('new', 'contacted', 'quote_sent')
    and last_activity_at <= pg_catalog.now() - (p_follow_up_days * interval '1 day');
  if not found then return false; end if;
  insert into public.inquiry_activity (inquiry_id, activity_type, content)
  values (p_inquiry_id, 'follow_up_reminder', 'No inquiry activity has been recorded recently.');
  return true;
end;
$$;

revoke all on function public.submit_public_inquiry(uuid, text, text, text, text, text, jsonb, text, jsonb, text[])
  from public, anon, authenticated;
revoke all on function public.list_admin_inquiries(uuid, text, text, text, date, date, uuid, text, text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.update_admin_inquiry(uuid, uuid, text, text, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.add_admin_inquiry_note(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.mark_inquiry_followup_reminder(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.submit_public_inquiry(uuid, text, text, text, text, text, jsonb, text, jsonb, text[])
  to service_role;
grant execute on function public.list_admin_inquiries(uuid, text, text, text, date, date, uuid, text, text, integer, integer, integer)
  to service_role;
grant execute on function public.update_admin_inquiry(uuid, uuid, text, text, uuid, boolean)
  to service_role;
grant execute on function public.add_admin_inquiry_note(uuid, uuid, text)
  to service_role;
grant execute on function public.mark_inquiry_followup_reminder(uuid, integer)
  to service_role;
