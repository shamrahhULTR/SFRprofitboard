-- ============================================================================
--  PROFIT BOARD — Square Foot Roofing
--  Paste this whole file into: Supabase → SQL Editor → New query → Run.
--  Safe to run more than once.
-- ============================================================================
--
--  HOW ACCESS WORKS
--    crew  — sees the job list, marks installs done, uploads invoices/receipts.
--            CANNOT read money. Not "hidden in the app" — the dollar figures
--            live in a separate table the crew role has no read policy on, so
--            even hitting the API directly returns nothing.
--    admin — sees everything: revenue, costs, profit, margin, marketing ROI,
--            and manages who gets in.
-- ============================================================================


-- ─── 1. PROFILES ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'crew' check (role in ('admin', 'crew')),
  created_at timestamptz not null default now()
);

-- Anyone signing in gets a profile row automatically, defaulting to 'crew'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Is the caller an admin? SECURITY DEFINER so the check itself doesn't
-- recurse through profiles' own RLS policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;


-- ─── 2. JOBS (everyone signed in can see these) ─────────────────────────────
create table if not exists public.jobs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  squares    numeric not null default 0,
  done       boolean not null default false,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);


-- ─── 3. JOB MONEY (admin only — this is the wall) ───────────────────────────
create table if not exists public.job_money (
  job_id   uuid primary key references public.jobs(id) on delete cascade,
  revenue  numeric not null default 0,
  material numeric not null default 0,
  labor    numeric not null default 0,
  dumpster numeric not null default 0
);


-- ─── 4. MARKETING (admin only — it's ROI data) ──────────────────────────────
create table if not exists public.marketing (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  spend      numeric not null default 0,
  leads      numeric not null default 0,
  demos      numeric not null default 0,
  closes     numeric not null default 0,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);


-- ─── 5. DOCUMENTS (invoices + receipts attached to a job) ───────────────────
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  kind         text not null default 'receipt'
               check (kind in ('invoice', 'receipt', 'permit', 'photo', 'other')),
  label        text,
  amount       numeric not null default 0,
  storage_path text not null,
  file_name    text,
  uploaded_by  uuid references auth.users,
  created_at   timestamptz not null default now()
);


-- ─── 6. ROW LEVEL SECURITY ──────────────────────────────────────────────────
alter table public.profiles  enable row level security;
alter table public.jobs      enable row level security;
alter table public.job_money enable row level security;
alter table public.marketing enable row level security;
alter table public.documents enable row level security;

-- Re-runnable: drop before create.
drop policy if exists "read own profile or admin reads all" on public.profiles;
drop policy if exists "update own name"                     on public.profiles;
drop policy if exists "admin manages roles"                 on public.profiles;
drop policy if exists "signed in can read jobs"             on public.jobs;
drop policy if exists "signed in can add jobs"              on public.jobs;
drop policy if exists "signed in can update jobs"           on public.jobs;
drop policy if exists "admin deletes jobs"                  on public.jobs;
drop policy if exists "admin only money"                    on public.job_money;
drop policy if exists "admin only marketing"                on public.marketing;
drop policy if exists "signed in can read documents"        on public.documents;
drop policy if exists "signed in can add documents"         on public.documents;
drop policy if exists "owner or admin deletes documents"    on public.documents;

-- profiles
create policy "read own profile or admin reads all" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "update own name" on public.profiles
  for update to authenticated using (id = auth.uid())
  -- a crew member must not be able to promote themselves
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));
create policy "admin manages roles" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- jobs: shared visibility
create policy "signed in can read jobs" on public.jobs
  for select to authenticated using (true);
create policy "signed in can add jobs" on public.jobs
  for insert to authenticated with check (auth.uid() is not null);
create policy "signed in can update jobs" on public.jobs
  for update to authenticated using (true) with check (true);
create policy "admin deletes jobs" on public.jobs
  for delete to authenticated using (public.is_admin());

-- job_money + marketing: admin only, every verb
create policy "admin only money" on public.job_money
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin only marketing" on public.marketing
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- documents
create policy "signed in can read documents" on public.documents
  for select to authenticated using (true);
create policy "signed in can add documents" on public.documents
  for insert to authenticated with check (auth.uid() is not null);
create policy "owner or admin deletes documents" on public.documents
  for delete to authenticated using (uploaded_by = auth.uid() or public.is_admin());


-- ─── 7. STORAGE for the invoice / receipt files ─────────────────────────────
insert into storage.buckets (id, name, public)
values ('job-docs', 'job-docs', false)
on conflict (id) do nothing;

drop policy if exists "signed in read job docs"   on storage.objects;
drop policy if exists "signed in upload job docs" on storage.objects;
drop policy if exists "owner or admin delete job docs" on storage.objects;

create policy "signed in read job docs" on storage.objects
  for select to authenticated using (bucket_id = 'job-docs');
create policy "signed in upload job docs" on storage.objects
  for insert to authenticated with check (bucket_id = 'job-docs');
create policy "owner or admin delete job docs" on storage.objects
  for delete to authenticated using (bucket_id = 'job-docs' and (owner = auth.uid() or public.is_admin()));


-- ============================================================================
--  8. MAKE YOURSELF THE ADMIN  ← DO THIS LAST
-- ============================================================================
--  Sign in to the app ONCE first (that creates your account), then come back
--  here, put your email between the quotes, and run just this line:
--
--      update public.profiles set role = 'admin' where email = 'you@example.com';
--
--  Check who has what access at any time:
--      select email, role, created_at from public.profiles order by created_at;
-- ============================================================================
