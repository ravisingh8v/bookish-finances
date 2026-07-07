
create or replace function public.update_debt(_debt_id uuid, _payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  _debt public.debts;
  _uid uuid := auth.uid();
  _new_amount numeric;
  _new_remaining numeric;
  _new_status text;
begin
  select * into _debt from public.debts where id = _debt_id for update;

  if not found then
    raise exception 'Debt not found';
  end if;

  if _uid <> _debt.created_by then
    raise exception 'Only the creator can edit this debt';
  end if;

  -- always-editable descriptive fields
  update public.debts
  set
    description = coalesce(nullif(trim(_payload->>'title'), ''), description),
    notes = case when _payload ? 'notes' then nullif(trim(_payload->>'notes'), '') else notes end,
    counterparty_alias = case when _payload ? 'personAlias' then nullif(trim(_payload->>'personAlias'), '') else counterparty_alias end,
    counterparty_email = case when _payload ? 'borrowerEmail' then nullif(lower(trim(_payload->>'borrowerEmail')), '') else counterparty_email end,
    due_date = case when _payload ? 'dueDate' then nullif(_payload->>'dueDate', '')::date else due_date end,
    updated_at = now()
  where id = _debt_id;

  -- direction only while pending
  if _payload ? 'direction' and _debt.status = 'pending'
     and _payload->>'direction' in ('receivable','payable') then
    update public.debts
    set
      direction = _payload->>'direction',
      creditor_id = case when _payload->>'direction' = 'receivable' then created_by else creditor_id end,
      debtor_id = case when _payload->>'direction' = 'payable' then created_by else debtor_id end
    where id = _debt_id;
  end if;

  -- amount editing only for one_time debts
  if _payload ? 'amount' and _debt.debt_type = 'one_time' then
    _new_amount := (_payload->>'amount')::numeric;
    if _new_amount <= 0 then
      raise exception 'Amount must be greater than zero';
    end if;
    if _new_amount < _debt.paid_amount then
      raise exception 'Amount cannot be lower than what is already paid';
    end if;
    _new_remaining := _new_amount - _debt.paid_amount;
    _new_status := case
      when _new_remaining = 0 then 'paid'
      when _debt.paid_amount > 0 then 'partially_paid'
      when _debt.status in ('pending','rejected','cancelled') then _debt.status
      else 'accepted'
    end;
    -- re-open a completed/closed debt when it becomes active again
    if _debt.status in ('paid','rejected','cancelled') and _new_remaining > 0 then
      _new_status := case when _debt.paid_amount > 0 then 'partially_paid' else 'accepted' end;
    end if;

    update public.debts
    set total_amount = _new_amount,
        remaining_amount = _new_remaining,
        status = _new_status
    where id = _debt_id;
  end if;

  insert into public.debt_activities(debt_id, event_type, actor_id)
  values (_debt_id, 'updated', _uid);
end
$function$;

create or replace function public.delete_debt(_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  _debt public.debts;
begin
  select * into _debt from public.debts where id = _debt_id;
  if not found then
    raise exception 'Debt not found';
  end if;
  if auth.uid() <> _debt.created_by then
    raise exception 'Only the creator can delete this debt';
  end if;
  delete from public.debts where id = _debt_id;
end
$function$;

grant execute on function public.update_debt(uuid, jsonb) to authenticated;
grant execute on function public.delete_debt(uuid) to authenticated;
