-- Saved pro forma cap sheets ("My Account" page).
-- Each row is a snapshot of one team's cap table at the moment the user hit "Save Cap Sheet".
create table if not exists public.cap_sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_abbr text not null,
  name text not null,
  snapshot jsonb not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cap_sheets_user_id_idx on public.cap_sheets(user_id);

alter table public.cap_sheets enable row level security;

create policy "Users can view their own cap sheets"
  on public.cap_sheets for select
  using (auth.uid() = user_id);

create policy "Users can insert their own cap sheets"
  on public.cap_sheets for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own cap sheets"
  on public.cap_sheets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own cap sheets"
  on public.cap_sheets for delete
  using (auth.uid() = user_id);
