-- Archive support for books
ALTER TABLE public.expense_books ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- Dues stored in the database (previously localStorage)
CREATE TABLE public.dues (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  due_date text,
  frequency text NOT NULL DEFAULT 'one-time',
  notes text,
  emi_details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dues TO authenticated;
GRANT ALL ON public.dues TO service_role;
ALTER TABLE public.dues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own dues" ON public.dues
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_dues_updated_at BEFORE UPDATE ON public.dues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.due_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  due_id uuid NOT NULL REFERENCES public.dues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.due_payments TO authenticated;
GRANT ALL ON public.due_payments TO service_role;
ALTER TABLE public.due_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own due payments" ON public.due_payments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.due_people (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  due_id uuid NOT NULL REFERENCES public.dues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.due_people TO authenticated;
GRANT ALL ON public.due_people TO service_role;
ALTER TABLE public.due_people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own due people" ON public.due_people
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);