ALTER TABLE public.expense_books
ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_books TO authenticated;
GRANT ALL ON public.expense_books TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_members TO authenticated;
GRANT ALL ON public.book_members TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;