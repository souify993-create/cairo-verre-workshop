create table public.workshop_state (
  id smallint primary key default 1 check (id = 1),
  payload jsonb not null default jsonb_build_object(
    'version', 1,
    'orders', '[]'::jsonb,
    'accessoryPurchases', '[]'::jsonb,
    'supplierInvoices', '[]'::jsonb,
    'expenses', '[]'::jsonb,
    'employees', '[]'::jsonb,
    'payrollWeeks', '[]'::jsonb,
    'drafts', '[]'::jsonb
  ),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint workshop_state_payload_shape check (
    jsonb_typeof(payload) = 'object'
    and payload->>'version' = '1'
    and jsonb_typeof(payload->'orders') = 'array'
    and jsonb_typeof(payload->'accessoryPurchases') = 'array'
    and jsonb_typeof(payload->'supplierInvoices') = 'array'
    and jsonb_typeof(payload->'expenses') = 'array'
    and jsonb_typeof(payload->'employees') = 'array'
    and jsonb_typeof(payload->'payrollWeeks') = 'array'
    and jsonb_typeof(payload->'drafts') = 'array'
  )
);

alter table public.workshop_state enable row level security;
revoke all on table public.workshop_state from anon, authenticated;
grant select on table public.workshop_state to authenticated;

create policy "Cairo Verre admins can read workshop state"
on public.workshop_state
for select
to authenticated
using ((select auth.uid()) is not null and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create or replace function public.save_workshop_state(
  p_payload jsonb,
  p_expected_revision bigint
)
returns table (revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if auth.uid() is null or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid expected revision' using errcode = '22023';
  end if;

  if jsonb_typeof(p_payload) <> 'object'
     or p_payload->>'version' <> '1'
     or jsonb_typeof(p_payload->'orders') <> 'array'
     or jsonb_typeof(p_payload->'accessoryPurchases') <> 'array'
     or jsonb_typeof(p_payload->'supplierInvoices') <> 'array'
     or jsonb_typeof(p_payload->'expenses') <> 'array'
     or jsonb_typeof(p_payload->'employees') <> 'array'
     or jsonb_typeof(p_payload->'payrollWeeks') <> 'array'
     or jsonb_typeof(p_payload->'drafts') <> 'array' then
    raise exception 'Invalid Cairo Verre workshop payload' using errcode = '22023';
  end if;

  insert into public.workshop_state (id, payload, revision, updated_by)
  values (1, p_payload, 1, auth.uid())
  on conflict (id) do nothing
  returning public.workshop_state.revision, public.workshop_state.updated_at
  into v_revision, v_updated_at;

  if found then
    return query select v_revision, v_updated_at;
    return;
  end if;

  update public.workshop_state as state
  set payload = p_payload,
      revision = state.revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where state.id = 1
    and state.revision = p_expected_revision
  returning state.revision, state.updated_at
  into v_revision, v_updated_at;

  if not found then
    raise exception 'REVISION_CONFLICT' using errcode = '40001';
  end if;

  return query select v_revision, v_updated_at;
end;
$$;

revoke all on function public.save_workshop_state(jsonb, bigint) from public, anon;
grant execute on function public.save_workshop_state(jsonb, bigint) to authenticated;
