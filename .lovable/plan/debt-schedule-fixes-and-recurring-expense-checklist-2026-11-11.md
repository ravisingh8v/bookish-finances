# Debt schedule fixes and recurring expense checklist

## Build
- Fix monthly debt schedule dates by calculating each occurrence from the original day and clamping to the target month. Apply the same helper in create and edit flows.
- Base installment/EMI due indicators on the earliest unpaid installment, not a stale debt-level first due date. Show alert styling only when that unpaid installment is due today or overdue; paid installments stop triggering warnings. Preserve one-time debt due-date behavior.
- Let long debt titles wrap safely in detail and schedule views.
- Add a reusable monthly expense checklist as a separate feature from Money Tracker. Users can add/edit/remove checklist items, import selected expenses from any book, mark done/undone, and reset completion while retaining the reusable items.
- Store checklist items in Lovable Cloud with per-user access controls; add a route and sidebar entry. Reset only clears completion state.

## Technical details
- Add date/schedule utility tests for end-of-month clamping and warning states, including completed items.
- Add one additive database migration for checklist storage with explicit grants, RLS, and ownership policies; rely on generated database types.
- Keep existing debt and expense records/structures compatible; copied book expenses become checklist definitions and do not create transactions.
