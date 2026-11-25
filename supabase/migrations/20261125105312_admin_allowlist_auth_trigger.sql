create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.admin_allowlist (
  email text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint admin_allowlist_email_normalized check (email = lower(btrim(email)) and position('@' in email) > 1)
);
revoke all on table private.admin_allowlist from public, anon, authenticated;

create or replace function private.assign_cairo_verre_admin_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and exists (
    select 1
    from private.admin_allowlist allowlist
    where allowlist.email = lower(btrim(new.email))
      and allowlist.active = true
  ) then
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', 'admin', 'application', 'cairo-verre')
    where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.assign_cairo_verre_admin_role() from public, anon, authenticated;

drop trigger if exists on_cairo_verre_auth_user_created on auth.users;
create trigger on_cairo_verre_auth_user_created
after insert on auth.users
for each row execute function private.assign_cairo_verre_admin_role();
