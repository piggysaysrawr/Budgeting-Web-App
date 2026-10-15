-- Run once in your Supabase project's SQL editor. Never use a service-role key in the app.
create table if not exists public.households (
 user_id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 constraint document_shape check ((jsonb_typeof(data)='object' and jsonb_typeof(data->'accounts')='array' and jsonb_typeof(data->'transactions')='array' and jsonb_typeof(data->'categories')='array' and jsonb_typeof(data->'bills')='array' and jsonb_typeof(data->'budgets')='object') is true)
);
alter table public.households enable row level security;
drop policy if exists "Read own household" on public.households;
create policy "Read own household" on public.households for select to authenticated using ((select auth.uid())=user_id);
-- Writes use the atomic RPC below. No direct client INSERT/UPDATE/DELETE grants.
revoke all on public.households from anon, authenticated;
grant select on public.households to authenticated;
create or replace function public.save_household(document jsonb, expected_revision bigint)
returns bigint language plpgsql security definer set search_path=public as $$
declare new_revision bigint; entry jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 -- Server validation protects persisted money from malformed/direct RPC requests.
 if jsonb_typeof(document->'accounts') is distinct from 'array'
 or jsonb_typeof(document->'transactions') is distinct from 'array'
 or jsonb_typeof(document->'categories') is distinct from 'array'
 or jsonb_typeof(document->'bills') is distinct from 'array'
 or jsonb_typeof(document->'budgets') is distinct from 'object' then
  raise exception 'Invalid household structure';
 end if;
 for entry in select value from jsonb_array_elements(document->'accounts') loop
  if jsonb_typeof(entry->'opening') is distinct from 'number'
  or not coalesce((entry->>'opening') ~ '^-?[0-9]+$',false)
  or abs((entry->>'opening')::numeric)>10000000000
  or not coalesce(entry->>'type' in ('checking','savings','cash','credit','debt'),false)
  then raise exception 'Invalid account balance or type'; end if;
 end loop;
 for entry in select value from jsonb_array_elements(document->'transactions') loop
  if jsonb_typeof(entry->'amount') is distinct from 'number'
  or not coalesce((entry->>'amount') ~ '^[0-9]+$',false)
  or (entry->>'amount')::numeric not between 1 and 10000000000
  or not coalesce(entry->>'type' in ('expense','income','transfer','refund'),false)
  then raise exception 'Invalid transaction amount or type'; end if;
  if not exists(select 1 from jsonb_array_elements(document->'accounts') a where a->>'id'=entry->>'account')
  then raise exception 'Unknown transaction account'; end if;
  if entry->>'type'='transfer' and (entry->>'account'=entry->>'to' or not exists(select 1 from jsonb_array_elements(document->'accounts') a where a->>'id'=entry->>'to'))
  then raise exception 'Invalid transfer destination'; end if;
  if entry->>'type' in ('expense','refund') and not exists(select 1 from jsonb_array_elements(document->'categories') c where c->>'id'=entry->>'category')
  then raise exception 'Unknown transaction category'; end if;
 end loop;
 if octet_length(document::text)>2000000 then raise exception 'Household exceeds document limit'; end if;
 if expected_revision=0 then
  insert into public.households(user_id,data,revision) values(auth.uid(),document,1) on conflict do nothing returning revision into new_revision;
 else
  update public.households set data=document,revision=revision+1,updated_at=now() where user_id=auth.uid() and revision=expected_revision returning revision into new_revision;
 end if;
 if new_revision is null then raise exception 'Data changed on another device. Reload before saving.'; end if;
 return new_revision;
end; $$;
revoke all on function public.save_household(jsonb,bigint) from public,anon;
grant execute on function public.save_household(jsonb,bigint) to authenticated;
