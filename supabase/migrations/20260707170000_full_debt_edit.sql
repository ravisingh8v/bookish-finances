-- Make debt editing accept the same fields as debt creation.
create or replace function public.update_debt(_debt_id uuid, _payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare
  d public.debts;
  new_type text;
  new_direction text;
  new_amount numeric;
  other_id uuid;
  email_value text;
  item jsonb;
  n integer:=0;
  loan jsonb;
  emi_count integer;
  emi_amount numeric;
begin
  select * into d from public.debts where id=_debt_id for update;
  if not found or auth.uid()<>d.created_by then raise exception 'Only the creator can edit this debt'; end if;

  new_type:=coalesce(nullif(_payload->>'debtType',''),d.debt_type);
  new_direction:=coalesce(nullif(_payload->>'direction',''),d.direction);
  new_amount:=coalesce((_payload->>'amount')::numeric,d.total_amount);
  email_value:=case when _payload?'borrowerEmail' then nullif(lower(trim(_payload->>'borrowerEmail')),'') else d.counterparty_email end;
  if new_type not in ('one_time','custom','emi') or new_direction not in ('receivable','payable') or new_amount<=0 or new_amount<d.paid_amount then raise exception 'Invalid debt values'; end if;
  if email_value is not null then select user_id into other_id from public.profiles where lower(email)=email_value limit 1; end if;
  if other_id=auth.uid() then raise exception 'Use personal tracking for your own debt'; end if;

  if d.paid_amount>0 and (new_type<>d.debt_type or new_amount<>d.total_amount) then
    raise exception 'Payment type and amount cannot be changed after payments are recorded';
  end if;

  update public.debts set
    direction=new_direction,
    creditor_id=case when new_direction='receivable' then created_by else other_id end,
    debtor_id=case when new_direction='payable' then created_by else other_id end,
    counterparty_alias=case when _payload?'personAlias' then nullif(trim(_payload->>'personAlias'),'') else counterparty_alias end,
    counterparty_email=email_value,
    debt_type=new_type,
    description=coalesce(nullif(trim(_payload->>'title'),''),description),
    notes=case when _payload?'notes' then nullif(trim(_payload->>'notes'),'') else notes end,
    due_date=case when new_type='one_time' then nullif(_payload->>'dueDate','')::date else null end,
    total_amount=new_amount,
    remaining_amount=new_amount-paid_amount,
    status=case when new_amount=paid_amount then 'paid' when paid_amount>0 then 'partially_paid' when status='pending' then 'pending' else 'accepted' end,
    updated_at=now()
  where id=_debt_id;

  if d.paid_amount=0 then
    delete from public.debt_installments where debt_id=_debt_id;
    delete from public.debt_loan_details where debt_id=_debt_id;
    if new_type='custom' then
      for item in select * from jsonb_array_elements(coalesce(_payload->'installments','[]'::jsonb)) loop
        n:=n+1;
        insert into public.debt_installments(debt_id,installment_number,due_date,amount,remaining_amount)
        values(_debt_id,n,(item->>'due_date')::date,(item->>'amount')::numeric,(item->>'amount')::numeric);
      end loop;
      if n<2 or abs((select coalesce(sum(amount),0) from public.debt_installments where debt_id=_debt_id)-new_amount)>.01 then raise exception 'Installments must equal debt total'; end if;
    elsif new_type='emi' then
      loan:=_payload->'loan'; emi_count:=(loan->>'number_of_emis')::integer; emi_amount:=(loan->>'emi_amount')::numeric;
      insert into public.debt_loan_details(debt_id,principal_amount,processing_fee_percent,processing_fee,interest_rate,interest_type,total_interest,total_repayable_amount,emi_amount,number_of_emis,payment_frequency,loan_start_date,first_emi_date)
      values(_debt_id,(loan->>'principal_amount')::numeric,coalesce((loan->>'processing_fee_percent')::numeric,0),coalesce((loan->>'processing_fee')::numeric,0),coalesce((loan->>'interest_rate')::numeric,0),coalesce(nullif(loan->>'interest_type',''),'flat'),coalesce((loan->>'total_interest')::numeric,0),new_amount,emi_amount,emi_count,coalesce(nullif(loan->>'payment_frequency',''),'monthly'),nullif(loan->>'loan_start_date','')::date,(loan->>'first_emi_date')::date);
      for n in 1..emi_count loop
        insert into public.debt_installments(debt_id,installment_number,due_date,amount,remaining_amount)
        values(_debt_id,n,((loan->>'first_emi_date')::date+(n-1)*interval '1 month')::date,least(emi_amount,new_amount-(n-1)*emi_amount),least(emi_amount,new_amount-(n-1)*emi_amount));
      end loop;
    end if;
  elsif new_type='custom' and _payload?'installments' then
    if jsonb_array_length(_payload->'installments')<>(select count(*) from public.debt_installments where debt_id=_debt_id) then
      raise exception 'Installment count cannot change after payments are recorded';
    end if;
    for item in select * from jsonb_array_elements(_payload->'installments') loop
      n:=n+1;
      update public.debt_installments set due_date=(item->>'due_date')::date
      where debt_id=_debt_id and installment_number=n;
    end loop;
  elsif new_type='emi' and _payload?'loan' then
    loan:=_payload->'loan';
    update public.debt_loan_details set first_emi_date=(loan->>'first_emi_date')::date
    where debt_id=_debt_id;
    update public.debt_installments set
      due_date=((loan->>'first_emi_date')::date+(installment_number-1)*interval '1 month')::date
    where debt_id=_debt_id;
  end if;
  insert into public.debt_activities(debt_id,event_type,actor_id) values(_debt_id,'updated',auth.uid());
end $$;

grant execute on function public.update_debt(uuid,jsonb) to authenticated;
