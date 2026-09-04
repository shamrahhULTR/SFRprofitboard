-- ============================================================================
--  PROFIT BOARD - minimum fix so Fixed Costs (rent, workers comp) can save.
--  Paste ALL of this into Supabase → SQL Editor → New query → Run.
--  Safe to run more than once.
--  Project must be: qtgvmsepymifpoamndoo
-- ============================================================================

-- Who counts as an admin (already exists if setup ran; harmless to redefine).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- ── 0. Columns the app writes that the original jobs table never had ──
alter table public.jobs
  add column if not exists contract_total        numeric(12,2) not null default 0,
  add column if not exists amount_collected      numeric(12,2) not null default 0,
  add column if not exists payment_type          text,
  add column if not exists lender_name           text,
  add column if not exists expected_funding_date date,
  add column if not exists lead_source           text,
  add column if not exists installed_on          date;

-- ── 1. The list of cost types (this is what "what kind of cost?" reads) ──
create table if not exists public.expense_categories (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null unique,
  bucket               text not null check (bucket in ('job_cost','overhead','owner_draw','tax_reserve')),
  excluded_from_ebitda boolean not null default false,
  is_active            boolean not null default true,
  sort_order           int not null default 100,
  created_at           timestamptz not null default now()
);

insert into public.expense_categories (name, bucket, excluded_from_ebitda, sort_order) values
  ('Shingles & materials',        'job_cost',    false, 10),
  ('Underlayment & accessories',  'job_cost',    false, 11),
  ('Labor / subs',                'job_cost',    false, 12),
  ('Dumpster & disposal',         'job_cost',    false, 13),
  ('Permits',                     'job_cost',    false, 14),
  ('Equipment rental',            'job_cost',    false, 15),
  ('Office rent',                 'overhead',    false, 30),
  ('Warehouse or yard rent',      'overhead',    false, 31),
  ('Utilities',                   'overhead',    false, 32),
  ('Internet',                    'overhead',    false, 33),
  ('Storage units',               'overhead',    false, 34),
  ('Staff pay (non-job)',         'overhead',    false, 40),
  ('Workers comp',                'overhead',    false, 41),
  ('Health insurance',            'overhead',    false, 42),
  ('Payroll taxes (employer)',    'overhead',    false, 43),
  ('General liability insurance', 'overhead',    false, 50),
  ('Vehicle insurance',           'overhead',    false, 51),
  ('Licensing & bonding',         'overhead',    false, 52),
  ('Warranty reserve',            'overhead',    false, 53),
  ('Fuel',                        'overhead',    false, 60),
  ('Vehicle maintenance',         'overhead',    false, 61),
  ('Tools & small equipment',     'overhead',    false, 62),
  ('Software / SaaS',             'overhead',    false, 70),
  ('Phone',                       'overhead',    false, 71),
  ('Accounting & legal',          'overhead',    false, 72),
  ('Bank & processing fees',      'overhead',    false, 73),
  ('Google Ads spend',            'overhead',    false, 80),
  ('Marketing retainer',          'overhead',    false, 81),
  ('Signs, wraps & print',        'overhead',    false, 82),
  ('Loan interest',               'overhead',    true,  90),
  ('Equipment financing interest','overhead',    true,  91),
  ('Depreciation',                'overhead',    true,  92),
  ('Owner draw',                  'owner_draw',  true,  95),
  ('Tax set-aside',               'tax_reserve', true,  96)
on conflict (name) do nothing;

-- ── 2. Fixed costs (rent, workers comp, warranty...) ──
create table if not exists public.recurring_expenses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  amount      numeric(12,2) not null default 0,
  category_id uuid references public.expense_categories(id),
  frequency   text not null default 'monthly'
              check (frequency in ('weekly','monthly','quarterly','annual')),
  starts_on   date not null default current_date,
  next_due_date date,
  autopay     boolean not null default false,
  is_active   boolean not null default true,
  created_by  uuid references auth.users,
  created_at  timestamptz not null default now()
);
-- if the table already existed without starts_on
alter table public.recurring_expenses add column if not exists starts_on date not null default current_date;

-- ── 3. One-off spending (the orange + button) ──
create table if not exists public.expenses (
  id             uuid primary key default gen_random_uuid(),
  date           date not null default current_date,
  amount         numeric(12,2) not null default 0,
  category_id    uuid references public.expense_categories(id),
  vendor         text,
  payment_method text,
  job_id         uuid references public.jobs(id) on delete set null,
  receipt_url    text,
  notes          text,
  created_by     uuid references auth.users,
  created_at     timestamptz not null default now()
);

-- ── 4. Security: everyone signed in can read/add; admins manage the money ──
alter table public.expense_categories enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.expenses           enable row level security;

drop policy if exists "read categories"      on public.expense_categories;
drop policy if exists "admin edits categories" on public.expense_categories;
drop policy if exists "admin only fixed costs" on public.recurring_expenses;
drop policy if exists "read expenses"        on public.expenses;
drop policy if exists "add expenses"         on public.expenses;
drop policy if exists "owner or admin removes expenses" on public.expenses;

create policy "read categories" on public.expense_categories
  for select to authenticated using (true);
create policy "admin edits categories" on public.expense_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admin only fixed costs" on public.recurring_expenses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read expenses" on public.expenses
  for select to authenticated using (true);
create policy "add expenses" on public.expenses
  for insert to authenticated with check (auth.uid() is not null);
create policy "owner or admin removes expenses" on public.expenses
  for delete to authenticated using (created_by = auth.uid() or public.is_admin());

-- ── 5. Tell the API about the new tables straight away ──
notify pgrst, 'reload schema';

-- ── 6. Proof it worked: you should see 3 rows and a category count ──
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('expense_categories','recurring_expenses','expenses')
 order by table_name;

select count(*) as categories_installed from public.expense_categories;
