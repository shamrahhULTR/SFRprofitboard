-- ============================================================================
--  PROFIT BOARD, fix the garbled category names.
--  The em dash in "Rent — office" got mangled on the way into the database
--  and now renders as "Rent ,Äî office". Renaming to plain text so it cannot
--  happen again. Safe to run more than once.
-- ============================================================================

update public.expense_categories
   set name = 'Office rent'
 where name like 'Rent%office%' or name like '%office rent%';

update public.expense_categories
   set name = 'Warehouse or yard rent'
 where name like 'Rent%warehouse%' or name like '%warehouse%yard%';

-- Catch anything else carrying the mangled sequence.
update public.expense_categories
   set name = replace(replace(name, '‚Äî', '-'), '  ', ' ')
 where name like '%‚Äî%';

select name, bucket from public.expense_categories order by sort_order;
