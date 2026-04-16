import { db, type SyncAction } from "./db";

const BOOKS_KEY = "expenseflow_local_books_v1";
const EXPENSES_KEY = "expenseflow_local_expenses_v1";
const QUEUE_KEY = "expenseflow_local_sync_queue_v1";

// Helper to get current user ID for cache isolation
function getCurrentUserId(): string {
  if (typeof window === "undefined") return "_anonymous";
  try {
    // Try to get from session/auth state first
    const authKey = Object.keys(window.localStorage).find(k => k.endsWith("-auth-token"));
    if (authKey) {
      const token = window.localStorage.getItem(authKey);
      if (token) {
        try {
          const decoded = JSON.parse(atob(token.split(".")[1]));
          return decoded.sub || "_anonymous";
        } catch {
          return "_anonymous";
        }
      }
    }
    // Fallback to cached user ID
    return window.localStorage.getItem("_cached_user_id") || "_anonymous";
  } catch {
    return "_anonymous";
  }
}

// Generate scoped keys with user ID
function scopedKey(baseKey: string, userId?: string): string {
  const uid = userId || getCurrentUserId();
  return `${baseKey}:${uid}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota / serialization failures and keep the app responsive.
  }
}

export function getStoredBooks<T extends { id: string }>(userId?: string) {
  return readJson<T[]>(scopedKey(BOOKS_KEY, userId), []);
}

export function setStoredBooks<T extends { id: string }>(books: T[], userId?: string) {
  writeJson(scopedKey(BOOKS_KEY, userId), books);
}

export function upsertStoredBook<T extends { id: string }>(book: T, userId?: string) {
  const books = getStoredBooks<T>(userId);
  setStoredBooks([book, ...books.filter((entry) => entry.id !== book.id)], userId);
}

export function updateStoredBook<T extends { id: string }>(
  bookId: string,
  updater: (book: T) => T,
  userId?: string,
) {
  const books = getStoredBooks<T>(userId);
  setStoredBooks(
    books.map((book) => (book.id === bookId ? updater(book) : book)),
    userId,
  );
}

export function removeStoredBook(bookId: string, userId?: string) {
  const books = getStoredBooks<{ id: string }>(userId);
  setStoredBooks(books.filter((book) => book.id !== bookId), userId);
}

export function replaceStoredBookId<T extends { id: string }>(
  oldId: string,
  nextBook: T,
  userId?: string,
) {
  const books = getStoredBooks<T>(userId).filter(
    (book) => book.id !== oldId && book.id !== nextBook.id,
  );
  setStoredBooks([nextBook, ...books], userId);
}

type ExpenseBuckets<T> = Record<string, T[]>;

export function getStoredExpenses<T>(bookId: string, userId?: string) {
  const buckets = readJson<ExpenseBuckets<T>>(scopedKey(EXPENSES_KEY, userId), {});
  return buckets[bookId] ?? [];
}

export function setStoredExpenses<T>(bookId: string, expenses: T[], userId?: string) {
  const buckets = readJson<ExpenseBuckets<T>>(scopedKey(EXPENSES_KEY, userId), {});
  buckets[bookId] = expenses;
  writeJson(scopedKey(EXPENSES_KEY, userId), buckets);
}

export function updateStoredExpenses<T>(
  bookId: string,
  updater: (expenses: T[]) => T[],
  userId?: string,
) {
  setStoredExpenses(bookId, updater(getStoredExpenses<T>(bookId, userId)), userId);
}

export function renameStoredExpenseBucket<T extends { book_id?: string }>(
  oldBookId: string,
  newBookId: string,
  userId?: string,
) {
  const buckets = readJson<ExpenseBuckets<T>>(scopedKey(EXPENSES_KEY, userId), {});
  const expenses = (buckets[oldBookId] ?? []).map((expense) => ({
    ...expense,
    book_id: newBookId,
  }));
  delete buckets[oldBookId];
  buckets[newBookId] = expenses;
  writeJson(scopedKey(EXPENSES_KEY, userId), buckets);
}

export function removeStoredExpenseBucket(bookId: string, userId?: string) {
  const buckets = readJson<ExpenseBuckets<unknown>>(scopedKey(EXPENSES_KEY, userId), {});
  delete buckets[bookId];
  writeJson(scopedKey(EXPENSES_KEY, userId), buckets);
}

export function getStoredQueue(userId?: string) {
  return readJson<SyncAction[]>(scopedKey(QUEUE_KEY, userId), []);
}

export function setStoredQueue(actions: SyncAction[], userId?: string) {
  writeJson(scopedKey(QUEUE_KEY, userId), actions);
}

export function upsertStoredQueueAction(action: SyncAction, userId?: string) {
  const actions = getStoredQueue(userId);
  const next = [...actions.filter((entry) => entry.id !== action.id), action].sort(
    (a, b) => a.createdAt - b.createdAt,
  );
  setStoredQueue(next, userId);
}

export function removeStoredQueueActions(actionIds: string[], userId?: string) {
  const idSet = new Set(actionIds);
  setStoredQueue(getStoredQueue(userId).filter((action) => !idSet.has(action.id)), userId);
}

export function countStoredQueue(userId?: string) {
  return getStoredQueue(userId).length;
}

export async function getPersistedQueue(userId?: string) {
  const uid = userId || getCurrentUserId();
  const queuedActions = await db.syncQueue.where("userId").equals(uid).toArray();
  if (queuedActions.length > 0) {
    setStoredQueue(queuedActions, uid);
    return queuedActions;
  }

  const storedActions = getStoredQueue(uid).sort(
    (a, b) => a.createdAt - b.createdAt,
  );
  if (storedActions.length > 0) {
    const actionsWithUserId = storedActions.map(a => ({ ...a, userId: uid }));
    await db.syncQueue.bulkPut(actionsWithUserId);
  }
  return storedActions;
}

export async function upsertPersistedQueueAction(action: SyncAction, userId?: string) {
  const uid = userId || getCurrentUserId();
  upsertStoredQueueAction(action, uid);
  await db.syncQueue.put({ ...action, userId: uid });
}

export async function removePersistedQueueActions(actionIds: string[], userId?: string) {
  if (actionIds.length === 0) return;
  const uid = userId || getCurrentUserId();
  removeStoredQueueActions(actionIds, uid);
  await db.syncQueue.bulkDelete(actionIds);
}

export async function countPersistedQueue(userId?: string) {
  const actions = await getPersistedQueue(userId);
  return actions.length;
}

// Clear all cache for a user (used on logout)
export async function clearUserCache(userId?: string) {
  const uid = userId || getCurrentUserId();
  if (canUseStorage()) {
    try {
      Object.keys(window.localStorage)
        .filter(k => k.endsWith(`:${uid}`))
        .forEach(k => window.localStorage.removeItem(k));
    } catch {
      // Continue
    }
  }
  // Clear from IndexedDB
  await db.syncQueue.where("userId").equals(uid).delete();
}

// Export userId getter for external use
export { getCurrentUserId };
