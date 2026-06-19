CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_book_owner(_user_id uuid, _book_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.book_members
    WHERE user_id = _user_id
      AND book_id = _book_id
      AND role = 'owner'
  )
$$;

CREATE OR REPLACE FUNCTION private.is_book_member(_user_id uuid, _book_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.book_members
    WHERE user_id = _user_id
      AND book_id = _book_id
  )
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_book_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_book_member(uuid, uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_book_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_book_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members can view book members" ON public.book_members;
DROP POLICY IF EXISTS "Owners can add members" ON public.book_members;
DROP POLICY IF EXISTS "Owners can update member roles" ON public.book_members;
DROP POLICY IF EXISTS "Owners or self can remove members" ON public.book_members;
DROP POLICY IF EXISTS "View categories" ON public.categories;
DROP POLICY IF EXISTS "Members can view their books" ON public.expense_books;
DROP POLICY IF EXISTS "Owners can delete books" ON public.expense_books;
DROP POLICY IF EXISTS "Owners can update books" ON public.expense_books;
DROP POLICY IF EXISTS "Create expenses" ON public.expenses;
DROP POLICY IF EXISTS "View expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can create their own book order" ON public.user_book_orders;
DROP POLICY IF EXISTS "Users can update their own book order" ON public.user_book_orders;

CREATE POLICY "Members can view book members"
ON public.book_members
FOR SELECT
TO authenticated
USING (private.is_book_member(auth.uid(), book_id));

CREATE POLICY "Owners can add members"
ON public.book_members
FOR INSERT
TO authenticated
WITH CHECK (private.is_book_owner(auth.uid(), book_id) OR auth.uid() = user_id);

CREATE POLICY "Owners can update member roles"
ON public.book_members
FOR UPDATE
TO authenticated
USING (private.is_book_owner(auth.uid(), book_id));

CREATE POLICY "Owners or self can remove members"
ON public.book_members
FOR DELETE
TO authenticated
USING (private.is_book_owner(auth.uid(), book_id) OR auth.uid() = user_id);

CREATE POLICY "View categories"
ON public.categories
FOR SELECT
TO authenticated
USING (is_default = true OR (book_id IS NOT NULL AND private.is_book_member(auth.uid(), book_id)));

CREATE POLICY "Members can view their books"
ON public.expense_books
FOR SELECT
TO authenticated
USING (private.is_book_member(auth.uid(), id));

CREATE POLICY "Owners can update books"
ON public.expense_books
FOR UPDATE
TO authenticated
USING (private.is_book_owner(auth.uid(), id));

CREATE POLICY "Owners can delete books"
ON public.expense_books
FOR DELETE
TO authenticated
USING (private.is_book_owner(auth.uid(), id));

CREATE POLICY "Create expenses"
ON public.expenses
FOR INSERT
TO authenticated
WITH CHECK (private.is_book_member(auth.uid(), book_id) AND auth.uid() = created_by);

CREATE POLICY "View expenses"
ON public.expenses
FOR SELECT
TO authenticated
USING (private.is_book_member(auth.uid(), book_id));

CREATE POLICY "Users can create their own book order"
ON public.user_book_orders
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND private.is_book_member(auth.uid(), book_id));

CREATE POLICY "Users can update their own book order"
ON public.user_book_orders
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND private.is_book_member(auth.uid(), book_id));