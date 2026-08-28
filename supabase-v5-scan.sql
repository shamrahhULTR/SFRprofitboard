-- PROFIT BOARD: log every AI receipt scan next to what actually got saved,
-- so the extraction prompt can be improved by seeing where it was wrong.
-- Paste into Supabase SQL Editor and Run. Safe to re-run.
create table if not exists public.scan_logs (
  id          uuid primary key default gen_random_uuid(),
  raw         jsonb,            -- exactly what the model returned
  final_saved jsonb,            -- what the human confirmed (after edits)
  source      text default 'ai' check (source in ('ai','ocr')),
  created_by  uuid references auth.users,
  created_at  timestamptz not null default now()
);
alter table public.scan_logs enable row level security;
drop policy if exists "signed in add scan logs"  on public.scan_logs;
drop policy if exists "admin reads scan logs"    on public.scan_logs;
create policy "signed in add scan logs" on public.scan_logs
  for insert to authenticated with check (auth.uid() is not null);
create policy "admin reads scan logs" on public.scan_logs
  for select to authenticated using (public.is_admin());
