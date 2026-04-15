# ExpenseFlow — Expense Tracker

A collaborative expense tracking web app built with React, Vite, and Supabase.

## Architecture

- **Frontend**: React 18 + TypeScript + Vite (port 5000)
- **UI**: Tailwind CSS + shadcn/ui components
- **Auth & Database**: Supabase (hosted — auth, PostgreSQL, row-level security)
- **State**: TanStack Query for server state, React Context for auth
- **PWA**: vite-plugin-pwa for offline support + background sync
- **Routing**: React Router v6

## Key Features

- Expense books (shared ledgers with multi-user support)
- Categories, tags, payment methods per expense
- Offline mode with queued sync when reconnected
- Analytics page with charts (recharts)
- Collaborative book members with role-based access (owner / editor / viewer)

## Running the App

```bash
npm run dev    # starts Vite dev server on port 5000
npm run build  # production build
```

## Environment Variables

Set in Replit's secure environment:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key
- `VITE_SUPABASE_PROJECT_ID` — Supabase project ID

## Supabase Schema

Migrations are in `supabase/migrations/`. The database includes:
- `profiles` — user profiles (auto-created on signup via trigger)
- `expense_books` — shared expense ledgers
- `book_members` — membership + roles per book
- `categories` — default and book-specific categories
- `expenses` — individual expense entries

## Migration from Lovable

Migrated from Lovable to Replit:
- Updated `vite.config.ts` for Replit host/port requirements (0.0.0.0:5000, allowedHosts)
- Removed `lovable-tagger` dev dependency
- Set Supabase env vars in Replit's secure environment system
- Configured `Start application` workflow (`npm run dev`)
