CREATE TABLE public.split_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  split_bill_id uuid NOT NULL REFERENCES public.split_bills(id) ON DELETE CASCADE,
  split_participant_id uuid NOT NULL REFERENCES public.split_participants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.split_payments TO authenticated;
GRANT ALL ON public.split_payments TO service_role;

CREATE OR REPLACE FUNCTION private.is_split_payment_owner(_uid uuid, _participant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.split_participants
    WHERE id = _participant AND user_id = _uid
  )
$$;

ALTER TABLE public.split_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own or split payment" ON public.split_payments
  FOR SELECT TO authenticated
  USING (
    private.is_split_owner(auth.uid(), split_bill_id)
    OR user_id = auth.uid()
  );

CREATE POLICY "Create own split payment" ON public.split_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND private.is_split_payment_owner(auth.uid(), split_participant_id)
  );

CREATE POLICY "Update own split payment" ON public.split_payments
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
  )
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Delete own split payment" ON public.split_payments
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
  );

CREATE TRIGGER update_split_payments_updated_at BEFORE UPDATE ON public.split_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.split_payments;
