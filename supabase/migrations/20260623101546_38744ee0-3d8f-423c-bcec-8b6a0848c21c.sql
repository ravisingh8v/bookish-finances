CREATE TABLE public.split_bills (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  split_type text NOT NULL DEFAULT 'equal',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.split_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  split_bill_id uuid NOT NULL REFERENCES public.split_bills(id) ON DELETE CASCADE,
  email text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  share_amount numeric NOT NULL DEFAULT 0,
  is_settled boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.split_bills TO authenticated;
GRANT ALL ON public.split_bills TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.split_participants TO authenticated;
GRANT ALL ON public.split_participants TO service_role;

CREATE OR REPLACE FUNCTION private.is_split_owner(_uid uuid, _split uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.split_bills WHERE id = _split AND created_by = _uid)
$$;

CREATE OR REPLACE FUNCTION private.is_split_participant(_uid uuid, _split uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.split_participants WHERE split_bill_id = _split AND user_id = _uid)
$$;

ALTER TABLE public.split_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own or participating split bills" ON public.split_bills
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR private.is_split_participant(auth.uid(), id));
CREATE POLICY "Create own split bills" ON public.split_bills
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "Update own split bills" ON public.split_bills
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid());
CREATE POLICY "Delete own split bills" ON public.split_bills
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "View split participants" ON public.split_participants
  FOR SELECT TO authenticated
  USING (private.is_split_owner(auth.uid(), split_bill_id) OR user_id = auth.uid());
CREATE POLICY "Owner adds participants" ON public.split_participants
  FOR INSERT TO authenticated
  WITH CHECK (private.is_split_owner(auth.uid(), split_bill_id));
CREATE POLICY "Owner or self updates participant" ON public.split_participants
  FOR UPDATE TO authenticated
  USING (private.is_split_owner(auth.uid(), split_bill_id) OR user_id = auth.uid());
CREATE POLICY "Owner removes participants" ON public.split_participants
  FOR DELETE TO authenticated
  USING (private.is_split_owner(auth.uid(), split_bill_id));

CREATE TRIGGER update_split_bills_updated_at BEFORE UPDATE ON public.split_bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_split_participants_updated_at BEFORE UPDATE ON public.split_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.split_bills;
ALTER PUBLICATION supabase_realtime ADD TABLE public.split_participants;