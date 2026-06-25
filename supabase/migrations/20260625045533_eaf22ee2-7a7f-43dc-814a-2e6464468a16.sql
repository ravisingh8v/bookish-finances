DROP POLICY IF EXISTS "Update own split payment" ON public.split_payments;
CREATE POLICY "Update own or owned split payment" ON public.split_payments
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR private.is_split_owner(auth.uid(), split_bill_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR private.is_split_owner(auth.uid(), split_bill_id)
  );

DROP POLICY IF EXISTS "Delete own split payment" ON public.split_payments;
CREATE POLICY "Delete own or owned split payment" ON public.split_payments
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR private.is_split_owner(auth.uid(), split_bill_id)
  );