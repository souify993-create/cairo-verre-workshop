-- Merge concurrent workshop saves by record identity instead of replacing the
-- entire shared JSON document. The singleton row is still updated atomically,
-- while conflicts are detected only when the same record changed concurrently.

create or replace function public.merge_workshop_json_array(
  p_base jsonb,
  p_proposed jsonb,
  p_current jsonb,
  p_key text,
  p_collection text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_base jsonb;
  v_proposed jsonb;
  v_current jsonb;
  v_item jsonb;
  v_key text;
  v_result jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(coalesce(p_base, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_proposed, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_current, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid collection data: %', p_collection using errcode = '22023';
  end if;

  -- Every record must have a stable identity and identities must be unique.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_base, '[]'::jsonb)) e(value)
    where nullif(e.value ->> p_key, '') is null
  ) or exists (
    select 1
    from jsonb_array_elements(coalesce(p_proposed, '[]'::jsonb)) e(value)
    where nullif(e.value ->> p_key, '') is null
  ) or exists (
    select 1
    from jsonb_array_elements(coalesce(p_current, '[]'::jsonb)) e(value)
    where nullif(e.value ->> p_key, '') is null
  ) then
    raise exception 'Missing record identity in collection %', p_collection using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_base, '[]'::jsonb)) e(value)
    group by e.value ->> p_key having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(coalesce(p_proposed, '[]'::jsonb)) e(value)
    group by e.value ->> p_key having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(coalesce(p_current, '[]'::jsonb)) e(value)
    group by e.value ->> p_key having count(*) > 1
  ) then
    raise exception 'Duplicate record identity in collection %', p_collection using errcode = '22023';
  end if;

  -- Reject edits to a record that another session changed or deleted.
  for v_item in select value from jsonb_array_elements(coalesce(p_base, '[]'::jsonb))
  loop
    v_key := v_item ->> p_key;
    select value into v_proposed
    from jsonb_array_elements(coalesce(p_proposed, '[]'::jsonb))
    where value ->> p_key = v_key
    limit 1;

    if v_item is distinct from v_proposed then
      select value into v_current
      from jsonb_array_elements(coalesce(p_current, '[]'::jsonb))
      where value ->> p_key = v_key
      limit 1;

      if (v_current is null and v_proposed is not null)
         or (v_current is not null and v_current is distinct from v_item
             and v_current is distinct from v_proposed) then
        raise exception 'RECORD_CONFLICT:%:%', p_collection, v_key using errcode = '40001';
      end if;
    end if;
    v_proposed := null;
    v_current := null;
  end loop;

  -- A concurrently-created record with the same identity is also a conflict
  -- unless it is an identical retry.
  for v_item in select value from jsonb_array_elements(coalesce(p_proposed, '[]'::jsonb))
  loop
    v_key := v_item ->> p_key;
    if not exists (
      select 1 from jsonb_array_elements(coalesce(p_base, '[]'::jsonb))
      where value ->> p_key = v_key
    ) then
      select value into v_current
      from jsonb_array_elements(coalesce(p_current, '[]'::jsonb))
      where value ->> p_key = v_key
      limit 1;
      if v_current is not null and v_current is distinct from v_item then
        raise exception 'RECORD_CONFLICT:%:%', p_collection, v_key using errcode = '40001';
      end if;
      v_current := null;
    end if;
  end loop;

  -- Start with the latest committed array, applying only this client's
  -- changed records. Unchanged records from other sessions are retained.
  for v_item in select value from jsonb_array_elements(coalesce(p_current, '[]'::jsonb))
  loop
    v_key := v_item ->> p_key;
    select value into v_base
    from jsonb_array_elements(coalesce(p_base, '[]'::jsonb))
    where value ->> p_key = v_key
    limit 1;
    select value into v_proposed
    from jsonb_array_elements(coalesce(p_proposed, '[]'::jsonb))
    where value ->> p_key = v_key
    limit 1;

    if v_base is not null and v_base is distinct from v_proposed then
      if v_proposed is not null then
        v_result := v_result || jsonb_build_array(v_proposed);
      end if;
    else
      v_result := v_result || jsonb_build_array(v_item);
    end if;
    v_base := null;
    v_proposed := null;
  end loop;

  -- Append records newly created by this client that are not already present.
  for v_item in select value from jsonb_array_elements(coalesce(p_proposed, '[]'::jsonb))
  loop
    v_key := v_item ->> p_key;
    if not exists (
      select 1 from jsonb_array_elements(coalesce(p_base, '[]'::jsonb))
      where value ->> p_key = v_key
    ) and not exists (
      select 1 from jsonb_array_elements(coalesce(p_current, '[]'::jsonb))
      where value ->> p_key = v_key
    ) then
      v_result := v_result || jsonb_build_array(v_item);
    end if;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.merge_workshop_json_array(jsonb, jsonb, jsonb, text, text) from public, anon;
grant execute on function public.merge_workshop_json_array(jsonb, jsonb, jsonb, text, text) to authenticated;

-- Accessory purchases are separate stock movements, not one row per
-- accessory type. Give legacy movements stable IDs before merging by record.
update public.workshop_state as state
set payload = jsonb_set(
      state.payload,
      '{accessoryPurchases}',
      coalesce((
        select jsonb_agg(
          case
            when item ? 'id' then item
            else item || jsonb_build_object('id', 'legacy-accessory-purchase:' || ordinal::text)
          end
          order by ordinal
        )
        from jsonb_array_elements(state.payload -> 'accessoryPurchases') with ordinality as items(item, ordinal)
      ), '[]'::jsonb),
      true
    ),
    revision = state.revision + 1,
    updated_at = now()
where state.id = 1
  and exists (
    select 1
    from jsonb_array_elements(state.payload -> 'accessoryPurchases') as items(item)
    where not (item ? 'id')
  );

create or replace function public.save_workshop_state_merge(
  p_base_payload jsonb,
  p_payload jsonb
)
returns table (revision bigint, payload jsonb, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current jsonb;
  v_merged jsonb;
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if auth.uid() is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'application', '') <> 'cairo-verre' then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_base_payload) <> 'object'
     or jsonb_typeof(p_payload) <> 'object'
     or p_payload ->> 'version' <> '1' then
    raise exception 'Invalid Cairo Verre workshop payload' using errcode = '22023';
  end if;

  if jsonb_typeof(p_payload -> 'orders') <> 'array'
     or jsonb_typeof(p_payload -> 'accessoryPurchases') <> 'array'
     or jsonb_typeof(p_payload -> 'supplierInvoices') <> 'array'
     or jsonb_typeof(p_payload -> 'expenses') <> 'array'
     or jsonb_typeof(p_payload -> 'employees') <> 'array'
     or jsonb_typeof(p_payload -> 'payrollWeeks') <> 'array'
     or jsonb_typeof(p_payload -> 'customers') <> 'array'
     or jsonb_typeof(p_payload -> 'independentInvoices') <> 'array'
     or jsonb_typeof(p_payload -> 'drafts') <> 'array'
     or jsonb_typeof(p_base_payload -> 'orders') <> 'array'
     or jsonb_typeof(p_base_payload -> 'accessoryPurchases') <> 'array'
     or jsonb_typeof(p_base_payload -> 'supplierInvoices') <> 'array'
     or jsonb_typeof(p_base_payload -> 'expenses') <> 'array'
     or jsonb_typeof(p_base_payload -> 'employees') <> 'array'
     or jsonb_typeof(p_base_payload -> 'payrollWeeks') <> 'array'
     or jsonb_typeof(p_base_payload -> 'customers') <> 'array'
     or jsonb_typeof(p_base_payload -> 'independentInvoices') <> 'array'
     or jsonb_typeof(p_base_payload -> 'drafts') <> 'array' then
    raise exception 'Invalid Cairo Verre workshop collections' using errcode = '22023';
  end if;

  select state.payload into v_current
  from public.workshop_state as state
  where state.id = 1
  for update;

  if not found then
    raise exception 'Cairo Verre workshop state is not initialized' using errcode = 'P0002';
  end if;

  v_merged := v_current || jsonb_build_object(
    'orders', public.merge_workshop_json_array(p_base_payload->'orders', p_payload->'orders', v_current->'orders', 'id', 'orders'),
    'accessoryPurchases', public.merge_workshop_json_array(p_base_payload->'accessoryPurchases', p_payload->'accessoryPurchases', v_current->'accessoryPurchases', 'id', 'accessoryPurchases'),
    'supplierInvoices', public.merge_workshop_json_array(p_base_payload->'supplierInvoices', p_payload->'supplierInvoices', v_current->'supplierInvoices', 'id', 'supplierInvoices'),
    'expenses', public.merge_workshop_json_array(p_base_payload->'expenses', p_payload->'expenses', v_current->'expenses', 'id', 'expenses'),
    'employees', public.merge_workshop_json_array(p_base_payload->'employees', p_payload->'employees', v_current->'employees', 'id', 'employees'),
    'payrollWeeks', public.merge_workshop_json_array(p_base_payload->'payrollWeeks', p_payload->'payrollWeeks', v_current->'payrollWeeks', 'id', 'payrollWeeks'),
    'customers', public.merge_workshop_json_array(p_base_payload->'customers', p_payload->'customers', v_current->'customers', 'id', 'customers'),
    'independentInvoices', public.merge_workshop_json_array(p_base_payload->'independentInvoices', p_payload->'independentInvoices', v_current->'independentInvoices', 'id', 'independentInvoices'),
    'drafts', public.merge_workshop_json_array(p_base_payload->'drafts', p_payload->'drafts', v_current->'drafts', 'id', 'drafts')
  );

  update public.workshop_state as state
  set payload = v_merged,
      revision = state.revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where state.id = 1
  returning state.revision, state.updated_at
  into v_revision, v_updated_at;

  return query select v_revision, v_merged, v_updated_at;
end;
$$;

revoke all on function public.save_workshop_state_merge(jsonb, jsonb) from public, anon;
grant execute on function public.save_workshop_state_merge(jsonb, jsonb) to authenticated;
