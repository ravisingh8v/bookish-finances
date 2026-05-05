DROP POLICY IF EXISTS "View categories" ON public.categories;
DROP POLICY IF EXISTS "Create categories" ON public.categories;
DROP POLICY IF EXISTS "Update own categories" ON public.categories;
DROP POLICY IF EXISTS "Delete own categories" ON public.categories;

CREATE POLICY "View categories"
ON public.categories
FOR SELECT
TO authenticated
USING (
  is_default = true
  OR created_by = auth.uid()
  OR (book_id IS NOT NULL AND public.is_book_member(auth.uid(), book_id))
);

CREATE POLICY "Create categories"
ON public.categories
FOR INSERT
TO authenticated
WITH CHECK (
  (
    book_id IS NULL
    AND created_by = auth.uid()
    AND is_default = false
  )
  OR (
    book_id IS NOT NULL
    AND public.is_book_member(auth.uid(), book_id)
  )
);

CREATE POLICY "Update own categories"
ON public.categories
FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Delete own categories"
ON public.categories
FOR DELETE
TO authenticated
USING (created_by = auth.uid() AND is_default = false);
