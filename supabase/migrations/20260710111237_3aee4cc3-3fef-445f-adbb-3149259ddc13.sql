
CREATE OR REPLACE FUNCTION public.create_debt(_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _uid uuid := auth.uid();
  _other_user_id uuid;
  _email text := nullif(lower(trim(_payload->>'borrowerEmail')), '');
  _direction text := _payload->>'direction';
  _debt_type text := _payload->>'debtType';
  _total numeric := (_payload->>'amount')::numeric;
  _description text := coalesce(nullif(trim(_payload->>'title'), ''), nullif(trim(_payload->>'description'), ''));
  _new_debt_id uuid;
  _item jsonb;
  _installment_number integer := 0;
  _loan jsonb := _payload->'loan';
  _emi_count integer;
  _emi_amount numeric;
  _emi_due_date date;
begin
  if _uid is null then
    raise exception 'Authentication required';
  end if;

  if _direction not in ('receivable', 'payable')
    or _debt_type not in ('one_time', 'emi', 'custom')
    or _total <= 0
    or _description is null then
    raise exception 'Invalid debt';
  end if;

  if _email is not null then
    select p.user_id
    into _other_user_id
    from public.profiles p
    where lower(p.email) = _email
    limit 1;
  end if;

  if _other_user_id = _uid then
    raise exception 'Use personal tracking for your own debt';
  end if;

  insert into public.debts (
    created_by,
    direction,
    creditor_id,
    debtor_id,
    counterparty_alias,
    counterparty_email,
    debt_type,
    status,
    total_amount,
    paid_amount,
    remaining_amount,
    description,
    notes,
    due_date
  )
  values (
    _uid,
    _direction,
    case when _direction = 'receivable' then _uid else _other_user_id end,
    case when _direction = 'payable' then _uid else _other_user_id end,
    nullif(trim(_payload->>'personAlias'), ''),
    _email,
    _debt_type,
    'accepted',
    _total,
    0,
    _total,
    _description,
    nullif(trim(_payload->>'notes'), ''),
    nullif(_payload->>'dueDate', '')::date
  )
  returning id into _new_debt_id;

  insert into public.debt_activities(debt_id, event_type, actor_id, details)
  values (
    _new_debt_id,
    'created',
    _uid,
    jsonb_build_object('direction', _direction, 'personal', _email is null)
  );

  if _debt_type = 'custom' then
    if jsonb_array_length(coalesce(_payload->'installments', '[]'::jsonb)) < 2
      or abs((
        select coalesce(sum((x->>'amount')::numeric), 0)
        from jsonb_array_elements(_payload->'installments') x
      ) - _total) > 0.01 then
      raise exception 'Installments must equal debt total';
    end if;

    for _item in select * from jsonb_array_elements(_payload->'installments') loop
      _installment_number := _installment_number + 1;
      insert into public.debt_installments (
        debt_id,
        installment_number,
        due_date,
        amount,
        paid_amount,
        remaining_amount
      )
      values (
        _new_debt_id,
        _installment_number,
        (_item->>'due_date')::date,
        (_item->>'amount')::numeric,
        0,
        (_item->>'amount')::numeric
      );
    end loop;
  elsif _debt_type = 'emi' then
    _emi_count := (_loan->>'number_of_emis')::integer;
    _emi_amount := (_loan->>'emi_amount')::numeric;

    if _loan is null
      or _emi_count <= 0
      or _emi_amount <= 0
      or nullif(_loan->>'first_emi_date', '') is null then
      raise exception 'Invalid EMI details';
    end if;

    insert into public.debt_loan_details (
      debt_id,
      principal_amount,
      processing_fee_percent,
      processing_fee,
      interest_rate,
      interest_type,
      total_interest,
      total_repayable_amount,
      emi_amount,
      number_of_emis,
      payment_frequency,
      loan_start_date,
      first_emi_date
    )
    values (
      _new_debt_id,
      (_loan->>'principal_amount')::numeric,
      coalesce((_loan->>'processing_fee_percent')::numeric, 0),
      coalesce((_loan->>'processing_fee')::numeric, 0),
      coalesce((_loan->>'interest_rate')::numeric, 0),
      coalesce(nullif(_loan->>'interest_type', ''), 'flat'),
      coalesce((_loan->>'total_interest')::numeric, 0),
      _total,
      _emi_amount,
      _emi_count,
      coalesce(nullif(_loan->>'payment_frequency', ''), 'monthly'),
      nullif(_loan->>'loan_start_date', '')::date,
      (_loan->>'first_emi_date')::date
    );

    for _installment_number in 1.._emi_count loop
      _emi_due_date := ((_loan->>'first_emi_date')::date + (_installment_number - 1) * interval '1 month')::date;
      insert into public.debt_installments (
        debt_id,
        installment_number,
        due_date,
        amount,
        paid_amount,
        remaining_amount
      )
      values (
        _new_debt_id,
        _installment_number,
        _emi_due_date,
        least(_emi_amount, _total - (_installment_number - 1) * _emi_amount),
        0,
        least(_emi_amount, _total - (_installment_number - 1) * _emi_amount)
      );
    end loop;
  end if;

  return _new_debt_id;
end
$function$;

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
    debt_id,
    installment_id,
    amount,
    payment_method,
    reference_number,
    notes,
    added_by
  )
  values (
    _debt_id,
    _target_installment,
    _payment_amount,
    coalesce(nullif(_method, ''), 'other'),
    _reference,
    _payment_notes,
    auth.uid()
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

  -- Auto-recalculate the remaining installment schedule for EMI/custom debts.
  if _debt.debt_type in ('emi', 'custom')
     and exists (select 1 from public.debt_installments where debt_id = _debt_id) then
    _new_remaining := _debt.remaining_amount - _payment_amount;

    if _new_remaining > 0.005 then
      -- original per-installment amount
      select emi_amount into _base_emi
      from public.debt_loan_details
      where debt_id = _debt_id;

      if _base_emi is null or _base_emi <= 0 then
        select max(amount) into _base_emi
        from public.debt_installments
        where debt_id = _debt_id;
      end if;

      if _base_emi is not null and _base_emi > 0 then
        -- anchor from the last installment that has any payment
        select coalesce(max(installment_number), 0), max(due_date)
        into _last_num, _last_due
        from public.debt_installments
        where debt_id = _debt_id and paid_amount > 0;

        if _last_num is null then _last_num := 0; end if;
        if _last_due is null then _last_due := current_date; end if;

        -- drop fully unpaid installments and rebuild them
        delete from public.debt_installments
        where debt_id = _debt_id and paid_amount = 0;

        while _new_remaining > 0.005 loop
          _last_num := _last_num + 1;
          _last_due := (_last_due + interval '1 month')::date;
          _chunk := least(_base_emi, _new_remaining);
          insert into public.debt_installments(
            debt_id, installment_number, due_date, amount,
            paid_amount, remaining_amount, status
          )
          values (_debt_id, _last_num, _last_due, _chunk, 0, _chunk, 'pending');
          _new_remaining := _new_remaining - _chunk;
        end loop;
      end if;
    end if;
  end if;

  insert into public.debt_activities(debt_id, event_type, actor_id, details)
  values (
    _debt_id,
    'payment_added',
    auth.uid(),
    jsonb_build_object('payment_id', _payment_id, 'amount', _payment_amount)
  );

  if _debt.remaining_amount = _payment_amount then
    insert into public.debt_activities(debt_id, event_type, actor_id)
    values (_debt_id, 'completed', auth.uid());
  end if;

  return _payment_id;
end
$function$;
