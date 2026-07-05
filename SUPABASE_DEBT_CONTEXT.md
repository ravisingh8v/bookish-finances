# Supabase Debt Feature Context

Date: 2026-07-05

## Goal

Replace the old local/legacy Dues experience with a Supabase-backed Debts feature:

- `/debts` list page
- `/debts/:debtId` detail page
- create debts as receivable/payable
- support one-time, custom installment, and EMI-style debts
- record payments
- preserve legacy `dues` data
- deploy Supabase migration so `public.get_my_debts` and related RPCs exist

## Current repo changes

Files changed/added:

- `src/App.tsx`
  - Adds `/debts`
  - Adds `/debts/:debtId`
  - Redirects `/dues` to `/debts`
  - Redirects `/dues/:dueId` to `/debts/:dueId`
- `src/components/AppSidebar.tsx`
  - Sidebar item changed from `Dues` to `Debts`
- `src/hooks/useDebts.ts`
  - New debts hook
  - Uses new Supabase debt RPCs when available:
    - `get_my_debts`
    - `create_debt`
    - `act_on_debt`
    - `record_debt_payment`
  - Falls back to existing deployed `dues` / `due_payments` tables when the new migration has not yet been pushed
- `src/pages/Debts.tsx`
  - New debts list/create UI
- `src/pages/DebtDetail.tsx`
  - New detail/payment UI
  - Important fix already applied: reads route param `debtId`, not `id`
- `supabase/migrations/20260705140000_debt_management.sql`
  - Creates debt tables
  - Creates RLS policies
  - Creates RPC functions
  - Migrates legacy `dues` into `debts`
- `package.json` / `package-lock.json`
  - Installed local Supabase CLI dev dependency: `supabase`

## Local verification already passed

These commands passed:

```powershell
npm.cmd run build
npm.cmd test -- --run
```

The local Supabase CLI is installed and works:

```powershell
npx.cmd supabase --version
```

Output:

```txt
2.109.0
```

## Supabase project

Project ref from `supabase/config.toml`:

```txt
kdjxstiuukvumkmyulrl
```

The `.env` contains frontend/app Supabase values:

- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

It does not contain:

- `SUPABASE_ACCESS_TOKEN`

## Current blocker

The remote database has not received the debt migration yet.

The app/user error:

```txt
Could not find the function public.get_my_debts without parameters in the schema cache
```

Remote API check confirmed:

```txt
PGRST202: Could not find the function public.get_my_debts without parameters in the schema cache
```

Trying to push migrations currently fails because the Supabase CLI is not authenticated:

```powershell
npx.cmd supabase link --project-ref kdjxstiuukvumkmyulrl
```

Error:

```txt
Access token not provided. Supply an access token by running `supabase login` or setting the SUPABASE_ACCESS_TOKEN environment variable.
```

Trying interactive login also fails in the non-TTY Codex environment:

```powershell
npx.cmd supabase login
```

Error:

```txt
Cannot use automatic login flow inside non-TTY environments. Please provide --token flag or set the SUPABASE_ACCESS_TOKEN environment variable.
```

## What is needed next

Provide a Supabase platform access token, then run:

```powershell
$env:SUPABASE_ACCESS_TOKEN="YOUR_SUPABASE_ACCESS_TOKEN"
npx.cmd supabase link --project-ref kdjxstiuukvumkmyulrl
npx.cmd supabase db push
```

After the push, verify the RPC exists:

```powershell
npx.cmd supabase db push
```

Then in the app, the `/debts` hook should stop falling back to legacy `dues` and use `public.get_my_debts`.

## Important note

Do not use `VITE_SUPABASE_PUBLISHABLE_KEY` as the CLI token. That is the frontend anon/publishable key and cannot deploy migrations or create SQL functions.

Use a Supabase platform access token from the Supabase dashboard/account settings.
