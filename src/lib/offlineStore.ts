/**
 * Offline queue using IndexedDB for storing pending actions.
 * Actions are queued when offline and synced when back online.
 */

const DB_NAME = "expenseflow_offline";
const DB_VERSION = 1;
const QUEUE_STORE = "action_queue";

export interface OfflineAction {
  id: string; // temp UUID
  type: "create_book" | "create_expense" | "delete_expense" | "delete_book";
  payload: Record<string, unknown>;
  createdAt: number;
  userId?: string; // null if not logged in yet
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueAction(action: OfflineAction): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).put(action);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllActions(): Promise<OfflineAction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => {
      const actions = (req.result as OfflineAction[]).sort(
        (a, b) => a.createdAt - b.createdAt
      );
      resolve(actions);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removeAction(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllActions(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueueCount(): Promise<number> {
  const actions = await getAllActions();
  return actions.length;
}
