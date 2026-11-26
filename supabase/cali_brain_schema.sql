-- ============================================================================
-- Cali "JARVIS" 3-Layer Brain Schema (Supabase Postgres + Strict RLS)
-- Paste into Supabase Dashboard -> SQL Editor -> Run
-- ============================================================================

-- 1. Profiles & Clearance Hierarchy (BOSS / TRUSTED / USER)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  preferred_name text,
  honorific text,
  language_pref text default 'en' check (language_pref in ('en', 'taglish')),
  clearance text default 'USER' check (clearance in ('BOSS', 'TRUSTED', 'USER')),
  onboarding_topics jsonb default '{"name_vibe":false,"design_taste":false,"tech_stack":false,"autonomy":false}'::jsonb,
  onboarding_complete boolean default false,
  updated_at timestamptz default now()
);

-- 2. Layer 2: Strictly Isolated Per-User Private Vault
create table if not exists public.private_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  type text not null default 'preference',
  value text not null,
  triggers text[] default '{}',
  source text default 'explicit_user',
  confidence real default 0.9,
  updated_at timestamptz default now(),
  unique (user_id, key)
);

-- 3. Layer 1: Shared Collective Cali Brain (Non-Sensitive Only)
create table if not exists public.shared_memories (
  id uuid primary key default gen_random_uuid(),
  topic text not null unique,
  category text not null default 'coding_pattern',
  value text not null,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  contributed_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz default now()
);

-- Enable Row-Level Security (Strict Isolation)
alter table public.profiles enable row level security;
alter table public.private_memories enable row level security;
alter table public.shared_memories enable row level security;

-- Profiles policies
drop policy if exists "Users manage own profile" on public.profiles;
create policy "Users manage own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Private Memories policies (Physically impossible for User B to read User A)
drop policy if exists "Users access ONLY own private memories" on public.private_memories;
create policy "Users access ONLY own private memories" on public.private_memories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Shared Brain policies
drop policy if exists "Signed-in users read approved shared brain" on public.shared_memories;
create policy "Signed-in users read approved shared brain" on public.shared_memories
  for select using (
    status = 'approved'
    or exists (select 1 from public.profiles where id = auth.uid() and clearance = 'BOSS')
  );

drop policy if exists "Signed-in users submit shared candidates" on public.shared_memories;
create policy "Signed-in users submit shared candidates" on public.shared_memories
  for insert with check (auth.uid() is not null and status = 'pending');

drop policy if exists "Only BOSS can approve or edit shared brain" on public.shared_memories;
create policy "Only BOSS can approve or edit shared brain" on public.shared_memories
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and clearance = 'BOSS')
  );

drop policy if exists "Only BOSS can delete shared brain items" on public.shared_memories;
create policy "Only BOSS can delete shared brain items" on public.shared_memories
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and clearance = 'BOSS')
  );

-- Auto-create profile row when a new user signs up via Google or Email
create or replace function public.handle_new_cali_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, preferred_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_cali on auth.users;
create trigger on_auth_user_created_cali
  after insert on auth.users
  for each row execute function public.handle_new_cali_user();

-- ============================================================================
-- AFTER YOUR FIRST SIGN-IN, RUN THIS ONCE TO PROMOTE YOURSELF TO "BOSS":
-- update public.profiles set clearance = 'BOSS' where email = 'your-email@gmail.com';
-- ============================================================================
