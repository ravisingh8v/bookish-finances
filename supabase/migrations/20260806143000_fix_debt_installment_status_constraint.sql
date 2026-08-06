-- Keep debt payment compatible with older deployed RPC bodies that inserted
-- `pending` for rebuilt installments. Newer code uses `upcoming`, but allowing
-- both prevents check-constraint failures on partially upgraded databases.
alter table if exists public.debt_installments
  drop constraint if exists debt_installments_status_check;

alter table if exists public.debt_installments
  add constraint debt_installments_status_check
  check (status in ('upcoming', 'pending', 'partially_paid', 'paid', 'overdue'));
