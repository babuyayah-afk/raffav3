create table public.roles (
  role_key text primary key,
  name text not null unique,
  description text not null default '',
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.permissions (
  permission_key text primary key,
  description text not null
);

create table public.role_permissions (
  role_key text not null references public.roles (role_key) on delete cascade,
  permission_key text not null references public.permissions (permission_key) on delete cascade,
  primary key (role_key, permission_key)
);

create index role_permissions_permission_key
  on public.role_permissions (permission_key);

create table public.admin_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role_key text not null references public.roles (role_key),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index admin_profiles_role_key on public.admin_profiles (role_key);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at on public.audit_logs (created_at desc);
create index audit_logs_actor_created_at
  on public.audit_logs (actor_user_id, created_at desc);
create index audit_logs_entity
  on public.audit_logs (entity_type, entity_id, created_at desc);

create function public.reject_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Audit log records are append-only.';
end
$$;

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public.reject_audit_log_mutation();

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  original_name text not null,
  content_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  alt_text text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index media_assets_created_at on public.media_assets (created_at desc);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  email text,
  phone text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index customers_email_unique
  on public.customers (lower(email))
  where email is not null;

create index customers_phone on public.customers (phone) where phone is not null;

create table public.site_settings (
  setting_key text primary key,
  value_json jsonb not null,
  is_public boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.roles (role_key, name, description) values
  ('admin', 'Admin', 'Full system access, including users and settings.'),
  ('manager', 'Manager', 'Operational access, excluding administrator management.'),
  ('inquiry_staff', 'Inquiry staff', 'Works inquiries, customers, quotes, bookings, and calendar.'),
  ('catalogue_staff', 'Catalogue staff', 'Manages product catalogue, media, and showcase content.'),
  ('viewer', 'Viewer', 'Read-only dashboard and report access.');

insert into public.permissions (permission_key, description) values
  ('dashboard.read', 'View the unified dashboard.'),
  ('reports.read', 'View reports and exports.'),
  ('inquiries.read', 'View inquiries.'),
  ('inquiries.write', 'Create and update inquiry details.'),
  ('inquiries.assign', 'Assign inquiries to team members.'),
  ('inquiries.status.update', 'Move inquiries through the status pipeline.'),
  ('inquiries.notes.write', 'Add internal inquiry notes.'),
  ('quotes.read', 'View quotes.'),
  ('quotes.write', 'Create and update quotes.'),
  ('bookings.read', 'View bookings.'),
  ('bookings.write', 'Create and update bookings.'),
  ('calendar.read', 'View the operational calendar.'),
  ('calendar.write', 'Manage calendar entries.'),
  ('customers.read', 'View customer profiles.'),
  ('customers.write', 'Create and update customer profiles.'),
  ('apparel.products.read', 'View apparel products and variants.'),
  ('apparel.products.write', 'Create and update catalogue details excluding prices and stock.'),
  ('apparel.prices.write', 'Change apparel prices.'),
  ('apparel.inventory.read', 'View inventory and movement history.'),
  ('apparel.inventory.write', 'Record inventory movements and adjustments.'),
  ('apparel.orders.read', 'View apparel orders.'),
  ('apparel.orders.write', 'Manage apparel orders and fulfilment.'),
  ('apparel.returns.manage', 'Manage returns and exchanges.'),
  ('apparel.promotions.manage', 'Manage apparel promotions.'),
  ('content.read', 'View website showcase content.'),
  ('content.write', 'Create and update website showcase content.'),
  ('media.read', 'View media assets.'),
  ('media.write', 'Upload and manage media assets.'),
  ('users.read', 'View administrator accounts.'),
  ('users.manage', 'Invite, update, and deactivate administrator accounts.'),
  ('roles.manage', 'Manage role-to-permission assignments.'),
  ('settings.read', 'View business and system settings.'),
  ('settings.manage', 'Update business and system settings.'),
  ('audit.read', 'View the audit log.');

insert into public.role_permissions (role_key, permission_key)
select 'admin', permission_key
from public.permissions;

insert into public.role_permissions (role_key, permission_key)
select 'manager', permission_key
from unnest(array[
  'dashboard.read', 'reports.read',
  'inquiries.read', 'inquiries.write', 'inquiries.assign',
  'inquiries.status.update', 'inquiries.notes.write',
  'quotes.read', 'quotes.write', 'bookings.read', 'bookings.write',
  'calendar.read', 'calendar.write', 'customers.read', 'customers.write',
  'apparel.products.read', 'apparel.products.write', 'apparel.prices.write',
  'apparel.inventory.read', 'apparel.inventory.write',
  'apparel.orders.read', 'apparel.orders.write', 'apparel.returns.manage',
  'apparel.promotions.manage', 'content.read', 'content.write',
  'media.read', 'media.write', 'settings.read', 'settings.manage', 'audit.read'
]::text[]) as permissions(permission_key);

insert into public.role_permissions (role_key, permission_key)
select 'inquiry_staff', permission_key
from unnest(array[
  'dashboard.read', 'inquiries.read', 'inquiries.write', 'inquiries.assign',
  'inquiries.status.update', 'inquiries.notes.write',
  'quotes.read', 'quotes.write', 'bookings.read', 'bookings.write',
  'calendar.read', 'calendar.write', 'customers.read', 'customers.write'
]::text[]) as permissions(permission_key);

insert into public.role_permissions (role_key, permission_key)
select 'catalogue_staff', permission_key
from unnest(array[
  'dashboard.read', 'apparel.products.read', 'apparel.products.write',
  'content.read', 'content.write', 'media.read', 'media.write'
]::text[]) as permissions(permission_key);

insert into public.role_permissions (role_key, permission_key)
select 'viewer', permission_key
from unnest(array['dashboard.read', 'reports.read']::text[]) as permissions(permission_key);

create function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles as profile
    where profile.id = (select auth.uid())
      and profile.is_active
  )
$$;

create function public.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles as profile
    join public.role_permissions as role_permission
      on role_permission.role_key = profile.role_key
    where profile.id = (select auth.uid())
      and profile.is_active
      and role_permission.permission_key = required_permission
  )
$$;

revoke all on function public.is_active_admin() from public;
revoke all on function public.has_permission(text) from public;
grant execute on function public.is_active_admin() to authenticated;
grant execute on function public.has_permission(text) to authenticated;

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.media_assets enable row level security;
alter table public.customers enable row level security;
alter table public.site_settings enable row level security;

alter default privileges in schema public
  revoke all on tables from anon, authenticated;

revoke all on public.roles, public.permissions, public.role_permissions,
  public.admin_profiles, public.audit_logs, public.media_assets,
  public.customers, public.site_settings
  from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.roles, public.permissions, public.role_permissions,
  public.admin_profiles, public.media_assets, public.customers, public.audit_logs
  to authenticated;
grant select on public.site_settings to anon, authenticated;

create policy "Active admins can read role definitions"
  on public.roles for select to authenticated
  using (public.is_active_admin());

create policy "Active admins can read permissions"
  on public.permissions for select to authenticated
  using (public.is_active_admin());

create policy "Active admins can read role assignments"
  on public.role_permissions for select to authenticated
  using (public.is_active_admin());

create policy "Admins can read their own profile or users with permission"
  on public.admin_profiles for select to authenticated
  using (
    (id = (select auth.uid()) and is_active)
    or public.has_permission('users.read')
  );

create policy "Admins with audit permission can read audit logs"
  on public.audit_logs for select to authenticated
  using (public.has_permission('audit.read'));

create policy "Admins with media permission can read media metadata"
  on public.media_assets for select to authenticated
  using (public.has_permission('media.read'));

create policy "Admins with customer permission can read customers"
  on public.customers for select to authenticated
  using (public.has_permission('customers.read'));

create policy "Public can read explicitly public settings"
  on public.site_settings for select to anon, authenticated
  using (is_public);

create policy "Admins with settings permission can read settings"
  on public.site_settings for select to authenticated
  using (public.has_permission('settings.read'));
