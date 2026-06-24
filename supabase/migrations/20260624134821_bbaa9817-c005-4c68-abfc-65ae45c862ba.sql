CREATE OR REPLACE FUNCTION private.is_split_email_participant(_user_id uuid, _bill_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.split_participants sp
    JOIN public.profiles pr ON lower(pr.email) = lower(sp.email)
    WHERE sp.split_bill_id = _bill_id
      AND pr.user_id = _user_id
  )
$$;

-- Allow email-matched participants to view bills
DROP POLICY IF EXISTS "View own or participating split bills" ON public.split_bills;
CREATE POLICY "View own or participating split bills"
ON public.split_bills FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR private.is_split_participant(auth.uid(), id)
  OR private.is_split_email_participant(auth.uid(), id)
);

-- Allow email-matched participants to view participant rows
DROP POLICY IF EXISTS "View split participants" ON public.split_participants;
CREATE POLICY "View split participants"
ON public.split_participants FOR SELECT
TO authenticated
USING (
  private.is_split_owner(auth.uid(), split_bill_id)
  OR user_id = auth.uid()
  OR private.is_split_email_participant(auth.uid(), split_bill_id)
);

-- Allow email-matched participants to update their participant row (e.g. claim/settle)
DROP POLICY IF EXISTS "Owner or self updates participant" ON public.split_participants;
CREATE POLICY "Owner or self updates participant"
ON public.split_participants FOR UPDATE
TO authenticated
USING (
  private.is_split_owner(auth.uid(), split_bill_id)
  OR user_id = auth.uid()
  OR private.is_split_email_participant(auth.uid(), split_bill_id)
);

-- Allow email-matched participants to view payments
DROP POLICY IF EXISTS "View split payments" ON public.split_payments;
CREATE POLICY "View split payments"
ON public.split_payments FOR SELECT
TO authenticated
USING (
  private.is_split_owner(auth.uid(), split_bill_id)
  OR user_id = auth.uid()
  OR private.is_split_email_participant(auth.uid(), split_bill_id)
);