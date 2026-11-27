-- ============================================================================
-- Cali Zero-Knowledge Encrypted Vault Table (Optional Cloud Sync for Later)
-- Paste into Supabase SQL Editor whenever you are ready to turn on Cloud Sync.
-- ============================================================================

create table if not exists public.encrypted_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version int not null default 1,
  salt text not null,
  iv text not null,
  ciphertext text not null,
  updated_at timestamptz default now()
);

alter table public.encrypted_vaults enable row level security;

drop policy if exists "Users access ONLY own encrypted vault" on public.encrypted_vaults;
create policy "Users access ONLY own encrypted vault" on public.encrypted_vaults
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
