create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number bigint generated always as identity unique,
  customer_id uuid not null references public.customers (id),
  inquiry_id uuid references public.inquiries (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  currency text not null default 'KES' check (currency = 'KES'),
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),
  valid_until date,
  notes text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index quotes_customer_created_at on public.quotes (customer_id, created_at desc);
create index quotes_status_created_at on public.quotes (status, created_at desc);
create index quotes_inquiry_id on public.quotes (inquiry_id);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  position integer not null check (position >= 0),
  description text not null check (length(btrim(description)) between 1 and 300),
  quantity integer not null check (quantity between 1 and 10000),
  unit_price_minor bigint not null check (unit_price_minor between 0 and 100000000),
  line_total_minor bigint not null check (line_total_minor >= 0),
  created_at timestamptz not null default now(),
  unique (quote_id, position)
);

create index quote_items_quote_position on public.quote_items (quote_id, position);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id),
  source_inquiry_id uuid references public.inquiries (id) on delete set null,
  service_type text not null check (service_type in ('events', 'desserts')),
  booking_date date not null,
  start_time time,
  end_time time,
  venue_address text not null default '',
  package_name text not null default '',
  agreed_price_minor bigint not null check (agreed_price_minor between 0 and 1000000000000),
  currency text not null default 'KES' check (currency = 'KES'),
  status text not null default 'confirmed'
    check (status in ('scheduled', 'confirmed', 'completed', 'cancelled')),
  notes text not null default '',
  inquiry_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(inquiry_snapshot) = 'object'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time is null or end_time is null or end_time > start_time)
);

create index bookings_date_status on public.bookings (booking_date, status);
create index bookings_customer_date on public.bookings (customer_id, booking_date desc);
create index bookings_service_date on public.bookings (service_type, booking_date, status);
create index bookings_source_inquiry on public.bookings (source_inquiry_id);

create table public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  payment_type text not null check (payment_type in ('deposit', 'balance', 'other')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'KES' check (currency = 'KES'),
  method text not null check (method in ('cash', 'mobile_money', 'bank_transfer', 'card', 'other')),
  reference text not null default '',
  received_at timestamptz not null default now(),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index booking_payments_booking_received
  on public.booking_payments (booking_id, received_at desc);

create function public.stage4_actor_has_permission(p_actor_user_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles profile
    join public.role_permissions role_permission on role_permission.role_key = profile.role_key
    where profile.id = p_actor_user_id
      and profile.is_active
      and role_permission.permission_key = p_permission
  )
$$;

create function public.save_admin_customer(
  p_actor_user_id uuid,
  p_customer_id uuid,
  p_display_name text,
  p_email text,
  p_phone text,
  p_notes text,
  p_request_id text default null
)
returns public.customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_customer public.customers;
  saved_customer public.customers;
begin
  if not public.stage4_actor_has_permission(p_actor_user_id, 'customers.write') then
    raise exception 'Customer write permission is required.' using errcode = '42501';
  end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 2 and 100
      or coalesce(length(p_email), 0) > 254
      or coalesce(length(p_phone), 0) > 30
      or coalesce(length(p_notes), 0) > 5000 then
    raise exception 'Customer fields are invalid.' using errcode = '22023';
  end if;

  if p_customer_id is not null then
    select * into existing_customer
    from public.customers
    where id = p_customer_id and archived_at is null
    for update;
    if not found then
      raise exception 'Customer not found.' using errcode = 'P0002';
    end if;
    update public.customers
    set display_name = btrim(p_display_name),
        email = nullif(lower(btrim(coalesce(p_email, ''))), ''),
        phone = nullif(btrim(coalesce(p_phone, '')), ''),
        notes = btrim(coalesce(p_notes, '')),
        updated_at = pg_catalog.now()
    where id = p_customer_id
    returning * into saved_customer;
  else
    insert into public.customers (display_name, email, phone, notes)
    values (
      btrim(p_display_name),
      nullif(lower(btrim(coalesce(p_email, ''))), ''),
      nullif(btrim(coalesce(p_phone, '')), ''),
      btrim(coalesce(p_notes, ''))
    )
    returning * into saved_customer;
  end if;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id
  ) values (
    p_actor_user_id,
    case when p_customer_id is null then 'customer.created' else 'customer.updated' end,
    'customer',
    saved_customer.id::text,
    case when p_customer_id is null then null else to_jsonb(existing_customer) end,
    to_jsonb(saved_customer),
    p_request_id
  );
  return saved_customer;
end
$$;

create function public.save_admin_quote(
  p_actor_user_id uuid,
  p_quote_id uuid,
  p_customer_id uuid,
  p_inquiry_id uuid,
  p_valid_until date,
  p_notes text,
  p_items jsonb,
  p_request_id text default null
)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_quote public.quotes;
  saved_quote public.quotes;
  item jsonb;
  item_index integer := 0;
  item_quantity integer;
  unit_price bigint;
  line_total bigint;
  subtotal bigint := 0;
  before_items jsonb := '[]'::jsonb;
  after_items jsonb := '[]'::jsonb;
begin
  if not public.stage4_actor_has_permission(p_actor_user_id, 'quotes.write') then
    raise exception 'Quote write permission is required.' using errcode = '42501';
  end if;
  if p_customer_id is null or p_items is null or jsonb_typeof(p_items) <> 'array'
      or jsonb_array_length(p_items) not between 1 and 50
      or coalesce(length(p_notes), 0) > 5000 then
    raise exception 'Quote fields are invalid.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.customers where id = p_customer_id and archived_at is null
  ) then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;
  if p_inquiry_id is not null and not exists (
    select 1 from public.inquiries
    where id = p_inquiry_id and customer_id = p_customer_id
  ) then
    raise exception 'Inquiry does not belong to this customer.' using errcode = '22023';
  end if;

  if p_quote_id is not null then
    select * into existing_quote
    from public.quotes
    where id = p_quote_id and archived_at is null
    for update;
    if not found then
      raise exception 'Quote not found.' using errcode = 'P0002';
    end if;
    if existing_quote.status <> 'draft' then
      raise exception 'Only draft quotes can be edited.' using errcode = '22023';
    end if;
    if existing_quote.customer_id <> p_customer_id then
      raise exception 'A quote customer cannot be changed.' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(to_jsonb(quote_item) order by position), '[]'::jsonb)
      into before_items
    from public.quote_items quote_item
    where quote_item.quote_id = p_quote_id;
  end if;

  for item in select value from jsonb_array_elements(p_items) as entries(value) loop
    if jsonb_typeof(item) <> 'object'
        or coalesce(length(btrim(item->>'description')), 0) not between 1 and 300
        or coalesce(item->>'quantity', '') !~ '^[0-9]{1,5}$'
        or coalesce(item->>'unitPriceMinor', '') !~ '^[0-9]{1,9}$' then
      raise exception 'Quote line item % is invalid.', item_index + 1 using errcode = '22023';
    end if;
    item_quantity := (item->>'quantity')::integer;
    unit_price := (item->>'unitPriceMinor')::bigint;
    if item_quantity not between 1 and 10000 or unit_price > 100000000 then
      raise exception 'Quote line item % exceeds the allowed amount.', item_index + 1 using errcode = '22023';
    end if;
    line_total := item_quantity::bigint * unit_price;
    if subtotal > 1000000000000 - line_total then
      raise exception 'Quote total exceeds the allowed amount.' using errcode = '22023';
    end if;
    subtotal := subtotal + line_total;
    item_index := item_index + 1;
  end loop;

  if p_quote_id is null then
    insert into public.quotes (
      customer_id, inquiry_id, subtotal_minor, total_minor, valid_until, notes, created_by
    ) values (
      p_customer_id, p_inquiry_id, subtotal, subtotal, p_valid_until,
      btrim(coalesce(p_notes, '')), p_actor_user_id
    )
    returning * into saved_quote;
  else
    update public.quotes
    set inquiry_id = p_inquiry_id,
        subtotal_minor = subtotal,
        total_minor = subtotal,
        valid_until = p_valid_until,
        notes = btrim(coalesce(p_notes, '')),
        updated_at = pg_catalog.now()
    where id = p_quote_id
    returning * into saved_quote;
    delete from public.quote_items where quote_id = p_quote_id;
  end if;

  item_index := 0;
  for item in select value from jsonb_array_elements(p_items) as entries(value) loop
    item_quantity := (item->>'quantity')::integer;
    unit_price := (item->>'unitPriceMinor')::bigint;
    line_total := item_quantity::bigint * unit_price;
    insert into public.quote_items (
      quote_id, position, description, quantity, unit_price_minor, line_total_minor
    ) values (
      saved_quote.id, item_index, btrim(item->>'description'),
      item_quantity, unit_price, line_total
    );
    item_index := item_index + 1;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(quote_item) order by position), '[]'::jsonb)
    into after_items
  from public.quote_items quote_item
  where quote_item.quote_id = saved_quote.id;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id
  ) values (
    p_actor_user_id,
    case when p_quote_id is null then 'quote.created' else 'quote.updated' end,
    'quote',
    saved_quote.id::text,
    case when p_quote_id is null then null
      else to_jsonb(existing_quote) || jsonb_build_object('items', before_items) end,
    to_jsonb(saved_quote) || jsonb_build_object('items', after_items),
    p_request_id
  );
  return saved_quote;
end
$$;

create function public.set_admin_quote_status(
  p_actor_user_id uuid,
  p_quote_id uuid,
  p_status text,
  p_request_id text default null
)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_quote public.quotes;
  saved_quote public.quotes;
begin
  if not public.stage4_actor_has_permission(p_actor_user_id, 'quotes.write') then
    raise exception 'Quote write permission is required.' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'accepted', 'declined', 'expired') then
    raise exception 'Quote status is invalid.' using errcode = '22023';
  end if;
  select * into existing_quote
  from public.quotes
  where id = p_quote_id and archived_at is null
  for update;
  if not found then
    raise exception 'Quote not found.' using errcode = 'P0002';
  end if;
  if not (
    (existing_quote.status = 'draft' and p_status = 'sent')
    or (existing_quote.status = 'sent' and p_status in ('accepted', 'declined', 'expired'))
  ) then
    raise exception 'Quote status transition is not allowed.' using errcode = '22023';
  end if;
  if p_status = 'sent' and existing_quote.valid_until < current_date then
    raise exception 'An expired quote cannot be sent.' using errcode = '22023';
  end if;

  update public.quotes
  set status = p_status, updated_at = pg_catalog.now()
  where id = p_quote_id
  returning * into saved_quote;

  if p_status = 'sent' and existing_quote.inquiry_id is not null then
    update public.inquiries
    set status = 'quote_sent', status_reason = null,
        updated_at = pg_catalog.now(), last_activity_at = pg_catalog.now(),
        follow_up_notified_at = null
    where id = existing_quote.inquiry_id
      and status in ('new', 'contacted');
    if found then
      insert into public.inquiry_activity (
        inquiry_id, actor_user_id, activity_type, content, metadata
      ) values (
        existing_quote.inquiry_id, p_actor_user_id, 'status_changed',
        'Quote sent', jsonb_build_object('to', 'quote_sent', 'quote_id', p_quote_id)
      );
    end if;
  end if;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id
  ) values (
    p_actor_user_id, 'quote.status_changed', 'quote', p_quote_id::text,
    to_jsonb(existing_quote), to_jsonb(saved_quote), p_request_id
  );
  return saved_quote;
end
$$;

create function public.admin_booking_conflicts(
  p_service_type text,
  p_booking_date date,
  p_start_time time,
  p_end_time time,
  p_exclude_booking_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  event_conflicts jsonb;
  dessert_capacity integer;
  dessert_bookings integer;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', booking.id,
    'packageName', booking.package_name,
    'startTime', booking.start_time,
    'endTime', booking.end_time
  ) order by booking.start_time nulls first), '[]'::jsonb)
  into event_conflicts
  from public.bookings booking
  where p_service_type = 'events'
    and booking.service_type = 'events'
    and booking.booking_date = p_booking_date
    and booking.status in ('scheduled', 'confirmed')
    and booking.id is distinct from p_exclude_booking_id
    and (
      p_start_time is null or p_end_time is null
      or booking.start_time is null or booking.end_time is null
      or (booking.start_time < p_end_time and booking.end_time > p_start_time)
    );

  select nullif(setting.value_json->>'limit', '')::integer
  into dessert_capacity
  from public.site_settings setting
  where setting.setting_key = 'dessert_daily_capacity';

  select count(*)::integer into dessert_bookings
  from public.bookings booking
  where p_service_type = 'desserts'
    and booking.service_type = 'desserts'
    and booking.booking_date = p_booking_date
    and booking.status in ('scheduled', 'confirmed')
    and booking.id is distinct from p_exclude_booking_id;

  return jsonb_build_object(
    'eventConflicts', event_conflicts,
    'dessertCapacity', dessert_capacity,
    'dessertBookings', dessert_bookings,
    'capacityExceeded', p_service_type = 'desserts'
      and dessert_capacity is not null
      and dessert_bookings >= dessert_capacity
  );
end
$$;

create function public.create_admin_booking(
  p_actor_user_id uuid,
  p_customer_id uuid,
  p_inquiry_id uuid,
  p_service_type text,
  p_booking_date date,
  p_start_time time,
  p_end_time time,
  p_venue_address text,
  p_package_name text,
  p_agreed_price_minor bigint,
  p_status text,
  p_notes text,
  p_override_reason text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_inquiry public.inquiries;
  saved_booking public.bookings;
  conflicts jsonb;
  inquiry_snapshot jsonb := '{}'::jsonb;
  effective_customer_id uuid := p_customer_id;
  effective_service_type text := p_service_type;
  effective_venue text := btrim(coalesce(p_venue_address, ''));
  effective_package text := btrim(coalesce(p_package_name, ''));
begin
  if not public.stage4_actor_has_permission(p_actor_user_id, 'bookings.write') then
    raise exception 'Booking write permission is required.' using errcode = '42501';
  end if;
  if p_booking_date is null
      or p_agreed_price_minor is null or p_agreed_price_minor not between 0 and 1000000000000
      or p_status not in ('scheduled', 'confirmed', 'completed', 'cancelled')
      or coalesce(length(p_venue_address), 0) > 500
      or coalesce(length(p_package_name), 0) > 160
      or coalesce(length(p_notes), 0) > 5000
      or (p_start_time is not null and p_end_time is not null and p_end_time <= p_start_time) then
    raise exception 'Booking fields are invalid.' using errcode = '22023';
  end if;
  if p_override_reason is not null and length(btrim(p_override_reason)) not between 1 and 500 then
    raise exception 'Conflict override reason must contain 1 to 500 characters.' using errcode = '22023';
  end if;

  if p_inquiry_id is not null then
    select * into source_inquiry
    from public.inquiries
    where id = p_inquiry_id
    for update;
    if not found then
      raise exception 'Inquiry not found.' using errcode = 'P0002';
    end if;
    if source_inquiry.type not in ('events', 'desserts')
        or source_inquiry.status in ('lost', 'declined') then
      raise exception 'This inquiry cannot be converted to a booking.' using errcode = '22023';
    end if;
    effective_customer_id := source_inquiry.customer_id;
    effective_service_type := source_inquiry.type;
    inquiry_snapshot := jsonb_build_object(
      'id', source_inquiry.id,
      'name', source_inquiry.name,
      'email', source_inquiry.email,
      'phone', source_inquiry.phone,
      'message', source_inquiry.message,
      'details', source_inquiry.details,
      'type', source_inquiry.type
    );
    if effective_venue = '' then
      effective_venue := coalesce(
        source_inquiry.details->>'eventLocation',
        source_inquiry.details->>'dessertLocation',
        ''
      );
    end if;
    if effective_package = '' then
      effective_package := coalesce(
        source_inquiry.details->>'eventType',
        source_inquiry.details->>'dessertType',
        ''
      );
    end if;
  end if;

  if effective_service_type not in ('events', 'desserts')
      or effective_customer_id is null
      or not exists (
        select 1 from public.customers
        where id = effective_customer_id and archived_at is null
      ) then
    raise exception 'A valid customer and service type are required.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(effective_service_type),
    pg_catalog.hashtext(p_booking_date::text)
  );
  conflicts := public.admin_booking_conflicts(
    effective_service_type, p_booking_date, p_start_time, p_end_time, null
  );
  if (
    jsonb_array_length(conflicts->'eventConflicts') > 0
    or (conflicts->>'capacityExceeded')::boolean
  ) and nullif(btrim(coalesce(p_override_reason, '')), '') is null then
    return jsonb_build_object(
      'requiresOverride', true,
      'conflicts', conflicts
    );
  end if;

  insert into public.bookings (
    customer_id, source_inquiry_id, service_type, booking_date, start_time, end_time,
    venue_address, package_name, agreed_price_minor, status, notes, inquiry_snapshot, created_by
  ) values (
    effective_customer_id, p_inquiry_id, effective_service_type, p_booking_date,
    p_start_time, p_end_time, effective_venue, effective_package,
    p_agreed_price_minor, p_status, btrim(coalesce(p_notes, '')),
    inquiry_snapshot, p_actor_user_id
  ) returning * into saved_booking;

  if p_inquiry_id is not null and source_inquiry.status <> 'confirmed' then
    update public.inquiries
    set status = 'confirmed', status_reason = null,
        updated_at = pg_catalog.now(), last_activity_at = pg_catalog.now(),
        follow_up_notified_at = null
    where id = p_inquiry_id;
    insert into public.inquiry_activity (
      inquiry_id, actor_user_id, activity_type, content, metadata
    ) values (
      p_inquiry_id, p_actor_user_id, 'status_changed', 'Converted to booking',
      jsonb_build_object('to', 'confirmed', 'booking_id', saved_booking.id)
    );
  end if;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id
  ) values (
    p_actor_user_id,
    case when p_override_reason is null then 'booking.created' else 'booking.conflict_overridden' end,
    'booking',
    saved_booking.id::text,
    case when p_inquiry_id is null then null else inquiry_snapshot end,
    to_jsonb(saved_booking) || jsonb_build_object('override_reason', nullif(btrim(p_override_reason), '')),
    p_request_id
  );
  return jsonb_build_object('requiresOverride', false, 'booking', to_jsonb(saved_booking));
end
$$;

create function public.update_admin_booking(
  p_actor_user_id uuid,
  p_booking_id uuid,
  p_booking_date date,
  p_start_time time,
  p_end_time time,
  p_venue_address text,
  p_package_name text,
  p_agreed_price_minor bigint,
  p_status text,
  p_notes text,
  p_override_reason text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_booking public.bookings;
  saved_booking public.bookings;
  conflicts jsonb;
begin
  if not public.stage4_actor_has_permission(p_actor_user_id, 'bookings.write') then
    raise exception 'Booking write permission is required.' using errcode = '42501';
  end if;
  if p_booking_date is null
      or p_agreed_price_minor is null or p_agreed_price_minor not between 0 and 1000000000000
      or p_status not in ('scheduled', 'confirmed', 'completed', 'cancelled')
      or coalesce(length(p_venue_address), 0) > 500
      or coalesce(length(p_package_name), 0) > 160
      or coalesce(length(p_notes), 0) > 5000
      or (p_start_time is not null and p_end_time is not null and p_end_time <= p_start_time) then
    raise exception 'Booking fields are invalid.' using errcode = '22023';
  end if;
  if p_override_reason is not null and length(btrim(p_override_reason)) not between 1 and 500 then
    raise exception 'Conflict override reason must contain 1 to 500 characters.' using errcode = '22023';
  end if;
  select * into existing_booking
  from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(existing_booking.service_type),
    pg_catalog.hashtext(p_booking_date::text)
  );
  conflicts := public.admin_booking_conflicts(
    existing_booking.service_type, p_booking_date, p_start_time, p_end_time, p_booking_id
  );
  if (
    jsonb_array_length(conflicts->'eventConflicts') > 0
    or (conflicts->>'capacityExceeded')::boolean
  ) and nullif(btrim(coalesce(p_override_reason, '')), '') is null then
    return jsonb_build_object('requiresOverride', true, 'conflicts', conflicts);
  end if;

  update public.bookings
  set booking_date = p_booking_date,
      start_time = p_start_time,
      end_time = p_end_time,
      venue_address = btrim(coalesce(p_venue_address, '')),
      package_name = btrim(coalesce(p_package_name, '')),
      agreed_price_minor = p_agreed_price_minor,
      status = p_status,
      notes = btrim(coalesce(p_notes, '')),
      updated_at = pg_catalog.now()
  where id = p_booking_id
  returning * into saved_booking;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id
  ) values (
    p_actor_user_id,
    case when p_override_reason is null then 'booking.updated' else 'booking.conflict_overridden' end,
    'booking',
    p_booking_id::text,
    to_jsonb(existing_booking),
    to_jsonb(saved_booking) || jsonb_build_object('override_reason', nullif(btrim(p_override_reason), '')),
    p_request_id
  );
  return jsonb_build_object('requiresOverride', false, 'booking', to_jsonb(saved_booking));
end
$$;

create function public.record_admin_booking_payment(
  p_actor_user_id uuid,
  p_booking_id uuid,
  p_payment_type text,
  p_amount_minor bigint,
  p_method text,
  p_reference text,
  p_received_at timestamptz,
  p_request_id text default null
)
returns public.booking_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_booking public.bookings;
  paid_so_far bigint;
  saved_payment public.booking_payments;
begin
  if not public.stage4_actor_has_permission(p_actor_user_id, 'bookings.write') then
    raise exception 'Booking write permission is required.' using errcode = '42501';
  end if;
  if p_payment_type not in ('deposit', 'balance', 'other')
      or p_amount_minor is null or p_amount_minor not between 1 and 1000000000000
      or p_method not in ('cash', 'mobile_money', 'bank_transfer', 'card', 'other')
      or coalesce(length(p_reference), 0) > 160 then
    raise exception 'Payment fields are invalid.' using errcode = '22023';
  end if;
  select * into current_booking
  from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  if current_booking.status = 'cancelled' then
    raise exception 'Payments cannot be recorded on a cancelled booking.' using errcode = '22023';
  end if;
  select coalesce(sum(amount_minor), 0) into paid_so_far
  from public.booking_payments where booking_id = p_booking_id;
  if p_amount_minor > current_booking.agreed_price_minor - paid_so_far then
    raise exception 'Payment exceeds the outstanding balance.' using errcode = '22023';
  end if;

  insert into public.booking_payments (
    booking_id, payment_type, amount_minor, method, reference, received_at, recorded_by
  ) values (
    p_booking_id, p_payment_type, p_amount_minor, p_method,
    btrim(coalesce(p_reference, '')), coalesce(p_received_at, pg_catalog.now()), p_actor_user_id
  ) returning * into saved_payment;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, after_data, request_id
  ) values (
    p_actor_user_id, 'booking.payment_recorded', 'booking', p_booking_id::text,
    to_jsonb(saved_payment), p_request_id
  );
  return saved_payment;
end
$$;

create function public.set_dessert_daily_capacity(
  p_actor_user_id uuid,
  p_limit integer,
  p_request_id text default null
)
returns public.site_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_setting public.site_settings;
  saved_setting public.site_settings;
begin
  if not public.stage4_actor_has_permission(p_actor_user_id, 'settings.manage') then
    raise exception 'Settings management permission is required.' using errcode = '42501';
  end if;
  if p_limit is not null and p_limit not between 1 and 1000 then
    raise exception 'Dessert capacity must be between 1 and 1000, or empty for unlimited.' using errcode = '22023';
  end if;
  select * into previous_setting
  from public.site_settings
  where setting_key = 'dessert_daily_capacity'
  for update;
  insert into public.site_settings (setting_key, value_json, is_public, updated_by, updated_at)
  values (
    'dessert_daily_capacity',
    jsonb_build_object('limit', p_limit),
    false,
    p_actor_user_id,
    pg_catalog.now()
  )
  on conflict (setting_key) do update
  set value_json = excluded.value_json,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  returning * into saved_setting;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id
  ) values (
    p_actor_user_id, 'booking.capacity_updated', 'site_setting',
    saved_setting.setting_key,
    case when previous_setting.setting_key is null then null else to_jsonb(previous_setting) end,
    to_jsonb(saved_setting),
    p_request_id
  );
  return saved_setting;
end
$$;

create function public.get_admin_operations_summary(p_actor_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.stage4_actor_has_permission(p_actor_user_id, 'dashboard.read') then
    raise exception 'Dashboard read permission is required.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'newInquiries', (
      select count(*) from public.inquiries where status = 'new'
    ),
    'quotesAwaitingReply', (
      select count(*) from public.quotes where status = 'sent' and archived_at is null
    ),
    'upcomingBookings', (
      select count(*) from public.bookings
      where booking_date >= current_date
        and booking_date < current_date + 30
        and status in ('scheduled', 'confirmed')
    ),
    'balancesDueMinor', (
      select coalesce(sum(greatest(booking.agreed_price_minor - coalesce(paid.total_paid, 0), 0)), 0)
      from public.bookings booking
      left join (
        select booking_id, sum(amount_minor) as total_paid
        from public.booking_payments
        group by booking_id
      ) paid on paid.booking_id = booking.id
      where booking.status in ('scheduled', 'confirmed')
    )
  );
end
$$;

create function public.reject_booking_payment_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Booking payment records are append-only.';
end
$$;

create trigger booking_payments_append_only
  before update or delete on public.booking_payments
  for each row execute function public.reject_booking_payment_mutation();

insert into public.site_settings (setting_key, value_json, is_public)
values ('dessert_daily_capacity', '{"limit": null}'::jsonb, false)
on conflict (setting_key) do nothing;

alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_payments enable row level security;

revoke all on public.quotes, public.quote_items, public.bookings, public.booking_payments
  from anon, authenticated;
grant select on public.quotes, public.quote_items, public.bookings, public.booking_payments
  to authenticated;

create policy "Admins with quote permission can read quotes"
  on public.quotes for select to authenticated
  using (public.has_permission('quotes.read'));

create policy "Admins with quote permission can read quote items"
  on public.quote_items for select to authenticated
  using (
    exists (
      select 1 from public.quotes quote
      where quote.id = quote_items.quote_id
        and public.has_permission('quotes.read')
    )
  );

create policy "Admins with booking or calendar permission can read bookings"
  on public.bookings for select to authenticated
  using (
    public.has_permission('bookings.read')
    or public.has_permission('calendar.read')
  );

create policy "Admins with booking permission can read booking payments"
  on public.booking_payments for select to authenticated
  using (public.has_permission('bookings.read'));

revoke all on function public.stage4_actor_has_permission(uuid, text)
  from public, anon, authenticated;
revoke all on function public.save_admin_customer(uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.save_admin_quote(uuid, uuid, uuid, uuid, date, text, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.set_admin_quote_status(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_booking_conflicts(text, date, time, time, uuid)
  from public, anon, authenticated;
revoke all on function public.create_admin_booking(uuid, uuid, uuid, text, date, time, time, text, text, bigint, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.update_admin_booking(uuid, uuid, date, time, time, text, text, bigint, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.record_admin_booking_payment(uuid, uuid, text, bigint, text, text, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.set_dessert_daily_capacity(uuid, integer, text)
  from public, anon, authenticated;
revoke all on function public.get_admin_operations_summary(uuid)
  from public, anon, authenticated;

grant execute on function public.save_admin_customer(uuid, uuid, text, text, text, text, text)
  to service_role;
grant execute on function public.save_admin_quote(uuid, uuid, uuid, uuid, date, text, jsonb, text)
  to service_role;
grant execute on function public.set_admin_quote_status(uuid, uuid, text, text)
  to service_role;
grant execute on function public.create_admin_booking(uuid, uuid, uuid, text, date, time, time, text, text, bigint, text, text, text, text)
  to service_role;
grant execute on function public.update_admin_booking(uuid, uuid, date, time, time, text, text, bigint, text, text, text, text)
  to service_role;
grant execute on function public.record_admin_booking_payment(uuid, uuid, text, bigint, text, text, timestamptz, text)
  to service_role;
grant execute on function public.set_dessert_daily_capacity(uuid, integer, text)
  to service_role;
grant execute on function public.get_admin_operations_summary(uuid)
  to service_role;
