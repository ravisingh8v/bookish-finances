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
  SELECT debt_type, due_date
    INTO _debt_type, _anchor
  FROM public.debts
  WHERE id = NEW.debt_id;

  IF _debt_type = 'emi' THEN
    SELECT first_emi_date INTO _anchor
    FROM public.debt_loan_details
    WHERE debt_id = NEW.debt_id;
  ELSIF _debt_type = 'custom' THEN
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