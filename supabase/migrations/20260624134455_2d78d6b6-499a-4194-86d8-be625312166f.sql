CREATE TABLE public.split_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  split_bill_id UUID NOT NULL REFERENCES public.split_bills(id) ON DELETE CASCADE,
  split_participant_id UUID NOT NULL REFERENCES public.split_participants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.split_payments TO authenticated;
GRANT ALL ON public.split_payments TO service_role;

ALTER TABLE public.split_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View split payments"
ON public.split_payments FOR SELECT
TO authenticated
USING (
  private.is_split_owner(auth.uid(), split_bill_id)
  OR user_id = auth.uid()
);

CREATE POLICY "Create own split payments"
ON public.split_payments FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Delete own split payments"
ON public.split_payments FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR private.is_split_owner(auth.uid(), split_bill_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.split_payments;