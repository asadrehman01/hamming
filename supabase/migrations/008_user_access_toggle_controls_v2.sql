create table if not exists public.app_user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_allowed boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.app_user_access enable row level security;

drop function if exists public.list_account_users();
create function public.list_account_users()
returns table (
  id uuid,
  login_email text,
  gym_name text,
  created_at timestamptz,
  access_allowed boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.id,
    u.email::text as login_email,
    coalesce(nullif(bs.gym_display_name, ''), g.name, 'MY GYM')::text as gym_name,
    u.created_at,
    coalesce(aua.is_allowed, true) as access_allowed
  from auth.users u
  left join public.gyms g on g.id = u.id
  left join public.billing_settings bs on bs.gym_id = g.id
  left join public.app_user_access aua on aua.user_id = u.id
  order by u.created_at desc;
$$;

drop function if exists public.set_user_access(uuid, boolean);
create function public.set_user_access(
  p_user_id uuid,
  p_is_allowed boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'User ID is required.';
  end if;

  insert into public.app_user_access (user_id, is_allowed, updated_at)
  values (p_user_id, coalesce(p_is_allowed, true), now())
  on conflict (user_id)
  do update set
    is_allowed = excluded.is_allowed,
    updated_at = now();

  return coalesce(p_is_allowed, true);
end;
$$;

drop function if exists public.is_current_user_access_allowed();
create function public.is_current_user_access_allowed()
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select coalesce(
    (select aua.is_allowed from public.app_user_access aua where aua.user_id = auth.uid()),
    true
  );
$$;

grant execute on function public.list_account_users() to anon, authenticated;
grant execute on function public.set_user_access(uuid, boolean) to anon, authenticated;
grant execute on function public.is_current_user_access_allowed() to anon, authenticated;
