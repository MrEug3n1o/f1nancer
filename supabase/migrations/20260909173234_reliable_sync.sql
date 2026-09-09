-- Additive repair: retain all existing finance data and publication/stream names.
create schema if not exists f1_sync_private;
revoke all on schema f1_sync_private from public, anon;
grant usage on schema f1_sync_private to authenticated;
create table f1_sync_private.sync_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  instance_id uuid not null,
  op_id text not null,
  result jsonb not null,
  primary key (user_id, instance_id, op_id)
);
create table f1_sync_private.sync_id_aliases (
  user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null,
  client_id uuid not null,
  canonical_id uuid not null,
  primary key (user_id, table_name, client_id)
);
alter table f1_sync_private.sync_receipts enable row level security;
alter table f1_sync_private.sync_id_aliases enable row level security;
revoke all on f1_sync_private.sync_receipts, f1_sync_private.sync_id_aliases from public, anon, authenticated;

create or replace function f1_sync_private.apply_sync_batch(p_instance_id uuid, p_operations jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  uid uuid := auth.uid(); op jsonb; payload jsonb; saved jsonb; result jsonb; results jsonb := '[]';
  t text; action text; rid uuid; original_id uuid; owner uuid; canonical uuid; ref uuid;
  col text; target text; keys text; selects text; known text[]; found_row boolean;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_instance_id is null or jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations) = 0 then
    raise exception 'Invalid sync batch';
  end if;
  -- Serialize writes per account, including retries arriving from a second connection.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  for op in select value from jsonb_array_elements(p_operations) loop
    if coalesce(op->>'op_id', '') !~ '^[0-9]+$' then raise exception 'Invalid operation ID'; end if;
    select r.result into result from f1_sync_private.sync_receipts r
      where r.user_id = uid and r.instance_id = p_instance_id and r.op_id = op->>'op_id';
    if found then results := results || jsonb_build_array(result); continue; end if;
    t := op->>'table'; action := op->>'op'; original_id := (op->>'id')::uuid; rid := original_id;
    if t is null or not t = any(array['currencies','categories','settings','goals','deposits','credit_debts','recurring_rules','budgets','transactions']) then
      raise exception 'Unsupported sync table' using errcode = '42501';
    end if;
    if action is null or action not in ('PUT','PATCH','DELETE') or rid is null then raise exception 'Invalid sync operation'; end if;
    payload := coalesce(op->'data', '{}'::jsonb);
    if jsonb_typeof(payload) <> 'object' then raise exception 'Invalid row data'; end if;
    select array_agg(column_name::text) into known from information_schema.columns where table_schema = 'public' and table_name = t;
    for col in select jsonb_object_keys(payload) loop
      if not col = any(known) then raise exception 'Unknown sync column %', col; end if;
    end loop;
    if payload ? 'user_id' and payload->>'user_id' is distinct from uid::text then raise exception 'Wrong row owner' using errcode = '42501'; end if;
    if payload ? 'id' and payload->>'id' is distinct from original_id::text then raise exception 'Cannot change row ID' using errcode = '42501'; end if;
    select a.canonical_id into canonical from f1_sync_private.sync_id_aliases a where a.user_id = uid and a.table_name = t and a.client_id = original_id;
    if found then rid := canonical; end if;
    execute format('select user_id, to_jsonb(r) from public.%I r where id = $1', t) into owner, saved using rid;
    if owner is not null and owner <> uid then raise exception 'Wrong row owner' using errcode = '42501'; end if;
    found_row := saved is not null;
    if action = 'PUT' and not found_row then
      canonical := null;
      if t = 'settings' then select id into canonical from public.settings where user_id = uid;
      elsif t = 'currencies' then select id into canonical from public.currencies where user_id = uid and code = payload->>'code';
      elsif t = 'budgets' then select id into canonical from public.budgets where user_id = uid and category_id = (payload->>'category_id')::uuid and currency_code = payload->>'currency_code'; end if;
      if canonical is not null then
        rid := canonical;
        insert into f1_sync_private.sync_id_aliases values (uid, t, original_id, canonical) on conflict (user_id, table_name, client_id) do update set canonical_id = excluded.canonical_id;
        execute format('select to_jsonb(r) from public.%I r where id = $1 and user_id = $2', t) into saved using rid, uid;
        found_row := true;
      end if;
    end if;
    result := jsonb_build_object('op_id', op->>'op_id', 'id', rid);
    if coalesce((op->>'merge')::boolean, false) and found_row and
      not (saved @> (payload - array['id','created_at','updated_at'])) then
      -- Preserve the remote value and return the complete incoming value to the client for review.
      result := result || jsonb_build_object('conflict', true, 'cloud', saved);
    elsif action = 'DELETE' then
      execute format('delete from public.%I where id = $1 and user_id = $2', t) using rid, uid;
    else
      if action = 'PATCH' and not found_row then raise exception 'Cannot update missing %. Restore or remove the pending change first.', t; end if;
      payload := payload - 'id' - 'user_id';
      -- A merge of identical records is a no-op; do not change cloud timestamps.
      if coalesce((op->>'merge')::boolean, false) and found_row then
        null;
      else
        for col, target in select * from (values ('category_id','categories'),('goal_id','goals'),('credit_debt_id','credit_debts'),('recurring_id','recurring_rules')) x(c,t) loop
          if payload->>col is not null then
            ref := (payload->>col)::uuid;
            execute format('select user_id from public.%I where id = $1', target) into owner using ref;
            if owner is distinct from uid then raise exception 'Missing or foreign reference: %', col using errcode = '23503'; end if;
          end if;
        end loop;
        if found_row then
          select string_agg(format('%I', key), ', '), string_agg(format('x.%I', key), ', ') into keys, selects from jsonb_object_keys(payload) key;
          if keys is not null then
            execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1) x) where id = $2 and user_id = $3', t, keys, selects, t) using payload, rid, uid;
          end if;
        else
          payload := payload || jsonb_build_object('id', rid, 'user_id', uid);
          select string_agg(format('%I', key), ', '), string_agg(format('x.%I', key), ', ') into keys, selects from jsonb_object_keys(payload) key;
          execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) x', t, keys, selects, t) using payload;
        end if;
      end if;
    end if;
    insert into f1_sync_private.sync_receipts values (uid, p_instance_id, op->>'op_id', result);
    results := results || jsonb_build_array(result);
  end loop;
  return results;
end;
$$;
revoke all on function f1_sync_private.apply_sync_batch(uuid, jsonb) from public, anon;
grant execute on function f1_sync_private.apply_sync_batch(uuid, jsonb) to authenticated;
-- These owner-only grants are needed even when RLS policies exist.
grant select, insert, update, delete on public.profiles, public.currencies, public.categories, public.settings, public.goals, public.deposits, public.credit_debts, public.recurring_rules, public.budgets, public.transactions to authenticated;

create or replace function public.apply_sync_batch(p_instance_id uuid, p_operations jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select f1_sync_private.apply_sync_batch(p_instance_id, p_operations);
$$;
revoke all on function public.apply_sync_batch(uuid, jsonb) from public, anon;
grant execute on function public.apply_sync_batch(uuid, jsonb) to authenticated;
