create table if not exists public.kookapp_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.kookapp_data enable row level security;
revoke all on public.kookapp_data from public, anon, authenticated;
grant select on public.kookapp_data to authenticated;

drop policy if exists "Users read their own cooking data" on public.kookapp_data;
create policy "Users read their own cooking data"
  on public.kookapp_data for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.save_kookapp_data(p_data jsonb, p_expected_revision bigint)
returns table (revision bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or pg_column_size(p_data) > 1048576 then
    raise exception 'Cooking data must be a JSON object smaller than 1 MB.';
  end if;

  if p_expected_revision is null then
    return query
      insert into public.kookapp_data as current_data (user_id, data)
      values (auth.uid(), p_data)
      on conflict (user_id) do nothing
      returning current_data.revision;
  else
    return query
      update public.kookapp_data as current_data
      set data = p_data, revision = current_data.revision + 1, updated_at = now()
      where current_data.user_id = auth.uid() and current_data.revision = p_expected_revision
      returning current_data.revision;
  end if;
end;
$$;

revoke all on function public.save_kookapp_data(jsonb, bigint) from public, anon;
grant execute on function public.save_kookapp_data(jsonb, bigint) to authenticated;

create table if not exists public.kookapp_recipe_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null check (count > 0),
  primary key (user_id, day)
);
alter table public.kookapp_recipe_usage enable row level security;
revoke all on public.kookapp_recipe_usage from public, anon, authenticated;

create or replace function public.reserve_kookapp_recipe_request(p_user_id uuid, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reserved integer;
begin
  if p_user_id is null or p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'Invalid usage limit.';
  end if;
  insert into public.kookapp_recipe_usage as usage (user_id, day, count)
  values (p_user_id, (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, day) do update set count = usage.count + 1
    where usage.count < p_limit
  returning count into reserved;
  return reserved is not null;
end;
$$;

revoke all on function public.reserve_kookapp_recipe_request(uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_kookapp_recipe_request(uuid, integer) to service_role;
