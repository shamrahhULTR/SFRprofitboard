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
