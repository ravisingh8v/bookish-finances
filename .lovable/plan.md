

# Expense Tracker — Quality Correction & Architecture Fix Plan

## Problem Summary

The app has several critical issues: RLS policies for `expense_books` and `book_members` are commented out (meaning all books are visible to all users), there's no invite/member management UI, expense cards don't show who created them, delete permissions aren't role-gated, and the auth screen needs polish.

---

## Step 1: Fix RLS Policies (Database Migration)

Create a new migration to add the missing policies that were commented out:

```sql
-- expense_books: only members can see, only creators can insert, only owners can update/delete
CREATE POLICY "Members can view their books" ON public.expense_books FOR SELECT TO authenticated
  USING (public.is_book_member(auth.uid(), id));
CREATE POLICY "Users can create books" ON public.expense_books FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners can update books" ON public.expense_books FOR UPDATE TO authenticated
  USING (public.is_book_owner(auth.uid(), id));
CREATE POLICY "Owners can delete books" ON public.expense_books FOR DELETE TO authenticated
  USING (public.is_book_owner(auth.uid(), id));

-- book_members: members can view, owners can add/remove, users can leave
CREATE POLICY "Members can view book members" ON public.book_members FOR SELECT TO authenticated
  USING (public.is_book_member(auth.uid(), book_id));
CREATE POLICY "Owners can add members" ON public.book_members FOR INSERT TO authenticated
  WITH CHECK (public.is_book_owner(auth.uid(), book_id) OR auth.uid() = user_id);
CREATE POLICY "Owners or self can remove members" ON public.book_members FOR DELETE TO authenticated
  USING (public.is_book_owner(auth.uid(), book_id) OR auth.uid() = user_id);
```

This immediately fixes the data visibility flaw — users will only see books they belong to.

---

## Step 2: Enforce Role-Based Delete in Frontend

- In `Books.tsx`: only show delete button if user is the book owner (check `book_members` role or `created_by`)
- In `BookDetail.tsx`: only show delete on expenses if user is owner or the expense creator
- The RLS policies already enforce owner-only delete at DB level, but the UI should reflect it too

---

## Step 3: Add Member/Invite Flow

Create a new **`BookMembers`** component used inside `BookDetail.tsx`:

- **Member list panel** showing current members with role badges (owner/editor/viewer)
- **"Add Member" button** (visible only to owner) opening a dialog:
  - Search by email input
  - Role selector (editor/viewer)
  - Lookup profile by email, insert into `book_members`
  - Duplicate prevention (unique constraint already exists)
- **Remove member** button for owner (or self-leave for non-owners)
- **Role change** dropdown for owner

New hook: `useBookMembers(bookId)` — queries `book_members` joined with `profiles` for display names/emails.

---

## Step 4: Show "Created By" on Expense Cards

- Update `useExpenses` query to join `profiles` for both `paid_by` and `created_by`:
  ```
  select("*, categories(name, icon, color), creator:profiles!expenses_created_by_fkey(display_name), payer:profiles!expenses_paid_by_fkey(display_name)")
  ```
- Update expense card UI in `BookDetail.tsx` to show:
  - Avatar initials of creator
  - "Added by [name]" and "Paid by [name]" labels
  - Created date

---

## Step 5: Fix Dashboard & Analytics Scoping

- **Dashboard** (`Dashboard.tsx`): The stats query fetches ALL expenses without book filtering. Since RLS is now fixed, this will automatically scope to member books only. No code change needed.
- **Analytics** (`Analytics.tsx`): Same — RLS will scope the data. Add a book filter dropdown so users can view analytics per-book or across all their books.
- Add member-based filtering in analytics (filter by who spent).

---

## Step 6: Premium Auth Screen Redesign

Redesign `Auth.tsx` with:
- Split layout: left side with branding/illustration area, right side with auth form (on mobile, just the form)
- Gradient mesh background
- Show/hide password toggle (eye icon)
- Forgot password link (calls `resetPasswordForEmail`)
- New `/reset-password` page for completing password reset
- Better input styling with icons (mail icon, lock icon)
- Smooth transitions between login/signup modes
- Loading states and validation feedback
- "Remember me" checkbox (cosmetic — Supabase handles sessions)

---

## Step 7: Full Audit Fixes

Items to fix across the app:

| Issue | Fix |
|-------|-----|
| Books page delete button visible to non-owners | Gate on role |
| No empty state for shared books with no expenses | Add empty state messaging |
| No error boundary for failed book fetch (direct URL) | Show "not found / no access" state |
| Mobile sidebar may overlap content | Verify responsive behavior |
| BookDetail doesn't guard against non-member access | If book query returns null/error, show access denied |
| No "filter by member" in BookDetail | Add member filter dropdown |
| Currency symbol hardcoded to ₹ in Dashboard/Analytics | Use book currency or default |

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/migrations/new.sql` | Add RLS policies |
| `src/hooks/useBookMembers.ts` | New hook for member CRUD |
| `src/components/BookMembers.tsx` | New member management component |
| `src/pages/BookDetail.tsx` | Add members panel, creator display, role-gated delete |
| `src/pages/Books.tsx` | Role-gated delete button |
| `src/pages/Auth.tsx` | Full redesign |
| `src/pages/ResetPassword.tsx` | New page for password reset |
| `src/pages/Analytics.tsx` | Add book/member filters |
| `src/pages/Dashboard.tsx` | Minor fixes (currency) |
| `src/hooks/useExpenses.ts` | Join profiles for creator/payer |
| `src/hooks/useBooks.ts` | Include user role in query |
| `src/App.tsx` | Add reset-password route |

---

## Implementation Order

1. Database migration (RLS policies) — highest priority, fixes security
2. Update hooks (`useBooks`, `useExpenses`, new `useBookMembers`)
3. BookDetail: member management + creator display + role checks
4. Books page: role-gated delete
5. Auth screen redesign + reset password page
6. Analytics improvements (book/member filters)
7. Full audit pass (empty states, error states, mobile, currency)

