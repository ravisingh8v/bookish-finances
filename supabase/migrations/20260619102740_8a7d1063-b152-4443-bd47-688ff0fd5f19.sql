CREATE TABLE IF NOT EXISTS public.user_book_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  book_id uuid NOT NULL REFERENCES public.expense_books(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_book_orders TO authenticated;
GRANT ALL ON public.user_book_orders TO service_role;

ALTER TABLE public.user_book_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own book order"
ON public.user_book_orders
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own book order"
ON public.user_book_orders
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_book_member(auth.uid(), book_id));

CREATE POLICY "Users can update their own book order"
ON public.user_book_orders
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND public.is_book_member(auth.uid(), book_id));

CREATE POLICY "Users can delete their own book order"
ON public.user_book_orders
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_book_orders_updated_at ON public.user_book_orders;
CREATE TRIGGER update_user_book_orders_updated_at
BEFORE UPDATE ON public.user_book_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_book_orders;