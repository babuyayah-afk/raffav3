create table public.order_requests (
  id text primary key,
  created_at timestamptz not null default now(),
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  preferred_date text,
  notes text,
  items_json jsonb not null,
  total integer not null check (total >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'preparing', 'ready', 'completed', 'cancelled'))
);

create index order_requests_created_at
  on public.order_requests (created_at desc);
create index order_requests_status_created_at
  on public.order_requests (status, created_at desc);

create table public.celebration_requests (
  id text primary key,
  request_id text not null unique,
  created_at timestamptz not null default now(),
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  occasion text not null,
  event_date text,
  event_location text not null default '',
  guest_count integer check (guest_count is null or guest_count >= 0),
  budget text not null default '',
  notes text not null default '',
  selections_json jsonb not null,
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'responded', 'closed'))
);

create index celebration_requests_created_at
  on public.celebration_requests (created_at desc);
create index celebration_requests_status_created_at
  on public.celebration_requests (status, created_at desc);

create table public.contact_inquiries (
  id text primary key,
  created_at timestamptz not null default now(),
  topic text not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  details_json jsonb not null,
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'responded', 'closed'))
);

create index contact_inquiries_created_at
  on public.contact_inquiries (created_at desc);
create index contact_inquiries_status_created_at
  on public.contact_inquiries (status, created_at desc);

create table public.testimonials (
  id text primary key,
  created_at timestamptz not null default now(),
  customer_name text not null,
  quote text not null,
  event_detail text not null default '',
  consent_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references public.admin_profiles (id) on delete set null
);

create index testimonials_status_created_at
  on public.testimonials (status, created_at desc);
create index testimonials_created_at
  on public.testimonials (created_at desc);

create table public.site_content (
  content_key text primary key,
  value_json jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.newsletter_subscriptions (
  id text primary key,
  created_at timestamptz not null default now(),
  email text not null unique,
  status text not null default 'active'
    check (status in ('active', 'unsubscribed'))
);

create index newsletter_subscriptions_created_at
  on public.newsletter_subscriptions (created_at desc);
create index newsletter_subscriptions_status_created_at
  on public.newsletter_subscriptions (status, created_at desc);

alter table public.order_requests enable row level security;
alter table public.celebration_requests enable row level security;
alter table public.contact_inquiries enable row level security;
alter table public.testimonials enable row level security;
alter table public.site_content enable row level security;
alter table public.newsletter_subscriptions enable row level security;

revoke all on public.order_requests, public.celebration_requests,
  public.contact_inquiries, public.testimonials, public.site_content,
  public.newsletter_subscriptions
  from anon, authenticated;

grant select, insert, update, delete on public.order_requests,
  public.celebration_requests, public.contact_inquiries, public.testimonials,
  public.site_content, public.newsletter_subscriptions
  to service_role;
