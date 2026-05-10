create table if not exists public.billing_settings (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  receipt_enabled boolean not null default false,
  gym_display_name text,
  contact_email text,
  contact_phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  tax_label text,
  tax_value text,
  invoice_prefix text not null default 'REC',
  footer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_settings_gym_id_key unique (gym_id)
);

alter table public.billing_settings enable row level security;

drop policy if exists billing_settings_select on public.billing_settings;
create policy billing_settings_select
on public.billing_settings for select
using (gym_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists billing_settings_insert on public.billing_settings;
create policy billing_settings_insert
on public.billing_settings for insert
with check (gym_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists billing_settings_update on public.billing_settings;
create policy billing_settings_update
on public.billing_settings for update
using (gym_id = auth.uid() or auth.role() = 'service_role')
with check (gym_id = auth.uid() or auth.role() = 'service_role');
