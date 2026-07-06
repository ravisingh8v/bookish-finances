-- Debt management v1. Migrates the former Dues feature without discarding data.

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('receivable', 'payable')),
  creditor_id uuid references auth.users(id) on delete set null,
  debtor_id uuid references auth.users(id) on delete set null,
  counterparty_alias text,
  counterparty_email text,
  debt_type text not null check (debt_type in ('one_time', 'emi', 'custom')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'partially_paid', 'paid', 'rejected', 'cancelled', 'overdue')),
  total_amount numeric(14, 2) not null check (total_amount > 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  remaining_amount numeric(14, 2) not null check (remaining_amount >= 0),
  description text not null,
  notes text,
  due_date date,
  currency text not null default 'INR',
  source text not null default 'debt',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint debts_amounts_balance check (paid_amount + remaining_amount = total_amount)
);

create index debts_created_by_idx on public.debts(created_by);
create index debts_creditor_idx on public.debts(creditor_id);
create index debts_debtor_idx on public.debts(debtor_id);
create index debts_counterparty_email_idx on public.debts(lower(counterparty_email)) where counterparty_email is not null;
create index debts_status_idx on public.debts(status);
create index debts_due_date_idx on public.debts(due_date) where due_date is not null;

create table public.debt_loan_details (
  debt_id uuid primary key references public.debts(id) on delete cascade,
  principal_amount numeric(14, 2) not null check (principal_amount > 0),
  processing_fee_percent numeric(8, 4) not null default 0,
  processing_fee numeric(14, 2) not null default 0,
  interest_rate numeric(8, 4) not null default 0,
  interest_type text not null default 'flat' check (interest_type in ('flat', 'reducing')),
  total_interest numeric(14, 2) not null default 0,
  total_repayable_amount numeric(14, 2) not null check (total_repayable_amount > 0),
  emi_amount numeric(14, 2) not null check (emi_amount > 0),
  number_of_emis integer not null check (number_of_emis > 0),
  payment_frequency text not null default 'monthly' check (payment_frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  loan_start_date date,
  first_emi_date date not null
);

create table public.debt_installments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  installment_number integer not null,
  due_date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  remaining_amount numeric(14, 2) not null check (remaining_amount >= 0),
  paid_date date,
  status text not null default 'upcoming' check (status in ('upcoming', 'partially_paid', 'paid', 'overdue')),
  constraint debt_installments_amounts_balance check (paid_amount + remaining_amount = amount),
  unique(debt_id, installment_number)
);

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  installment_id uuid references public.debt_installments(id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0),
  payment_date date not null default current_date,
  payment_method text not null default 'other',
  reference_number text,
  notes text,
  added_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.debt_activities (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index debt_installments_debt_idx on public.debt_installments(debt_id);
create index debt_installments_due_date_idx on public.debt_installments(due_date);
create index debt_payments_debt_idx on public.debt_payments(debt_id);
create index debt_activities_debt_idx on public.debt_activities(debt_id);

create or replace function public.is_debt_participant(_target public.debts)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    auth.uid() in (_target.created_by, _target.creditor_id, _target.debtor_id)
    or exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and _target.counterparty_email is not null
        and lower(p.email) = lower(_target.counterparty_email)
    )
  )
$$;

alter table public.debts enable row level security;
alter table public.debt_loan_details enable row level security;
alter table public.debt_installments enable row level security;
alter table public.debt_payments enable row level security;
alter table public.debt_activities enable row level security;

create policy "Debt participants read"
on public.debts for select
using (public.is_debt_participant(debts));

create policy "Creator deletes pending debt"
on public.debts for delete
using (auth.uid() = created_by and status = 'pending');

create policy "Debt participants read loan"
on public.debt_loan_details for select
using (
  exists (
    select 1
    from public.debts d
    where d.id = debt_loan_details.debt_id
      and public.is_debt_participant(d)
  )
);

create policy "Debt participants read installments"
on public.debt_installments for select
using (
  exists (
    select 1
    from public.debts d
    where d.id = debt_installments.debt_id
      and public.is_debt_participant(d)
  )
);

create policy "Debt participants read payments"
on public.debt_payments for select
using (
  exists (
    select 1
    from public.debts d
    where d.id = debt_payments.debt_id
      and public.is_debt_participant(d)
  )
);

create policy "Debt participants read activity"
on public.debt_activities for select
using (
  exists (
    select 1
    from public.debts d
    where d.id = debt_activities.debt_id
      and public.is_debt_participant(d)
  )
);

grant select, delete on public.debts to authenticated;
grant select on public.debt_loan_details, public.debt_installments, public.debt_payments, public.debt_activities to authenticated;
grant all on public.debts, public.debt_loan_details, public.debt_installments, public.debt_payments, public.debt_activities to service_role;

create or replace function public.create_debt(_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
    case when _email is null then 'accepted' else 'pending' end,
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
$$;

create or replace function public.act_on_debt(_debt_id uuid, _action_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _debt public.debts;
  _uid uuid := auth.uid();
begin
  select *
  into _debt
  from public.debts
  where id = _debt_id
  for update;

  if not found or not public.is_debt_participant(_debt) then
    raise exception 'Access denied';
  end if;

  if _action_name in ('accept', 'reject') then
    if _uid = _debt.created_by or _debt.status <> 'pending' then
      raise exception 'Action not permitted';
    end if;

    update public.debts
    set
      status = case _action_name when 'accept' then 'accepted' else 'rejected' end,
      creditor_id = case when _action_name = 'accept' and direction = 'payable' then _uid else creditor_id end,
      debtor_id = case when _action_name = 'accept' and direction = 'receivable' then _uid else debtor_id end,
      updated_at = now()
    where id = _debt_id;
  elsif _action_name = 'cancel' then
    if _uid <> _debt.created_by or _debt.status <> 'pending' then
      raise exception 'Action not permitted';
    end if;

    update public.debts
    set status = 'cancelled', updated_at = now()
    where id = _debt_id;
  else
    raise exception 'Invalid action';
  end if;

  insert into public.debt_activities(debt_id, event_type, actor_id)
  values (
    _debt_id,
    case _action_name when 'accept' then 'accepted' when 'reject' then 'rejected' else 'cancelled' end,
    _uid
  );
end
$$;

create or replace function public.record_debt_payment(
  _debt_id uuid,
  _payment_amount numeric,
  _method text,
  _reference text default null,
  _payment_notes text default null,
  _target_installment uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _debt public.debts;
  _payment_id uuid;
  _left_amount numeric := _payment_amount;
  _installment public.debt_installments;
  _applied_amount numeric;
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
$$;

create or replace function public.get_my_debts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      to_jsonb(d) || jsonb_build_object(
        'lender_id', d.creditor_id,
        'borrower_id', d.debtor_id,
        'view_direction', case
          when auth.uid() = d.created_by then d.direction
          when d.direction = 'receivable' then 'payable'
          else 'receivable'
        end,
        'lender', (
          select to_jsonb(p)
          from public.profiles p
          where p.user_id = d.creditor_id
        ),
        'borrower', (
          select to_jsonb(p)
          from public.profiles p
          where p.user_id = d.debtor_id
        ),
        'loan_details', (
          select to_jsonb(l)
          from public.debt_loan_details l
          where l.debt_id = d.id
        ),
        'installments', coalesce((
          select jsonb_agg(to_jsonb(i) order by i.installment_number)
          from public.debt_installments i
          where i.debt_id = d.id
        ), '[]'::jsonb),
        'payments', coalesce((
          select jsonb_agg(to_jsonb(p) order by p.created_at desc)
          from public.debt_payments p
          where p.debt_id = d.id
        ), '[]'::jsonb),
        'activities', coalesce((
          select jsonb_agg(to_jsonb(a) order by a.created_at)
          from public.debt_activities a
          where a.debt_id = d.id
        ), '[]'::jsonb)
      )
      order by d.created_at desc
    ),
    '[]'::jsonb
  )
  from public.debts d
  where public.is_debt_participant(d)
$$;

-- Preserve and import all former Due records as personal payables.
insert into public.debts (
  id,
  created_by,
  direction,
  debtor_id,
  debt_type,
  status,
  total_amount,
  paid_amount,
  remaining_amount,
  description,
  notes,
  due_date,
  source,
  created_at,
  updated_at
)
select
  d.id,
  d.user_id,
  'payable',
  d.user_id,
  case d.frequency when 'emi' then 'emi' when 'installment' then 'custom' else 'one_time' end,
  case
    when coalesce(p.paid, 0) >= d.total_amount then 'paid'
    when coalesce(p.paid, 0) > 0 then 'partially_paid'
    else 'accepted'
  end,
  d.total_amount,
  least(coalesce(p.paid, 0), d.total_amount),
  greatest(d.total_amount - coalesce(p.paid, 0), 0),
  d.title,
  d.notes,
  case when d.due_date ~ '^\d{4}-\d{2}-\d{2}$' then d.due_date::date else null end,
  'legacy_due',
  d.created_at,
  d.updated_at
from public.dues d
left join (
  select due_id, sum(amount) paid
  from public.due_payments
  group by due_id
) p on p.due_id = d.id
on conflict (id) do nothing;

insert into public.debt_payments (
  id,
  debt_id,
  amount,
  payment_method,
  notes,
  added_by,
  created_at,
  payment_date
)
select
  p.id,
  p.due_id,
  p.amount,
  'other',
  p.notes,
  p.user_id,
  p.created_at,
  p.created_at::date
from public.due_payments p
join public.debts d on d.id = p.due_id
on conflict (id) do nothing;

insert into public.debt_activities(debt_id, event_type, actor_id, details, created_at)
select
  d.id,
  'migrated_from_due',
  d.created_by,
  jsonb_build_object('source', 'dues'),
  d.created_at
from public.debts d
where d.source = 'legacy_due';

revoke all on function public.is_debt_participant(public.debts) from public;
revoke all on function public.create_debt(jsonb) from public;
revoke all on function public.act_on_debt(uuid, text) from public;
revoke all on function public.record_debt_payment(uuid, numeric, text, text, text, uuid) from public;
revoke all on function public.get_my_debts() from public;

grant execute on function public.create_debt(jsonb) to authenticated;
grant execute on function public.act_on_debt(uuid, text) to authenticated;
grant execute on function public.record_debt_payment(uuid, numeric, text, text, text, uuid) to authenticated;
grant execute on function public.get_my_debts() to authenticated;

comment on table public.dues is 'Legacy data retained after migration to debts; do not write new records.';
comment on table public.due_payments is 'Legacy data retained after migration to debt_payments.';