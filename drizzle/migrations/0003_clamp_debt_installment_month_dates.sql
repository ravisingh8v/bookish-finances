CREATE OR REPLACE FUNCTION public.normalize_debt_installment_due_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _debt_type text;
  _anchor date;
  _target_month date;
  _day integer;
BEGIN
  SELECT debt_type INTO _debt_type
  FROM public.debts
  WHERE id = NEW.debt_id;

  IF _debt_type = 'emi' THEN
    SELECT first_emi_date INTO _anchor
    FROM public.debt_loan_details
    WHERE debt_id = NEW.debt_id;
  ELSIF _debt_type = 'custom' THEN
    SELECT min(due_date) INTO _anchor
    FROM public.debt_installments
    WHERE debt_id = NEW.debt_id;
    _anchor := coalesce(_anchor, NEW.due_date);
  ELSE
    RETURN NEW;
  END IF;

  IF _anchor IS NULL OR NEW.installment_number < 1 THEN
    RETURN NEW;
  END IF;

  _target_month := (date_trunc('month', _anchor::timestamp) + make_interval(months => NEW.installment_number - 1))::date;
  _day := least(
    extract(day FROM _anchor)::integer,
    extract(day FROM ((_target_month + interval '1 month') - interval '1 day'))::integer
  );
  NEW.due_date := _target_month + (_day - 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_debt_installment_due_date ON public.debt_installments;
CREATE TRIGGER normalize_debt_installment_due_date
BEFORE INSERT ON public.debt_installments
FOR EACH ROW
EXECUTE FUNCTION public.normalize_debt_installment_due_date();