create or replace function public.create_admin_profile_with_audit(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_role_key text,
  p_request_id text default null
)
returns public.admin_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_profile public.admin_profiles;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rafa.admin_profiles', 0)
  );

  if not exists (
    select 1
    from public.admin_profiles
    where id = p_actor_user_id
      and is_active
      and role_key = 'admin'
  ) then
    raise exception 'Only an active admin can manage administrator profiles.'
      using errcode = '42501';
  end if;

  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 120 then
    raise exception 'Display name must contain 1 to 120 characters.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.roles where role_key = p_role_key) then
    raise exception 'The selected administrator role does not exist.'
      using errcode = '23503';
  end if;

  insert into public.admin_profiles (id, display_name, role_key)
  values (p_user_id, btrim(p_display_name), p_role_key)
  returning * into created_profile;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, after_data, request_id
  ) values (
    p_actor_user_id,
    'admin.profile.invited',
    'admin_profile',
    created_profile.id::text,
    to_jsonb(created_profile),
    p_request_id
  );

  return created_profile;
end;
$$;

create or replace function public.update_admin_profile_with_audit(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_display_name text default null,
  p_role_key text default null,
  p_is_active boolean default null,
  p_request_id text default null
)
returns public.admin_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_profile public.admin_profiles;
  updated_profile public.admin_profiles;
  next_role_key text;
  next_is_active boolean;
  active_admin_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rafa.admin_profiles', 0)
  );

  if not exists (
    select 1
    from public.admin_profiles
    where id = p_actor_user_id
      and is_active
      and role_key = 'admin'
  ) then
    raise exception 'Only an active admin can manage administrator profiles.'
      using errcode = '42501';
  end if;

  select *
  into existing_profile
  from public.admin_profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Administrator profile not found.'
      using errcode = 'P0002';
  end if;

  if p_display_name is not null and
      length(btrim(p_display_name)) not between 1 and 120 then
    raise exception 'Display name must contain 1 to 120 characters.'
      using errcode = '22023';
  end if;

  if p_role_key is not null and
      not exists (select 1 from public.roles where role_key = p_role_key) then
    raise exception 'The selected administrator role does not exist.'
      using errcode = '23503';
  end if;

  next_role_key := coalesce(p_role_key, existing_profile.role_key);
  next_is_active := coalesce(p_is_active, existing_profile.is_active);

  if p_user_id = p_actor_user_id and
      (next_role_key <> 'admin' or not next_is_active) then
    raise exception 'An admin cannot remove their own active admin access.'
      using errcode = '42501';
  end if;

  if existing_profile.role_key = 'admin'
      and existing_profile.is_active
      and (next_role_key <> 'admin' or not next_is_active) then
    select count(*)::integer
    into active_admin_count
    from public.admin_profiles
    where role_key = 'admin'
      and is_active;

    if active_admin_count <= 1 then
      raise exception 'The last active admin cannot be demoted or deactivated.'
        using errcode = '23514';
    end if;
  end if;

  update public.admin_profiles
  set display_name = coalesce(btrim(p_display_name), existing_profile.display_name),
      role_key = next_role_key,
      is_active = next_is_active,
      updated_at = pg_catalog.now()
  where id = p_user_id
  returning * into updated_profile;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id
  ) values (
    p_actor_user_id,
    'admin.profile.updated',
    'admin_profile',
    updated_profile.id::text,
    to_jsonb(existing_profile),
    to_jsonb(updated_profile),
    p_request_id
  );

  return updated_profile;
end;
$$;

revoke all on function public.create_admin_profile_with_audit(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.update_admin_profile_with_audit(uuid, uuid, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.create_admin_profile_with_audit(uuid, uuid, text, text, text)
  to service_role;
grant execute on function public.update_admin_profile_with_audit(uuid, uuid, text, text, boolean, text)
  to service_role;
