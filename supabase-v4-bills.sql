-- PROFIT BOARD: fixed costs can start in the past (e.g. rent since January).
-- Paste into Supabase SQL Editor and Run. Safe to re-run.
alter table public.recurring_expenses
  add column if not exists starts_on date not null default current_date;
