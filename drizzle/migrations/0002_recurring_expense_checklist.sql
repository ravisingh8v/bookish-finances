CREATE TABLE public.recurring_expense_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  amount numeric(12,2),
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_expense_checklist_items TO authenticated;
GRANT ALL ON public.recurring_expense_checklist_items TO service_role;

ALTER TABLE public.recurring_expense_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own recurring checklist items"
ON public.recurring_expense_checklist_items
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.recurring_expense_checklist_completions (
  item_id uuid NOT NULL REFERENCES public.recurring_expense_checklist_items(id) ON DELETE CASCADE,
  month_start date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, month_start)
);

GRANT SELECT, INSERT, DELETE ON public.recurring_expense_checklist_completions TO authenticated;
GRANT ALL ON public.recurring_expense_checklist_completions TO service_role;

ALTER TABLE public.recurring_expense_checklist_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own recurring checklist completions"
ON public.recurring_expense_checklist_completions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.recurring_expense_checklist_items i
    WHERE i.id = item_id AND i.user_id = auth.uid()
  )
);

CREATE POLICY "Users complete own recurring checklist items"
ON public.recurring_expense_checklist_completions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.recurring_expense_checklist_items i
    WHERE i.id = item_id AND i.user_id = auth.uid()
  )
);

CREATE POLICY "Users reset own recurring checklist items"
ON public.recurring_expense_checklist_completions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.recurring_expense_checklist_items i
    WHERE i.id = item_id AND i.user_id = auth.uid()
  )
);

CREATE INDEX recurring_expense_checklist_user_order_idx
ON public.recurring_expense_checklist_items (user_id, sort_order, created_at);

NOTIFY pgrst, 'reload schema';