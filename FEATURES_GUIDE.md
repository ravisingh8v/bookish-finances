# Quick Reference: New Features & Fixes

## 🎯 For Users

### New Feature: Duplicate Book

**Where:** Books page (when viewing all expense books)
**How:**

1. Hover over any book you own
2. Click the **Copy** button (copy icon)
3. Dialog asks: "Do you want to copy members as well?"
   - Check to include all members and their roles
   - Leave unchecked to only copy expenses
4. New book created with "(Copy)" in the name
5. All expenses are always copied with new records

**Requirements:**

- ✅ Must be book owner
- ✅ Must be online (feature disabled offline with tooltip)
- ✅ Requires internet connection to complete

---

### Fixed: Seamless Offline Experience

**Before:** Going offline during usage required a refresh
**After:** Instant switch to offline mode, no refresh needed

- ✅ Works while using the app
- ✅ CRUD operations work immediately
- ✅ Offline badge appears automatically
- ✅ Syncs when back online

---

### Fixed: No Hard Refresh After Updates

**Before:** New versions required hard refresh (Ctrl+Shift+R)
**After:** App automatically updates when new version available

- ✅ Latest code loads without hard refresh
- ✅ No stale cache issues
- ✅ Smooth update experience

---

### New: Update Notifications

**How it works:**

1. App checks for updates automatically
2. When update available: "Update available" appears at bottom-right
3. Click **Update** button to apply
4. App reloads with new version
5. Or click **X** to dismiss (for later)

**Works on:**

- Browser version of app
- Installed PWA (add to home screen)

---

## 🛠️ For Developers

### Key Changes

**Network Detection** (`src/lib/network.ts`)

- Capture phase listeners for earlier detection
- Immediate synchronization on attach
- Visibility change recheck

**Service Worker Updates** (`src/main.tsx`)

- Periodic update checks (every 30 seconds)
- Proper listening for waiting state
- Clean controller change handling

**Duplicate Book** (`src/hooks/useBooks.ts`)

- New `duplicateBook` mutation
- Online-only constraint with user feedback
- Queues action for sync system

**PWA Update System** (`src/lib/pwa.ts`)

- Update notification hook
- SKIP_WAITING message handling
- Safe reload with timeout

---

## 📋 Testing the Features

### Test Duplicate Book

```
1. Open app online
2. Go to Books page
3. Hover over a book you own
4. Click Copy button
5. Choose members option
6. Verify new book with "(Copy)" appears
7. Check all expenses copied
```

### Test Offline Transition

```
1. Open app and view books
2. Go offline (DevTools → Network → Offline)
3. Try to create/edit/delete
4. Should work immediately
5. Offline badge appears
6. Go online → syncs automatically
```

### Test Update Notification

```
1. Open app in browser
2. Modify code and deploy
3. Wait 30 seconds for check
4. "Update available" appears
5. Click Update
6. Page reloads with new version
```

---

## 🔧 Architecture Overview

```
┌─────────────────────────────┐
│      Bookish Finances       │
├─────────────────────────────┤
│  Update Notification System │
│  - Periodic checks (30s)    │
│  - Manual update button     │
│  - Clean reload handling    │
├─────────────────────────────┤
│   Network Detection         │
│  - Instant online→offline   │
│  - Visibility recheck       │
│  - Service switching        │
├─────────────────────────────┤
│   Sync Queue System         │
│  - Offline-first queuing    │
│  - Automatic sync on online │
│  - Proper retry logic       │
├─────────────────────────────┤
│   Cache Management          │
│  - Selective invalidation   │
│  - Data preservation        │
│  - Version-based cleanup    │
├─────────────────────────────┤
│   Service Worker            │
│  - Workbox-managed          │
│  - Network-first for pages  │
│  - Cache-first for assets   │
└─────────────────────────────┘
```

---

## ⚠️ Important Notes

### Data Safety

- ✅ Offline data NEVER lost during updates
- ✅ Sync queue survives app refresh
- ✅ IndexedDB preserved
- ✅ localStorage maintained

### Offline Mode

- ✅ Works instantly without refresh
- ✅ CRUD operations queue automatically
- ✅ Data syncs when online
- ✅ No manual intervention needed

### Updates

- ✅ Users have control (manual update button)
- ✅ No forced reload
- ✅ Works in browser and PWA
- ✅ Safe fallback with timeout

---

## 📚 File Reference

| Feature             | Files                                                     |
| ------------------- | --------------------------------------------------------- |
| Duplicate Book      | `useBooks.ts`, `useOfflineSync.tsx`, `Books.tsx`, `db.ts` |
| Offline Transition  | `network.ts`, `useOnlineStatus.ts`                        |
| Update Notification | `pwa.ts`, `UpdateNotification.tsx`, `main.tsx`, `App.tsx` |
| Cache Management    | `main.tsx`, `vite.config.ts`                              |

---

## 🚀 Production Deployment

No special steps required:

1. Run `npm run build`
2. Deploy dist folder
3. Service worker updates automatically
4. Users see "Update available" notification
5. They click to update when ready

---

## ❓ FAQ

**Q: Can users delay updates?**
A: Yes! They can dismiss the notification or click Update later.

**Q: Will offline data survive updates?**
A: Yes! All offline data is preserved in IndexedDB and localStorage.

**Q: Do I need hard refresh after deploying?**
A: No! App automatically loads latest code.

**Q: Does duplicate book work offline?**
A: No. Shows error: "Book duplication requires internet connection"

**Q: Can duplicated book members be customized?**
A: Yes! User chooses whether to copy members or just expenses.

**Q: How often does app check for updates?**
A: Every 30 seconds automatically in the background.

**Q: What if update fails halfway?**
A: It's skipped and will retry on next check (safe).

---

## 🐛 Troubleshooting

**Update notification not showing?**

- Wait 30 seconds (check interval)
- Or manually check: F12 → Application → Service Workers → Update

**Offline not working?**

- Check: DevTools → Network → "Offline" checkbox
- Refresh app (once while online)
- Try again

**Duplicate not appearing?**

- Must be book owner
- Must be online
- Check network tab for errors

**Sync not working?**

- Check internet connection
- Wait for manual sync attempt
- Check browser console for errors

---

**Last Updated:** April 17, 2026
**Version:** 1.0.0 - Initial Implementation
