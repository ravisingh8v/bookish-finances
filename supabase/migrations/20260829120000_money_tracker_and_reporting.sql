ALTER TABLE public.expense_books
ADD COLUMN IF NOT EXISTS include_in_reports boolean NOT NULL DEFAULT true;

ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS source_type text,
ADD COLUMN IF NOT EXISTS source_id uuid,
ADD COLUMN IF NOT EXISTS source_occurrence_date date;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_source_occurrence_unique
ON public.expenses (source_type, source_id, source_occurrence_date)
WHERE source_type IS NOT NULL AND source_id IS NOT NULL AND source_occurrence_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.money_tracker_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('investment', 'recurring_expense', 'emi')),
  name text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'monthly',
  schedule_day integer CHECK (schedule_day BETWEEN 1 AND 31),
  start_date date,
  end_date date,
  active boolean NOT NULL DEFAULT true,
  automation_preference text NOT NULL DEFAULT 'track_only' CHECK (automation_preference IN ('track_only', 'reminder', 'auto_entry')),
  target_book_id uuid REFERENCES public.expense_books(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  account text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_processed_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.money_tracker_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own money tracker items" ON public.money_tracker_items;
CREATE POLICY "Users manage own money tracker items"
ON public.money_tracker_items
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.money_tracker_items TO authenticated;
GRANT ALL ON public.money_tracker_items TO service_role;

DROP TRIGGER IF EXISTS update_money_tracker_items_updated_at ON public.money_tracker_items;
CREATE TRIGGER update_money_tracker_items_updated_at
BEFORE UPDATE ON public.money_tracker_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
