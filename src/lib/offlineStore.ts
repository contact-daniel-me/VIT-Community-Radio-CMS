/**
 * VIT Community Radio CMS -- Offline Storage Engine
 *
 * Provides resilient, user-scoped offline storage using standard browser IndexedDB.
 *
 * Architecture & Security:
 * - Scoped by userId to prevent cross-user data leakage on shared machines.
 * - Auto-purges user data when sign-out occurs.
 * - Graceful fallback to memory if IndexedDB is blocked in private/incognito mode.
 * - Stores read-only schedule, user bookings, and program lists for offline continuity.
 */

const DB_NAME = 'vit_radio_offline_db';
const DB_VERSION = 1;
const USER_STORE = 'user_data';
const PUBLIC_STORE = 'public_data';

interface StoredRecord<T = unknown> {
  id: string;
  userId?: string;
  data: T;
  updatedAt: number;
  expiresAt: number | null;
}

let dbInstance: IDBDatabase | null = null;
const memoryStore = new Map<string, StoredRecord>();

function isIdbAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

async function getDB(): Promise<IDBDatabase | null> {
  if (dbInstance) return dbInstance;
  if (!isIdbAvailable()) return null;

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(USER_STORE)) {
          db.createObjectStore(USER_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(PUBLIC_STORE)) {
          db.createObjectStore(PUBLIC_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
      };

      request.onerror = () => {
        console.warn('[OfflineStore] Failed to open IndexedDB; falling back to memory store.');
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

export const offlineStore = {
  /**
   * Save user-scoped data (e.g. RJ's bookings or draft sessions)
   */
  async setUserData<T>(userId: string, key: string, data: T, ttlMs = 86_400_000): Promise<void> {
    const recordId = `${userId}:${key}`;
    const record: StoredRecord<T> = {
      id: recordId,
      userId,
      data,
      updatedAt: Date.now(),
      expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null,
    };

    memoryStore.set(recordId, record);

    const db = await getDB();
    if (!db) return;

    try {
      const tx = db.transaction(USER_STORE, 'readwrite');
      tx.objectStore(USER_STORE).put(record);
    } catch (e) {
      console.warn('[OfflineStore] Failed writing user record to IDB:', e);
    }
  },

  /**
   * Get user-scoped data if valid and unexpired
   */
  async getUserData<T>(userId: string, key: string): Promise<T | null> {
    const recordId = `${userId}:${key}`;

    const mem = memoryStore.get(recordId);
    if (mem && (!mem.expiresAt || mem.expiresAt > Date.now())) {
      return mem.data as T;
    }

    const db = await getDB();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(USER_STORE, 'readonly');
        const req = tx.objectStore(USER_STORE).get(recordId);
        req.onsuccess = () => {
          const rec = req.result as StoredRecord<T> | undefined;
          if (!rec) {
            resolve(null);
            return;
          }
          if (rec.expiresAt && rec.expiresAt <= Date.now()) {
            resolve(null);
            return;
          }
          memoryStore.set(recordId, rec);
          resolve(rec.data);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  },

  /**
   * Purge all records for a user on sign out to prevent shared machine leakage
   */
  async clearUserData(userId: string): Promise<void> {
    for (const [k, v] of memoryStore.entries()) {
      if (v.userId === userId || k.startsWith(`${userId}:`)) {
        memoryStore.delete(k);
      }
    }

    const db = await getDB();
    if (!db) return;

    try {
      const tx = db.transaction(USER_STORE, 'readwrite');
      const store = tx.objectStore(USER_STORE);
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          const val = cursor.value as StoredRecord;
          if (val.userId === userId) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
    } catch (e) {
      console.warn('[OfflineStore] Failed clearing user data:', e);
    }
  },

  /**
   * Save public station data (e.g. Today's broadcast schedule or show list)
   */
  async setPublicData<T>(key: string, data: T, ttlMs = 43_200_000): Promise<void> {
    const record: StoredRecord<T> = {
      id: key,
      data,
      updatedAt: Date.now(),
      expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null,
    };

    memoryStore.set(`pub:${key}`, record);

    const db = await getDB();
    if (!db) return;

    try {
      const tx = db.transaction(PUBLIC_STORE, 'readwrite');
      tx.objectStore(PUBLIC_STORE).put(record);
    } catch (e) {
      console.warn('[OfflineStore] Failed writing public record to IDB:', e);
    }
  },

  /**
   * Get cached public data
   */
  async getPublicData<T>(key: string): Promise<T | null> {
    const mem = memoryStore.get(`pub:${key}`);
    if (mem && (!mem.expiresAt || mem.expiresAt > Date.now())) {
      return mem.data as T;
    }

    const db = await getDB();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(PUBLIC_STORE, 'readonly');
        const req = tx.objectStore(PUBLIC_STORE).get(key);
        req.onsuccess = () => {
          const rec = req.result as StoredRecord<T> | undefined;
          if (!rec) {
            resolve(null);
            return;
          }
          if (rec.expiresAt && rec.expiresAt <= Date.now()) {
            resolve(null);
            return;
          }
          memoryStore.set(`pub:${key}`, rec);
          resolve(rec.data);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  },
};
