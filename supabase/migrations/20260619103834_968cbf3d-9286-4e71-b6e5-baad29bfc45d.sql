DROP POLICY IF EXISTS "Members can view their books" ON public.expense_books;

CREATE POLICY "Members and creators can view their books"
ON public.expense_books
FOR SELECT
TO authenticated
USING (private.is_book_member(auth.uid(), id) OR created_by = auth.uid());