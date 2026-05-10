create or replace function public.delete_admin_client_revenue_entry(
  p_entry_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_access_allowed() then
    raise exception 'Access denied.';
  end if;

  if not exists (
    select 1
    from public.admin_credentials c
    where c.user_id = auth.uid()
  ) then
    raise exception 'Admin credentials are required.';
  end if;

  if p_entry_id is null then
    raise exception 'Entry id is required.';
  end if;

  delete from public.admin_client_revenue_entries
  where id = p_entry_id;

  return found;
end;
$$;

grant execute on function public.delete_admin_client_revenue_entry(uuid) to authenticated;
