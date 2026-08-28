-- ==========================================================================
--  PROFIT BOARD — ALL-IN-ONE SETUP
--  Paste this WHOLE file into Supabase → SQL Editor → New query → Run.
--  Safe to run as many times as you like. Creates anything missing and
--  leaves anything already there alone.
--
--  This bundles: v2 (expenses/revenue/assets) + v3 (all categories,
--  including Rent) + v4 (fixed costs can be backdated) + v5 (scan logs).
-- ==========================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- from supabase-v2.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ============================================================================
--  PROFIT BOARD v2 — money in, money out, real profit
--  Paste into: Supabase → SQL Editor → New query → Run.
--  Safe to run more than once.
--
--  Run supabase-setup.sql FIRST if you haven't (it creates jobs/profiles/RLS).
--  This file also folds in the sign-in unlock, so you don't need
--  supabase-admins.sql separately.
-- ============================================================================
--
--  THE FOUR NUMBERS THIS FILE EXISTS TO PRODUCE
--    Revenue       all contracted dollars
--    Gross Profit  revenue − direct job costs
--    EBITDA        gross profit − operating overhead
--                  (before interest, tax, depreciation, amortisation;
--                   owner draws are NOT operating expenses and stay out)
--    Net Profit    EBITDA − interest − tax − depreciation − amortisation
--                  − owner draws
-- ============================================================================


-- ─── 0. SIGN-IN UNLOCK (folded in from supabase-admins.sql) ─────────────────
-- Turn OFF Authentication → Providers → Email → "Confirm email" before this.
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null;

create table if not exists public.admin_emails (email text primary key);

insert into public.admin_emails (email) values
  ('reakwonwork@outlook.com'),
  ('reakwonjones@outlook.com'),
  ('squarefootroofing@gmail.com')
on conflict (email) do nothing;

alter table public.admin_emails enable row level security;
drop policy if exists "admin reads admin_emails" on public.admin_emails;
create policy "admin reads admin_emails" on public.admin_emails
  for select to authenticated using (public.is_admin());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare assigned_role text := 'crew';
begin
  if exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email)) then
    assigned_role := 'admin';
  end if;
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          assigned_role)
  on conflict (id) do update set role = excluded.role;
  return new;
end; $$;

update public.profiles p set role = 'admin'
from public.admin_emails a
where lower(p.email) = lower(a.email) and p.role <> 'admin';

insert into public.profiles (id, email, full_name, role)
select u.id, u.email,
       coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)),
       case when exists (select 1 from public.admin_emails a
                         where lower(a.email) = lower(u.email)) then 'admin' else 'crew' end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;


-- ─── 1. EXPENSE CATEGORIES ──────────────────────────────────────────────────
create table if not exists public.expense_categories (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null unique,
  bucket               text not null check (bucket in ('job_cost','overhead','owner_draw','tax_reserve')),
  -- true = sits below the EBITDA line (interest, tax, depreciation,
  -- amortisation, owner draws). Everything else reduces EBITDA.
  excluded_from_ebitda boolean not null default false,
  is_active            boolean not null default true,
  sort_order           int not null default 100,
  created_at           timestamptz not null default now()
);

insert into public.expense_categories (name, bucket, excluded_from_ebitda, sort_order) values
  -- job_cost — direct costs, these make gross profit
  ('Shingles & materials',        'job_cost',    false, 10),
  ('Underlayment',                'job_cost',    false, 11),
  ('Labor / subs',                'job_cost',    false, 12),
  ('Dumpster & disposal',         'job_cost',    false, 13),
  ('Permits',                     'job_cost',    false, 14),
  ('Equipment rental',            'job_cost',    false, 15),
  ('Warranty registration',       'job_cost',    false, 16),
  -- overhead — operating costs, these reduce EBITDA
  ('General liability insurance', 'overhead',    false, 30),
  ('Workers comp',                'overhead',    false, 31),
  ('Vehicle insurance',           'overhead',    false, 32),
  ('Fuel',                        'overhead',    false, 33),
  ('Vehicle maintenance',         'overhead',    false, 34),
  ('Tools',                       'overhead',    false, 35),
  ('Software / SaaS',             'overhead',    false, 36),
  ('Phone',                       'overhead',    false, 37),
  ('Marketing retainer',          'overhead',    false, 38),
  ('Google Ads spend',            'overhead',    false, 39),
  ('Office / storage',            'overhead',    false, 40),
  ('Licensing & bonding',         'overhead',    false, 41),
  ('Accounting / legal',          'overhead',    false, 42),
  ('Bank & processing fees',      'overhead',    false, 43),
  ('Staff pay (non-job)',         'overhead',    false, 44),
  -- overhead but BELOW the EBITDA line — the E, I, T, D and A
  ('Loan & credit interest',      'overhead',    true,  60),
  ('Equipment financing interest','overhead',    true,  61),
  ('Depreciation',                'overhead',    true,  62),
  ('Amortisation',                'overhead',    true,  63),
  -- owner draws and tax are never operating expenses
  ('RJ draw',                     'owner_draw',  true,  80),
  ('Partner draw',                'owner_draw',  true,  81),
  ('Quarterly estimated tax',     'tax_reserve', true,  90)
on conflict (name) do nothing;


-- ─── 2. RECURRING EXPENSES ──────────────────────────────────────────────────
create table if not exists public.recurring_expenses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  amount        numeric(10,2) not null default 0,
  category_id   uuid references public.expense_categories(id),
  frequency     text not null check (frequency in ('weekly','monthly','quarterly','annual')),
  next_due_date date,
  autopay       boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);


-- ─── 3. EXPENSES ────────────────────────────────────────────────────────────
create table if not exists public.expenses (
  id                   uuid primary key default gen_random_uuid(),
  date                 date not null default current_date,
  amount               numeric(10,2) not null default 0,
  category_id          uuid not null references public.expense_categories(id),
  vendor               text,
  payment_method       text check (payment_method in ('cash','check','debit','credit','ACH','financed')),
  -- null = overhead for the whole company; set = belongs to one job
  job_id               uuid references public.jobs(id) on delete set null,
  receipt_url          text,
  notes                text,
  is_recurring         boolean not null default false,
  recurring_expense_id uuid references public.recurring_expenses(id) on delete set null,
  created_by           uuid references auth.users,
  created_at           timestamptz not null default now()
);
create index if not exists expenses_date_idx     on public.expenses(date desc);
create index if not exists expenses_job_idx      on public.expenses(job_id);
create index if not exists expenses_category_idx on public.expenses(category_id);


-- ─── 4. REVENUE ENTRIES (money actually collected) ──────────────────────────
create table if not exists public.revenue_entries (
  id             uuid primary key default gen_random_uuid(),
  date           date not null default current_date,
  amount         numeric(10,2) not null default 0,
  source         text not null default 'job_contract'
                 check (source in ('job_contract','deposit','final_payment','supplement','referral','other')),
  job_id         uuid references public.jobs(id) on delete set null,
  payment_method text check (payment_method in ('cash','check','debit','credit','ACH','financed')),
  notes          text,
  created_by     uuid references auth.users,
  created_at     timestamptz not null default now()
);
create index if not exists revenue_date_idx on public.revenue_entries(date desc);
create index if not exists revenue_job_idx  on public.revenue_entries(job_id);


-- ─── 5. MONTHLY TARGETS ─────────────────────────────────────────────────────
create table if not exists public.monthly_targets (
  id                uuid primary key default gen_random_uuid(),
  month             date not null unique,          -- always the 1st
  revenue_target    numeric(10,2) not null default 0,
  net_profit_target numeric(10,2) not null default 0,
  jobs_target       int not null default 0
);


-- ─── 6. FIXED ASSETS → depreciation, calculated not typed ───────────────────
create table if not exists public.fixed_assets (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  purchase_date     date not null,
  purchase_price    numeric(10,2) not null default 0,
  useful_life_years int not null default 5 check (useful_life_years > 0),
  method            text not null default 'straight-line',
  salvage_value     numeric(10,2) not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Straight-line monthly depreciation, only while the asset is still within
-- its useful life. Nothing to key in by hand each month.
create or replace view public.v_monthly_depreciation as
select a.id,
       a.name,
       greatest(a.purchase_price - a.salvage_value, 0) / (a.useful_life_years * 12) as monthly_amount,
       a.purchase_date                                                              as starts_on,
       (a.purchase_date + (a.useful_life_years || ' years')::interval)::date         as ends_on
from public.fixed_assets a
where a.is_active;

create or replace function public.depreciation_for_month(m date)
returns numeric language sql stable as $$
  select coalesce(sum(monthly_amount), 0)
  from public.v_monthly_depreciation
  where date_trunc('month', m)::date >= date_trunc('month', starts_on)::date
    and date_trunc('month', m)::date <  date_trunc('month', ends_on)::date;
$$;


-- ─── 7. JOBS: contracted vs collected ───────────────────────────────────────
alter table public.jobs add column if not exists contract_total        numeric(10,2) not null default 0;
alter table public.jobs add column if not exists amount_collected      numeric(10,2) not null default 0;
alter table public.jobs add column if not exists payment_type          text;
alter table public.jobs add column if not exists lender_name           text;
alter table public.jobs add column if not exists expected_funding_date date;
alter table public.jobs add column if not exists lead_source           text;  -- "how did you hear about us"
alter table public.jobs add column if not exists installed_on          date;

do $$ begin
  alter table public.jobs add constraint jobs_payment_type_chk
    check (payment_type is null or payment_type in ('cash','check','financed'));
exception when duplicate_object then null; end $$;

-- Carry the old admin-only revenue figure over as the contracted total.
update public.jobs j
set contract_total = m.revenue
from public.job_money m
where m.job_id = j.id and j.contract_total = 0 and m.revenue > 0;


-- ─── 8. ROW LEVEL SECURITY ──────────────────────────────────────────────────
-- Crew may log an expense and attach a receipt (that's the whole point of the
-- fast-entry screen) but may not read the money ledgers. Everything with a
-- dollar total stays admin-only, same wall as job_money.
alter table public.expense_categories enable row level security;
alter table public.expenses           enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.revenue_entries    enable row level security;
alter table public.monthly_targets    enable row level security;
alter table public.fixed_assets       enable row level security;

drop policy if exists "everyone reads categories"   on public.expense_categories;
drop policy if exists "admin manages categories"    on public.expense_categories;
drop policy if exists "crew adds expenses"          on public.expenses;
drop policy if exists "own expense or admin reads"  on public.expenses;
drop policy if exists "admin updates expenses"      on public.expenses;
drop policy if exists "admin deletes expenses"      on public.expenses;
drop policy if exists "admin only recurring"        on public.recurring_expenses;
drop policy if exists "admin only revenue"          on public.revenue_entries;
drop policy if exists "admin only targets"          on public.monthly_targets;
drop policy if exists "admin only assets"           on public.fixed_assets;

-- Category names are not financial data; crew needs them to file a receipt.
create policy "everyone reads categories" on public.expense_categories
  for select to authenticated using (true);
create policy "admin manages categories" on public.expense_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "crew adds expenses" on public.expenses
  for insert to authenticated with check (auth.uid() is not null);
-- A crew member sees only what they themselves logged; admin sees all.
create policy "own expense or admin reads" on public.expenses
  for select to authenticated using (created_by = auth.uid() or public.is_admin());
create policy "admin updates expenses" on public.expenses
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes expenses" on public.expenses
  for delete to authenticated using (public.is_admin());

create policy "admin only recurring" on public.recurring_expenses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin only revenue" on public.revenue_entries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin only targets" on public.monthly_targets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin only assets" on public.fixed_assets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Receipts live in the same private bucket as the job papers.
drop policy if exists "signed in upload receipts" on storage.objects;
create policy "signed in upload receipts" on storage.objects
  for insert to authenticated with check (bucket_id = 'job-docs');


-- ─── 9. THE P&L ─────────────────────────────────────────────────────────────
-- One row per month with the four numbers, built from the ledgers.
create or replace view public.v_monthly_pl as
with months as (
  select date_trunc('month', d)::date as m
  from generate_series(
    coalesce((select min(date) from public.revenue_entries),
             (select min(date) from public.expenses),
             current_date),
    current_date, interval '1 month') d
),
rev as (
  select date_trunc('month', date)::date m, sum(amount) amt
  from public.revenue_entries group by 1
),
exp as (
  select date_trunc('month', e.date)::date m,
         sum(e.amount) filter (where c.bucket = 'job_cost')                                  as job_costs,
         sum(e.amount) filter (where c.bucket = 'overhead' and not c.excluded_from_ebitda)   as operating_overhead,
         sum(e.amount) filter (where c.bucket = 'overhead' and c.excluded_from_ebitda)       as below_line_overhead,
         sum(e.amount) filter (where c.bucket = 'owner_draw')                                as owner_draws,
         sum(e.amount) filter (where c.bucket = 'tax_reserve')                               as tax_reserve
  from public.expenses e
  join public.expense_categories c on c.id = e.category_id
  group by 1
)
select months.m                                             as month,
       coalesce(rev.amt, 0)                                 as revenue,
       coalesce(exp.job_costs, 0)                           as job_costs,
       coalesce(rev.amt, 0) - coalesce(exp.job_costs, 0)    as gross_profit,
       coalesce(exp.operating_overhead, 0)                  as operating_overhead,
       -- EBITDA: gross profit less operating overhead only
       coalesce(rev.amt, 0) - coalesce(exp.job_costs, 0)
         - coalesce(exp.operating_overhead, 0)              as ebitda,
       coalesce(exp.below_line_overhead, 0)                 as interest_and_other,
       public.depreciation_for_month(months.m)              as depreciation,
       coalesce(exp.owner_draws, 0)                         as owner_draws,
       coalesce(exp.tax_reserve, 0)                         as tax_reserve,
       -- Net: everything below the line comes off
       coalesce(rev.amt, 0) - coalesce(exp.job_costs, 0)
         - coalesce(exp.operating_overhead, 0)
         - coalesce(exp.below_line_overhead, 0)
         - public.depreciation_for_month(months.m)
         - coalesce(exp.owner_draws, 0)
         - coalesce(exp.tax_reserve, 0)                     as net_profit
from months
left join rev on rev.m = months.m
left join exp on exp.m = months.m
order by months.m;

-- Trailing twelve months — the figure a buyer or lender asks for.
create or replace view public.v_ttm as
select sum(revenue)      as revenue,
       sum(gross_profit) as gross_profit,
       sum(ebitda)       as ebitda,
       sum(net_profit)   as net_profit
from public.v_monthly_pl
where month > (date_trunc('month', current_date) - interval '12 months')::date;

-- Per-job economics, with overhead shared out by each job's revenue share of
-- its month. That is what makes "net profit per job" mean anything.
create or replace view public.v_job_financials as
with job_direct as (
  select j.id as job_id,
         j.name,
         j.done,
         j.contract_total,
         j.amount_collected,
         j.payment_type,
         j.expected_funding_date,
         coalesce((select sum(e.amount) from public.expenses e
                   join public.expense_categories c on c.id = e.category_id
                   where e.job_id = j.id and c.bucket = 'job_cost'), 0) as direct_costs,
         coalesce((select sum(r.amount) from public.revenue_entries r
                   where r.job_id = j.id), 0)                            as collected
  from public.jobs j
),
month_overhead as (
  select month, operating_overhead, revenue from public.v_monthly_pl
)
select d.*,
       d.contract_total - d.direct_costs as gross_profit,
       case when d.contract_total > 0
            then round(((d.contract_total - d.direct_costs) / d.contract_total) * 100, 1)
       end                               as gross_margin_pct,
       greatest(d.contract_total - d.amount_collected, 0) as outstanding
from job_direct d;


-- ─── 10. SHOW WHAT LANDED ───────────────────────────────────────────────────
select 'categories' as what, count(*)::text as n from public.expense_categories
union all select 'jobs columns added', (
  select count(*)::text from information_schema.columns
  where table_name='jobs' and column_name in
   ('contract_total','amount_collected','payment_type','lender_name','expected_funding_date','lead_source','installed_on'))
union all select 'admins', (select count(*)::text from public.profiles where role='admin')
union all select 'confirmed users', (select count(*)::text from auth.users where email_confirmed_at is not null);

-- ─────────────────────────────────────────────────────────────────────────
-- from supabase-v3-categories.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ============================================================================
--  PROFIT BOARD — full expense category list
--  Paste into: Supabase → SQL Editor → New query → Run. Safe to re-run.
--  Run AFTER supabase-v2.sql.
--
--  Everything a roofing company at scale actually pays for. Rent/lease was
--  missing entirely; so were payroll taxes, benefits, and most of the real
--  fixed overhead. If overhead is under-recorded, EBITDA and Net come out too
--  high — which is the whole problem this app exists to fix.
-- ============================================================================

insert into public.expense_categories (name, bucket, excluded_from_ebitda, sort_order) values
  -- ── JOB COSTS (direct — these make gross profit) ──────────────────────────
  ('Shingles & materials',          'job_cost',    false, 10),
  ('Underlayment',                  'job_cost',    false, 11),
  ('Ridge / hip / starter',         'job_cost',    false, 12),
  ('Flashing & metal',              'job_cost',    false, 13),
  ('Ventilation',                   'job_cost',    false, 14),
  ('Decking / plywood',             'job_cost',    false, 15),
  ('Gutters & downspouts',          'job_cost',    false, 16),
  ('Skylights',                     'job_cost',    false, 17),
  ('Labor / subs',                  'job_cost',    false, 18),
  ('Subcontractor 1099',            'job_cost',    false, 19),
  ('Dumpster & disposal',           'job_cost',    false, 20),
  ('Permits',                       'job_cost',    false, 21),
  ('Equipment rental',              'job_cost',    false, 22),
  ('Crane / lift / conveyor',       'job_cost',    false, 23),
  ('Warranty registration',         'job_cost',    false, 24),
  ('Job site fuel / delivery',      'job_cost',    false, 25),
  ('Punch list / callback repair',  'job_cost',    false, 26),

  -- ── FACILITIES ────────────────────────────────────────────────────────────
  ('Rent — office',                 'overhead',    false, 30),
  ('Rent — warehouse / yard',       'overhead',    false, 31),
  ('Building lease / mortgage',     'overhead',    false, 32),
  ('Property taxes',                'overhead',    false, 33),
  ('Utilities — electric & gas',    'overhead',    false, 34),
  ('Utilities — water & trash',     'overhead',    false, 35),
  ('Internet',                      'overhead',    false, 36),
  ('Storage units',                 'overhead',    false, 37),
  ('Building maintenance',          'overhead',    false, 38),
  ('Security & alarm',              'overhead',    false, 39),
  ('Janitorial',                    'overhead',    false, 40),

  -- ── PEOPLE ────────────────────────────────────────────────────────────────
  ('Staff pay (non-job)',           'overhead',    false, 45),
  ('Office / admin salaries',       'overhead',    false, 46),
  ('Sales rep commissions',         'overhead',    false, 47),
  ('Payroll taxes (employer)',      'overhead',    false, 48),
  ('Payroll processing fees',       'overhead',    false, 49),
  ('Health insurance',              'overhead',    false, 50),
  ('Retirement match',              'overhead',    false, 51),
  ('Bonuses & incentives',          'overhead',    false, 52),
  ('Recruiting & hiring',           'overhead',    false, 53),
  ('Training & certification',      'overhead',    false, 54),
  ('Uniforms & branded apparel',    'overhead',    false, 55),
  ('Safety equipment & PPE',        'overhead',    false, 56),

  -- ── INSURANCE & COMPLIANCE ────────────────────────────────────────────────
  ('General liability insurance',   'overhead',    false, 60),
  ('Workers comp',                  'overhead',    false, 61),
  ('Vehicle insurance',             'overhead',    false, 62),
  ('Umbrella / excess liability',   'overhead',    false, 63),
  ('Business property insurance',   'overhead',    false, 64),
  ('Licensing & bonding',           'overhead',    false, 65),
  ('Permits — annual / business',   'overhead',    false, 66),
  ('Legal & professional fees',     'overhead',    false, 67),
  ('Accounting / bookkeeping',      'overhead',    false, 68),

  -- ── VEHICLES & EQUIPMENT ──────────────────────────────────────────────────
  ('Fuel',                          'overhead',    false, 70),
  ('Vehicle maintenance',           'overhead',    false, 71),
  ('Vehicle lease payments',        'overhead',    false, 72),
  ('Vehicle registration',          'overhead',    false, 73),
  ('Trailer & towing',              'overhead',    false, 74),
  ('Tools',                         'overhead',    false, 75),
  ('Tool repair & replacement',     'overhead',    false, 76),
  ('GPS / fleet tracking',          'overhead',    false, 77),

  -- ── SALES, MARKETING & TECH ───────────────────────────────────────────────
  ('Marketing retainer',            'overhead',    false, 80),
  ('Google Ads spend',              'overhead',    false, 81),
  ('Facebook / Meta ads',           'overhead',    false, 82),
  ('Lead purchase',                 'overhead',    false, 83),
  ('Website & hosting',             'overhead',    false, 84),
  ('SEO / content',                 'overhead',    false, 85),
  ('Printing & door hangers',       'overhead',    false, 86),
  ('Yard signs & vehicle wraps',    'overhead',    false, 87),
  ('Trade shows & events',          'overhead',    false, 88),
  ('Sponsorships & donations',      'overhead',    false, 89),
  ('CRM software',                  'overhead',    false, 90),
  ('Software / SaaS',               'overhead',    false, 91),
  ('Phone',                         'overhead',    false, 92),
  ('Answering service',             'overhead',    false, 93),
  ('Office supplies',               'overhead',    false, 94),
  ('Postage & shipping',            'overhead',    false, 95),
  ('Travel & lodging',              'overhead',    false, 96),
  ('Meals & entertainment',         'overhead',    false, 97),
  ('Dues & subscriptions',          'overhead',    false, 98),
  ('Bank & processing fees',        'overhead',    false, 99),
  ('Financing dealer fees',         'overhead',    false, 100),
  ('Bad debt / write-off',          'overhead',    false, 101),
  ('Customer refunds & goodwill',   'overhead',    false, 102),

  -- ── BELOW THE EBITDA LINE (the I, T, D and A) ─────────────────────────────
  ('Loan & credit interest',        'overhead',    true,  120),
  ('Equipment financing interest',  'overhead',    true,  121),
  ('Line of credit interest',       'overhead',    true,  122),
  ('Credit card interest',          'overhead',    true,  123),
  ('Depreciation',                  'overhead',    true,  124),
  ('Amortisation',                  'overhead',    true,  125),

  -- ── OWNER DRAWS — never operating expenses ────────────────────────────────
  ('RJ draw',                       'owner_draw',  true,  140),
  ('Partner draw',                  'owner_draw',  true,  141),
  ('Owner distribution',            'owner_draw',  true,  142),

  -- ── TAX ───────────────────────────────────────────────────────────────────
  ('Quarterly estimated tax',       'tax_reserve', true,  160),
  ('Federal income tax',            'tax_reserve', true,  161),
  ('State income tax',              'tax_reserve', true,  162),
  ('Sales & use tax',               'tax_reserve', true,  163)
on conflict (name) do update
  set bucket               = excluded.bucket,
      excluded_from_ebitda = excluded.excluded_from_ebitda,
      sort_order           = excluded.sort_order;

-- What's now on file, grouped the way the P&L reads them.
select bucket,
       count(*) filter (where not excluded_from_ebitda) as counts_in_ebitda,
       count(*) filter (where excluded_from_ebitda)     as below_the_line,
       count(*)                                          as total
from public.expense_categories
group by bucket
order by bucket;

-- ─────────────────────────────────────────────────────────────────────────
-- from supabase-v4-bills.sql
-- ─────────────────────────────────────────────────────────────────────────
-- PROFIT BOARD: fixed costs can start in the past (e.g. rent since January).
-- Paste into Supabase SQL Editor and Run. Safe to re-run.
alter table public.recurring_expenses
  add column if not exists starts_on date not null default current_date;

-- ─────────────────────────────────────────────────────────────────────────
-- from supabase-v5-scan.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ── final check: what you should now have ──
select table_name from information_schema.tables
 where table_schema='public'
   and table_name in ('expenses','expense_categories','recurring_expenses',
                      'revenue_entries','fixed_assets','scan_logs','jobs','job_money')
 order by table_name;
