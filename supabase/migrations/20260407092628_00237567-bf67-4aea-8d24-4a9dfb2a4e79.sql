
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.expense_books (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  color TEXT NOT NULL DEFAULT '#10B981',
  icon TEXT NOT NULL DEFAULT 'wallet',
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_books ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.book_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID REFERENCES public.expense_books(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(book_id, user_id)
);

ALTER TABLE public.book_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_book_member(_user_id UUID, _book_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.book_members WHERE user_id = _user_id AND book_id = _book_id) $$;

CREATE OR REPLACE FUNCTION public.is_book_owner(_user_id UUID, _book_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.book_members WHERE user_id = _user_id AND book_id = _book_id AND role = 'owner') $$;

CREATE POLICY "Members can view their books" ON public.expense_books FOR SELECT TO authenticated USING (public.is_book_member(auth.uid(), id));
CREATE POLICY "Users can create books" ON public.expense_books FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners can update books" ON public.expense_books FOR UPDATE TO authenticated USING (public.is_book_owner(auth.uid(), id));
CREATE POLICY "Owners can delete books" ON public.expense_books FOR DELETE TO authenticated USING (public.is_book_owner(auth.uid(), id));

CREATE POLICY "Members can view book members" ON public.book_members FOR SELECT TO authenticated USING (public.is_book_member(auth.uid(), book_id));
CREATE POLICY "Can manage members" ON public.book_members FOR INSERT TO authenticated WITH CHECK (public.is_book_owner(auth.uid(), book_id) OR auth.uid() = user_id);
CREATE POLICY "Can remove members" ON public.book_members FOR DELETE TO authenticated USING (public.is_book_owner(auth.uid(), book_id) OR auth.uid() = user_id);

CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'tag',
  color TEXT NOT NULL DEFAULT '#6366F1',
  is_default BOOLEAN NOT NULL DEFAULT false,
  book_id UUID REFERENCES public.expense_books(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View categories" ON public.categories FOR SELECT TO authenticated USING (is_default = true OR (book_id IS NOT NULL AND public.is_book_member(auth.uid(), book_id)));
CREATE POLICY "Create categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (book_id IS NOT NULL AND public.is_book_member(auth.uid(), book_id));
CREATE POLICY "Update own categories" ON public.categories FOR UPDATE TO authenticated USING (created_by = auth.uid());
CREATE POLICY "Delete own categories" ON public.categories FOR DELETE TO authenticated USING (created_by = auth.uid() AND is_default = false);

CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID REFERENCES public.expense_books(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  expense_type TEXT NOT NULL DEFAULT 'debit' CHECK (expense_type IN ('debit', 'credit', 'transfer', 'split')),
  payment_method TEXT DEFAULT 'cash',
  notes TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  paid_by UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View expenses" ON public.expenses FOR SELECT TO authenticated USING (public.is_book_member(auth.uid(), book_id));
CREATE POLICY "Create expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (public.is_book_member(auth.uid(), book_id) AND auth.uid() = created_by);
CREATE POLICY "Update own expenses" ON public.expenses FOR UPDATE TO authenticated USING (created_by = auth.uid());
CREATE POLICY "Delete own expenses" ON public.expenses FOR DELETE TO authenticated USING (created_by = auth.uid());

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_expense_books_updated_at BEFORE UPDATE ON public.expense_books FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$ BEGIN INSERT INTO public.profiles (user_id, display_name, email) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), NEW.email); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.categories (name, icon, color, is_default) VALUES
('Food', 'utensils', '#F59E0B', true),
('Travel', 'plane', '#3B82F6', true),
('Shopping', 'shopping-bag', '#EC4899', true),
('Bills', 'receipt', '#8B5CF6', true),
('Rent', 'home', '#EF4444', true),
('Entertainment', 'film', '#F97316', true),
('Health', 'heart', '#10B981', true),
('Salary', 'banknote', '#22C55E', true),
('EMI', 'credit-card', '#6366F1', true),
('Investment', 'trending-up', '#14B8A6', true),
('Miscellaneous', 'tag', '#6B7280', true);
