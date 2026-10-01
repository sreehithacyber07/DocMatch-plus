-- R9H application-level abuse limits for the trusted Edge operations.
--
-- Edge isolates share no memory, so a limit that holds across isolates needs a
-- shared atomic counter. This adds one private table and one service-only
-- function. No existing table, policy, function or clinical object changes.
--
-- Privacy: rows hold only a 64-hex HMAC digest (keyed by a server-only secret
-- in the Edge runtime), a window and a count. No address, user id, token or
-- request content reaches the database. Rows are operational counters, not
-- patient records, and are pruned a day after their window.

create table private.edge_rate_limit_windows (
  bucket_digest text not null check (bucket_digest ~ '^[0-9a-f]{64}$'),
  window_seconds integer not null check (window_seconds between 1 and 86400),
  window_start timestamptz not null,
  hits integer not null check (hits between 0 and 1000000),
  primary key (bucket_digest, window_seconds, window_start)
);

create index edge_rate_limit_windows_start_idx on private.edge_rate_limit_windows (window_start);

alter table private.edge_rate_limit_windows enable row level security;
revoke all on table private.edge_rate_limit_windows from public, anon, authenticated, service_role;

-- Counts one hit against each bucket atomically and reports whether every
-- bucket is still within its limit. clock_timestamp() so long transactions and
-- tests see real elapsed time.
create function public.trusted_rate_limit_hit(
  p_digests text[],
  p_window_seconds integer[],
  p_limits integer[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer := coalesce(cardinality(p_digests), 0);
  v_start timestamptz;
  v_hits integer;
  v_allowed boolean := true;
  v_retry integer := 0;
  i integer;
begin
  if v_count < 1 or v_count > 4
    or coalesce(cardinality(p_window_seconds), 0) <> v_count
    or coalesce(cardinality(p_limits), 0) <> v_count then
    raise exception 'invalid rate limit request' using errcode = '22023';
  end if;

  for i in 1..v_count loop
    if p_digests[i] is null or p_digests[i] !~ '^[0-9a-f]{64}$'
      or p_window_seconds[i] is null or p_window_seconds[i] not between 1 and 86400
      or p_limits[i] is null or p_limits[i] not between 1 and 100000 then
      raise exception 'invalid rate limit request' using errcode = '22023';
    end if;

    v_start := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds[i]) * p_window_seconds[i]);

    insert into private.edge_rate_limit_windows as w (bucket_digest, window_seconds, window_start, hits)
    values (p_digests[i], p_window_seconds[i], v_start, 1)
    on conflict (bucket_digest, window_seconds, window_start)
      do update set hits = least(w.hits + 1, 1000000)
    returning w.hits into v_hits;

    if v_hits > p_limits[i] then
      v_allowed := false;
      v_retry := greatest(v_retry, ceil(extract(epoch from
        (v_start + make_interval(secs => p_window_seconds[i]) - v_now)))::integer);
    end if;
  end loop;

  -- Bounded opportunistic pruning keeps the table small without a scheduler.
  if random() < 0.02 then
    delete from private.edge_rate_limit_windows
    where ctid in (
      select ctid from private.edge_rate_limit_windows
      where window_start < v_now - interval '1 day'
      limit 500
    );
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'retry_after_seconds', case when v_allowed then 0 else greatest(v_retry, 1) end
  );
end;
$$;

revoke all on function public.trusted_rate_limit_hit(text[], integer[], integer[]) from public, anon, authenticated;
grant execute on function public.trusted_rate_limit_hit(text[], integer[], integer[]) to service_role;
