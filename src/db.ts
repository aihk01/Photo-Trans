export interface StoredResultItem {
  id: string;
  sourceRatio: '16:9' | '4:5' | '9:16' | '1:1' | '3:4' | string;
  sourceIndex?: number;
  targetRatio: string;
  originalPreviewUrl?: string;
  resultUrl: string | null;
  status: 'pending' | 'processing' | 'success' | 'error';
  errorMessage?: string;
  traditionalHeadline?: string;
  simplifiedHeadline?: string;
  brandLogos?: string[];
  createdAt: number;
}

const DB_NAME = 'TransCharImageStore';
const DB_VERSION = 1;
const STORE_NAME = 'results';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllSavedResults(): Promise<StoredResultItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = (request.result as StoredResultItem[]) || [];
        // Sort newest first
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(items);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to get saved results from IndexedDB:', err);
    return [];
  }
}

export async function saveSingleResult(item: StoredResultItem): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to save result to IndexedDB:', err);
  }
}

export async function saveMultipleResults(items: StoredResultItem[]): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      
      for (const item of items) {
        store.put(item);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Failed to save multiple results to IndexedDB:', err);
  }
}

export async function deleteSingleResult(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to delete result from IndexedDB:', err);
  }
}

export async function clearAllSavedResults(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to clear results from IndexedDB:', err);
  }
}
