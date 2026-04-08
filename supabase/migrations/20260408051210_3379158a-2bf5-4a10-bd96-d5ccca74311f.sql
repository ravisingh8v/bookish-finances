
-- expense_books: SELECT only for members
CREATE POLICY "Members can view their books" ON public.expense_books
  FOR SELECT TO authenticated
  USING (public.is_book_member(auth.uid(), id));

-- expense_books: UPDATE only for owners
CREATE POLICY "Owners can update books" ON public.expense_books
  FOR UPDATE TO authenticated
  USING (public.is_book_owner(auth.uid(), id));

-- expense_books: DELETE only for owners
CREATE POLICY "Owners can delete books" ON public.expense_books
  FOR DELETE TO authenticated
  USING (public.is_book_owner(auth.uid(), id));

-- book_members: SELECT for members of the book
CREATE POLICY "Members can view book members" ON public.book_members
  FOR SELECT TO authenticated
  USING (public.is_book_member(auth.uid(), book_id));

-- book_members: INSERT for owners (or self via auto-add on book create)
CREATE POLICY "Owners can add members" ON public.book_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_book_owner(auth.uid(), book_id) OR auth.uid() = user_id);

-- book_members: UPDATE role only for owners
CREATE POLICY "Owners can update member roles" ON public.book_members
  FOR UPDATE TO authenticated
  USING (public.is_book_owner(auth.uid(), book_id));

-- book_members: DELETE for owners or self-leave
CREATE POLICY "Owners or self can remove members" ON public.book_members
  FOR DELETE TO authenticated
  USING (public.is_book_owner(auth.uid(), book_id) OR auth.uid() = user_id);
