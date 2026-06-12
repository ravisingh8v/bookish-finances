ALTER TABLE public.expenses REPLICA IDENTITY FULL;
ALTER TABLE public.expense_books REPLICA IDENTITY FULL;
ALTER TABLE public.book_members REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_books;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.book_members;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;