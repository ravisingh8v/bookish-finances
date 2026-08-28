CREATE OR REPLACE FUNCTION public.update_debt(_debt_id uuid, _payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _debt public.debts;
  _uid uuid := auth.uid();
  _new_amount numeric;
  _new_remaining numeric;
  _new_status text;
  _new_direction text;
  _new_type text;
  _loan jsonb := _payload->'loan';
  _item jsonb;
  _n integer := 0;
  _emi_count integer;
  _emi_amount numeric;
  _due date;
begin
  select * into _debt from public.debts where id = _debt_id for update;

  if not found then
    raise exception 'Debt not found';
  end if;

  if _uid <> _debt.created_by then
    raise exception 'Only the creator can edit this debt';
  end if;

  -- descriptive fields
  update public.debts
  set
    description = coalesce(nullif(trim(_payload->>'title'), ''), description),
    notes = case when _payload ? 'notes' then nullif(trim(_payload->>'notes'), '') else notes end,
    counterparty_alias = case when _payload ? 'personAlias' then nullif(trim(_payload->>'personAlias'), '') else counterparty_alias end,
    counterparty_email = case when _payload ? 'borrowerEmail' then nullif(lower(trim(_payload->>'borrowerEmail')), '') else counterparty_email end,
    due_date = case when _payload ? 'dueDate' then nullif(_payload->>'dueDate', '')::date else due_date end,
    updated_at = now()
  where id = _debt_id;

  -- direction (allowed any time; creator side is always the created_by user)
  _new_direction := _payload->>'direction';
  if _new_direction in ('receivable', 'payable') and _new_direction <> _debt.direction then
    update public.debts
    set
      direction = _new_direction,
      creditor_id = case when _new_direction = 'receivable' then _debt.created_by
                         else nullif(_debt.creditor_id, _debt.created_by) end,
      debtor_id = case when _new_direction = 'payable' then _debt.created_by
                       else nullif(_debt.debtor_id, _debt.created_by) end
    where id = _debt_id;

    -- move the counterparty to the opposite side when they are a real user
    update public.debts
    set
      creditor_id = case when _new_direction = 'payable' then coalesce(creditor_id, nullif(_debt.debtor_id, _debt.created_by)) else creditor_id end,
      debtor_id = case when _new_direction = 'receivable' then coalesce(debtor_id, nullif(_debt.creditor_id, _debt.created_by)) else debtor_id end
    where id = _debt_id;
  end if;

  -- repayment type
  _new_type := _payload->>'debtType';
  if _new_type in ('one_time', 'emi', 'custom') then
    update public.debts set debt_type = _new_type where id = _debt_id;
  else
    _new_type := _debt.debt_type;
  end if;

  -- amount (any type)
  if _payload ? 'amount' and nullif(_payload->>'amount', '') is not null then
    _new_amount := (_payload->>'amount')::numeric;
    if _new_amount <= 0 then
      raise exception 'Amount must be greater than zero';
    end if;
    if _new_amount < _debt.paid_amount then
      raise exception 'Amount cannot be lower than what is already paid';
    end if;
  else
    _new_amount := _debt.total_amount;
  end if;

  _new_remaining := _new_amount - _debt.paid_amount;
  _new_status := case
    when _new_remaining = 0 then 'paid'
    when _debt.paid_amount > 0 then 'partially_paid'
    when _debt.status in ('pending') then _debt.status
    else 'accepted'
  end;

  update public.debts
  set total_amount = _new_amount,
      remaining_amount = _new_remaining,
      status = _new_status
  where id = _debt_id;

  -- rebuild schedule for unpaid portion
  delete from public.debt_installments
  where debt_id = _debt_id and paid_amount = 0;

  select coalesce(max(installment_number), 0) into _n
  from public.debt_installments where debt_id = _debt_id;

  if _new_type = 'one_time' then
    delete from public.debt_loan_details where debt_id = _debt_id;

  elsif _new_type = 'custom' and jsonb_array_length(coalesce(_payload->'installments', '[]'::jsonb)) > 0 then
    delete from public.debt_loan_details where debt_id = _debt_id;
    for _item in select * from jsonb_array_elements(_payload->'installments') loop
      _n := _n + 1;
      insert into public.debt_installments(
        debt_id, installment_number, due_date, amount, paid_amount, remaining_amount, status
      ) values (
        _debt_id, _n, (_item->>'due_date')::date, (_item->>'amount')::numeric,
        0, (_item->>'amount')::numeric, 'upcoming'
      );
    end loop;

  elsif _new_type = 'emi' and _loan is not null then
    _emi_count := greatest(1, coalesce((_loan->>'number_of_emis')::integer, 1));
    _emi_amount := coalesce((_loan->>'emi_amount')::numeric, _new_amount / _emi_count);

    delete from public.debt_loan_details where debt_id = _debt_id;
    insert into public.debt_loan_details (
      debt_id, principal_amount, processing_fee_percent, processing_fee,
      interest_rate, interest_type, total_interest, total_repayable_amount,
      emi_amount, number_of_emis, payment_frequency, loan_start_date, first_emi_date
    ) values (
      _debt_id,
      coalesce((_loan->>'principal_amount')::numeric, _new_amount),
      coalesce((_loan->>'processing_fee_percent')::numeric, 0),
      coalesce((_loan->>'processing_fee')::numeric, 0),
      coalesce((_loan->>'interest_rate')::numeric, 0),
      coalesce(nullif(_loan->>'interest_type', ''), 'flat'),
      coalesce((_loan->>'total_interest')::numeric, 0),
      _new_amount,
      _emi_amount,
      _emi_count,
      coalesce(nullif(_loan->>'payment_frequency', ''), 'monthly'),
      nullif(_loan->>'loan_start_date', '')::date,
      coalesce(nullif(_loan->>'first_emi_date', '')::date, current_date)
    );

    _due := coalesce(nullif(_loan->>'first_emi_date', '')::date, current_date);
    _due := (_due - interval '1 month')::date;
    declare
      _left numeric := _new_remaining - coalesce((
        select sum(remaining_amount) from public.debt_installments where debt_id = _debt_id
      ), 0);
      _chunk numeric;
    begin
      while _left > 0.005 loop
        _n := _n + 1;
        _due := (_due + interval '1 month')::date;
        _chunk := least(_emi_amount, _left);
        insert into public.debt_installments(
          debt_id, installment_number, due_date, amount, paid_amount, remaining_amount, status
        ) values (_debt_id, _n, _due, _chunk, 0, _chunk, 'upcoming');
        _left := _left - _chunk;
      end loop;
    end;
  end if;

  insert into public.debt_activities(debt_id, event_type, actor_id)
  values (_debt_id, 'updated', _uid);
end
$function$;