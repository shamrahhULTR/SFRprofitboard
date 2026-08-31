-- PROFIT BOARD: copy revenue into the new jobs.contract_total column.
-- Adding the column defaulted it to 0; the real figures live in job_money.
-- Safe to run more than once.

update public.jobs j
   set contract_total = m.revenue
  from public.job_money m
 where m.job_id = j.id
   and m.revenue > 0
   and coalesce(j.contract_total, 0) = 0;

-- Proof: every job with its revenue and costs.
select j.name,
       j.contract_total,
       m.revenue,
       (m.material + m.labor + m.dumpster) as job_costs
  from public.jobs j
  left join public.job_money m on m.job_id = j.id
 order by j.created_at desc;
