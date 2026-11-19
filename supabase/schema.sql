-- Second Brain: cross-device sync table.
-- Paste this whole file into Supabase → SQL Editor → New query, then Run.
-- Safe to run more than once.

create table if not exists public.kv (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null,
  value      jsonb,
  version    integer     not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Only a signed-in person can see or change their own rows.
alter table public.kv enable row level security;

drop policy if exists "own rows: read"   on public.kv;
drop policy if exists "own rows: insert" on public.kv;
drop policy if exists "own rows: update" on public.kv;
drop policy if exists "own rows: delete" on public.kv;

create policy "own rows: read"   on public.kv for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows: insert" on public.kv for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows: update" on public.kv for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows: delete" on public.kv for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.kv to authenticated;

-- Live updates between devices.
do $$
begin
  alter publication supabase_realtime add table public.kv;
exception when duplicate_object then null;
end $$;
