import type { SyncAction } from "./db";

const BOOKS_KEY = "expenseflow_local_books_v1";
const EXPENSES_KEY = "expenseflow_local_expenses_v1";
const QUEUE_KEY = "expenseflow_local_sync_queue_v1";

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

export function getStoredBooks<T extends { id: string }>() {
  return readJson<T[]>(BOOKS_KEY, []);
}

export function setStoredBooks<T extends { id: string }>(books: T[]) {
  writeJson(BOOKS_KEY, books);
}

export function upsertStoredBook<T extends { id: string }>(book: T) {
  const books = getStoredBooks<T>();
  setStoredBooks([book, ...books.filter((entry) => entry.id !== book.id)]);
}

export function updateStoredBook<T extends { id: string }>(
  bookId: string,
  updater: (book: T) => T,
) {
  const books = getStoredBooks<T>();
  setStoredBooks(
    books.map((book) => (book.id === bookId ? updater(book) : book)),
  );
}

export function removeStoredBook(bookId: string) {
  const books = getStoredBooks<{ id: string }>();
  setStoredBooks(books.filter((book) => book.id !== bookId));
}

export function replaceStoredBookId<T extends { id: string }>(
  oldId: string,
  nextBook: T,
) {
  const books = getStoredBooks<T>().filter(
    (book) => book.id !== oldId && book.id !== nextBook.id,
  );
  setStoredBooks([nextBook, ...books]);
}

type ExpenseBuckets<T> = Record<string, T[]>;

export function getStoredExpenses<T>(bookId: string) {
  const buckets = readJson<ExpenseBuckets<T>>(EXPENSES_KEY, {});
  return buckets[bookId] ?? [];
}

export function setStoredExpenses<T>(bookId: string, expenses: T[]) {
  const buckets = readJson<ExpenseBuckets<T>>(EXPENSES_KEY, {});
  buckets[bookId] = expenses;
  writeJson(EXPENSES_KEY, buckets);
}

export function updateStoredExpenses<T>(
  bookId: string,
  updater: (expenses: T[]) => T[],
) {
  setStoredExpenses(bookId, updater(getStoredExpenses<T>(bookId)));
}

export function renameStoredExpenseBucket<T extends { book_id?: string }>(
  oldBookId: string,
  newBookId: string,
) {
  const buckets = readJson<ExpenseBuckets<T>>(EXPENSES_KEY, {});
  const expenses = (buckets[oldBookId] ?? []).map((expense) => ({
    ...expense,
    book_id: newBookId,
  }));
  delete buckets[oldBookId];
  buckets[newBookId] = expenses;
  writeJson(EXPENSES_KEY, buckets);
}

export function removeStoredExpenseBucket(bookId: string) {
  const buckets = readJson<ExpenseBuckets<unknown>>(EXPENSES_KEY, {});
  delete buckets[bookId];
  writeJson(EXPENSES_KEY, buckets);
}

export function getStoredQueue() {
  return readJson<SyncAction[]>(QUEUE_KEY, []);
}

export function setStoredQueue(actions: SyncAction[]) {
  writeJson(QUEUE_KEY, actions);
}

export function upsertStoredQueueAction(action: SyncAction) {
  const actions = getStoredQueue();
  const next = [...actions.filter((entry) => entry.id !== action.id), action].sort(
    (a, b) => a.createdAt - b.createdAt,
  );
  setStoredQueue(next);
}

export function removeStoredQueueActions(actionIds: string[]) {
  const idSet = new Set(actionIds);
  setStoredQueue(getStoredQueue().filter((action) => !idSet.has(action.id)));
}

export function countStoredQueue() {
  return getStoredQueue().length;
}
