create table if not exists public.admin_client_revenue_entries (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

alter table public.admin_client_revenue_entries enable row level security;

create or replace function public.list_admin_client_revenue_entries()
returns table (
  id uuid,
  client_name text,
  amount numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    e.id,
    e.client_name,
    e.amount,
    e.created_at
  from public.admin_client_revenue_entries e
  where public.is_current_user_access_allowed()
  order by e.created_at desc;
$$;

create or replace function public.add_admin_client_revenue_entry(
  p_client_name text,
  p_amount numeric
)
returns public.admin_client_revenue_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.admin_client_revenue_entries;
begin
  if not public.is_current_user_access_allowed() then
    raise exception 'Access denied.';
  end if;

  if coalesce(trim(p_client_name), '') = '' then
    raise exception 'Client name is required.';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'Amount must be a non-negative number.';
  end if;

  insert into public.admin_client_revenue_entries (client_name, amount)
  values (trim(p_client_name), p_amount)
  returning * into inserted;

  return inserted;
end;
$$;

grant execute on function public.list_admin_client_revenue_entries() to authenticated;
grant execute on function public.add_admin_client_revenue_entry(text, numeric) to authenticated;
