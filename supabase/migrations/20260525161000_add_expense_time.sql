ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS expense_time TIME WITHOUT TIME ZONE;

UPDATE public.expenses
SET expense_time = COALESCE(expense_time, created_at::time)
WHERE expense_time IS NULL;
