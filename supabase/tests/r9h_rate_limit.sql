-- R9H durable rate-limit counter: one transaction, always rolled back.
-- Requires migration 20261001090000. Run with
-- `supabase db query --linked --file supabase/tests/r9h_rate_limit.sql`.
begin;

do $r9h$
declare
  d1 text := encode(sha256('r9h-fixture-subject'::bytea), 'hex');
  d2 text := encode(sha256('r9h-fixture-address'::bytea), 'hex');
  r jsonb;
  i integer;
  rejected boolean;
begin
  -- Allowed up to the limit.
  for i in 1..3 loop
    r := public.trusted_rate_limit_hit(array[d1], array[600], array[3]);
    if (r ->> 'allowed')::boolean is not true or (r ->> 'retry_after_seconds')::integer <> 0 then
      raise exception 'R9H hit % within limit was refused: %', i, r;
    end if;
  end loop;

  -- Throttled past it, with a bounded Retry-After.
  r := public.trusted_rate_limit_hit(array[d1], array[600], array[3]);
  if (r ->> 'allowed')::boolean is not false
    or (r ->> 'retry_after_seconds')::integer not between 1 and 600 then
    raise exception 'R9H over-limit hit was allowed: %', r;
  end if;

  -- Buckets are independent; one exhausted bucket refuses a combined call.
  r := public.trusted_rate_limit_hit(array[d2], array[600], array[3]);
  if (r ->> 'allowed')::boolean is not true then
    raise exception 'R9H separate bucket was refused: %', r;
  end if;
  r := public.trusted_rate_limit_hit(array[d2, d1], array[600, 600], array[3, 3]);
  if (r ->> 'allowed')::boolean is not false then
    raise exception 'R9H combined call ignored an exhausted bucket: %', r;
  end if;

  -- Reset at the window boundary.
  for i in 1..2 loop
    r := public.trusted_rate_limit_hit(array[d2], array[1], array[2]);
  end loop;
  r := public.trusted_rate_limit_hit(array[d2], array[1], array[2]);
  if (r ->> 'allowed')::boolean is not false then
    raise exception 'R9H 1 s bucket did not throttle: %', r;
  end if;
  perform pg_sleep(1.1);
  r := public.trusted_rate_limit_hit(array[d2], array[1], array[2]);
  if (r ->> 'allowed')::boolean is not true then
    raise exception 'R9H window did not reset: %', r;
  end if;

  -- Only digests are stored.
  if exists (select 1 from private.edge_rate_limit_windows where bucket_digest !~ '^[0-9a-f]{64}$') then
    raise exception 'R9H stored a non-digest key';
  end if;

  -- Malformed requests are refused, not counted.
  foreach r in array array[
    to_jsonb('not-a-digest'::text), to_jsonb(upper(d1))
  ] loop
    rejected := false;
    begin
      perform public.trusted_rate_limit_hit(array[r #>> '{}'], array[600], array[3]);
    exception when invalid_parameter_value then
      rejected := true;
    end;
    if not rejected then raise exception 'R9H accepted a malformed digest'; end if;
  end loop;
  rejected := false;
  begin
    perform public.trusted_rate_limit_hit(array[d1], array[0], array[3]);
  exception when invalid_parameter_value then
    rejected := true;
  end;
  if not rejected then raise exception 'R9H accepted a zero window'; end if;
  rejected := false;
  begin
    perform public.trusted_rate_limit_hit(array[d1, d2, d1, d2, d1], array[1, 1, 1, 1, 1], array[1, 1, 1, 1, 1]);
  exception when invalid_parameter_value then
    rejected := true;
  end;
  if not rejected then raise exception 'R9H accepted too many buckets'; end if;

  -- Only the service role may call it; no Data API role can touch the table.
  if has_function_privilege('anon', 'public.trusted_rate_limit_hit(text[], integer[], integer[])', 'execute')
    or has_function_privilege('authenticated', 'public.trusted_rate_limit_hit(text[], integer[], integer[])', 'execute')
    or not has_function_privilege('service_role', 'public.trusted_rate_limit_hit(text[], integer[], integer[])', 'execute') then
    raise exception 'R9H function privileges are wrong';
  end if;
  if has_table_privilege('anon', 'private.edge_rate_limit_windows', 'select')
    or has_table_privilege('authenticated', 'private.edge_rate_limit_windows', 'select')
    or has_table_privilege('service_role', 'private.edge_rate_limit_windows', 'select')
    or has_table_privilege('authenticated', 'private.edge_rate_limit_windows', 'insert') then
    raise exception 'R9H table is reachable by a Data API role';
  end if;
end
$r9h$;

select 'R9H RATE LIMIT HARNESS PASSED' as result;
rollback;
