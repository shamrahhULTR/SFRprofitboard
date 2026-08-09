-- ============================================================================
--  PROFIT BOARD — unlock sign-in and set the admins
--  Paste into: Supabase → SQL Editor → New query → Run.
--  Safe to run more than once.
-- ============================================================================
--  BEFORE running this, flip the setting that caused the lockout:
--    Authentication → Providers → Email → untick "Confirm email" → Save
--  With it on, every signup tries to send mail, which trips the rate limit and
--  leaves the account unconfirmed (that's why the password looked wrong).
-- ============================================================================


-- ─── 1. Unstick every account that got stranded unconfirmed ─────────────────
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null;


-- ─── 2. A list of who is automatically an admin ─────────────────────────────
-- Put someone here BEFORE they sign up and they arrive as admin — no second
-- step, no waiting for them to register first.
create table if not exists public.admin_emails (
  email text primary key
);

insert into public.admin_emails (email) values
  ('reakwonwork@outlook.com'),
  ('reakwonjones@outlook.com'),
  ('squarefootroofing@gmail.com')
on conflict (email) do nothing;

alter table public.admin_emails enable row level security;
drop policy if exists "admin reads admin_emails" on public.admin_emails;
create policy "admin reads admin_emails" on public.admin_emails
  for select to authenticated using (public.is_admin());


-- ─── 3. New signups check that list ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  assigned_role text := 'crew';
begin
  if exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email)) then
    assigned_role := 'admin';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    assigned_role
  )
  on conflict (id) do update set role = excluded.role;

  return new;
end;
$$;


-- ─── 4. Promote anyone already signed up who is on the list ─────────────────
update public.profiles p
set role = 'admin'
from public.admin_emails a
where lower(p.email) = lower(a.email)
  and p.role <> 'admin';

-- Catch accounts that exist in auth but never got a profile row.
insert into public.profiles (id, email, full_name, role)
select u.id,
       u.email,
       coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       case when exists (select 1 from public.admin_emails a
                         where lower(a.email) = lower(u.email))
            then 'admin' else 'crew' end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;


-- ─── 5. Show the result ─────────────────────────────────────────────────────
select p.email,
       p.role,
       (u.email_confirmed_at is not null) as confirmed,
       (u.encrypted_password is not null and u.encrypted_password <> '') as has_password
from public.profiles p
join auth.users u on u.id = p.id
order by p.role, p.email;
