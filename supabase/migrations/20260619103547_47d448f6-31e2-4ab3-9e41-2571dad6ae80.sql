CREATE POLICY "Users can create own custom categories"
ON public.categories
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid() AND is_default = false AND book_id IS NULL);

DROP FUNCTION IF EXISTS public.is_book_owner(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_book_member(uuid, uuid);