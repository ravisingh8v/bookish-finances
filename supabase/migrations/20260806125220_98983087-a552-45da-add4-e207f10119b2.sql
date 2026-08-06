CREATE OR REPLACE FUNCTION public.record_debt_payment(_debt_id uuid, _payment_amount numeric, _method text, _reference text DEFAULT NULL::text, _payment_notes text DEFAULT NULL::text, _target_installment uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _debt public.debts;
  _payment_id uuid;
  _left_amount numeric := _payment_amount;
  _installment public.debt_installments;
  _applied_amount numeric;
  _base_emi numeric;
  _new_remaining numeric;
  _kept_remaining numeric;
  _last_num integer;
  _last_due date;
  _chunk numeric;
begin
  select *
  into _debt
  from public.debts
  where id = _debt_id
  for update;

  if not found or not public.is_debt_participant(_debt) then
    raise exception 'Access denied';
  end if;

  if _debt.status not in ('accepted', 'partially_paid', 'overdue')
    or _payment_amount <= 0
    or _payment_amount > _debt.remaining_amount then
    raise exception 'Invalid payment';
  end if;

  insert into public.debt_payments(
    debt_id, installment_id, amount, payment_method, reference_number, notes, added_by
  )
  values (
    _debt_id, _target_installment, _payment_amount,
    coalesce(nullif(_method, ''), 'other'), _reference, _payment_notes, auth.uid()
  )
  returning id into _payment_id;

  for _installment in
    select *
    from public.debt_installments i
    where i.debt_id = _debt_id
      and i.remaining_amount > 0
      and (_target_installment is null or i.id = _target_installment)
    order by i.installment_number
    for update
  loop
    exit when _left_amount <= 0;
    _applied_amount := least(_left_amount, _installment.remaining_amount);

    update public.debt_installments
    set
      paid_amount = paid_amount + _applied_amount,
      remaining_amount = remaining_amount - _applied_amount,
      paid_date = case when remaining_amount - _applied_amount = 0 then current_date else paid_date end,
      status = case when remaining_amount - _applied_amount = 0 then 'paid' else 'partially_paid' end
    where id = _installment.id;

    _left_amount := _left_amount - _applied_amount;
  end loop;

  update public.debts
  set
    paid_amount = paid_amount + _payment_amount,
    remaining_amount = remaining_amount - _payment_amount,
    status = case when remaining_amount - _payment_amount = 0 then 'paid' else 'partially_paid' end,
    updated_at = now()
  where id = _debt_id;

  if _debt.debt_type in ('emi', 'custom')
     and exists (select 1 from public.debt_installments where debt_id = _debt_id) then
    _new_remaining := _debt.remaining_amount - _payment_amount;

    if _new_remaining > 0.005 then
      select emi_amount into _base_emi
      from public.debt_loan_details
      where debt_id = _debt_id;

      if _base_emi is null or _base_emi <= 0 then
        select max(amount) into _base_emi
        from public.debt_installments
        where debt_id = _debt_id;
      end if;

      if _base_emi is not null and _base_emi > 0 then
        select coalesce(max(installment_number), 0), max(due_date)
        into _last_num, _last_due
        from public.debt_installments
        where debt_id = _debt_id and paid_amount > 0;

        if _last_num is null then _last_num := 0; end if;
        if _last_due is null then _last_due := current_date; end if;

        -- amount still owed on installments we keep (partially paid ones)
        select coalesce(sum(remaining_amount), 0)
        into _kept_remaining
        from public.debt_installments
        where debt_id = _debt_id and paid_amount > 0;

        delete from public.debt_installments
        where debt_id = _debt_id and paid_amount = 0;

        _new_remaining := _new_remaining - _kept_remaining;

        while _new_remaining > 0.005 loop
          _last_num := _last_num + 1;
          _last_due := (_last_due + interval '1 month')::date;
          _chunk := least(_base_emi, _new_remaining);
          insert into public.debt_installments(
            debt_id, installment_number, due_date, amount,
            paid_amount, remaining_amount, status
          )
          values (_debt_id, _last_num, _last_due, _chunk, 0, _chunk, 'upcoming');
          _new_remaining := _new_remaining - _chunk;
        end loop;
      end if;
    end if;
  end if;

  insert into public.debt_activities(debt_id, event_type, actor_id, details)
  values (
    _debt_id, 'payment_added', auth.uid(),
    jsonb_build_object('payment_id', _payment_id, 'amount', _payment_amount)
  );

  if _debt.remaining_amount = _payment_amount then
    insert into public.debt_activities(debt_id, event_type, actor_id)
    values (_debt_id, 'completed', auth.uid());
  end if;

  return _payment_id;
end
$function$;