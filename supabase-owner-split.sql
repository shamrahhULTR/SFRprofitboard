-- PROFIT BOARD: let a job be carved out of the company's 20% cut.
-- NULLABLE with no default on purpose: null = "use the name rule",
-- true/false = someone decided explicitly.
alter table public.jobs add column if not exists owner_cut_exempt boolean;

select name, owner_cut_exempt from public.jobs order by created_at desc;
