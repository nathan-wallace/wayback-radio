const DB_NAME = 'wayback-radio-offline';
const DB_VERSION = 1;

export const OFFLINE_STORES = {
  catalogEntries: 'catalog_entries',
  items: 'items',
  yearItems: 'year_items',
  favorites: 'favorites',
  filters: 'filters',
  syncMeta: 'sync_meta',
};

const memoryDb = {
  [OFFLINE_STORES.catalogEntries]: new Map(),
  [OFFLINE_STORES.items]: new Map(),
  [OFFLINE_STORES.yearItems]: new Map(),
  [OFFLINE_STORES.favorites]: new Map(),
  [OFFLINE_STORES.filters]: new Map(),
  [OFFLINE_STORES.syncMeta]: new Map(),
};

let dbPromise = null;

function supportsIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function cloneValue(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function getKey(value) {
  return value?.id ?? value?.key ?? value?.year;
}

function openDatabase() {
  if (!supportsIndexedDb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(OFFLINE_STORES.catalogEntries)) {
        db.createObjectStore(OFFLINE_STORES.catalogEntries, { keyPath: 'year' });
      }

      if (!db.objectStoreNames.contains(OFFLINE_STORES.items)) {
        const itemsStore = db.createObjectStore(OFFLINE_STORES.items, { keyPath: 'id' });
        itemsStore.createIndex('routeId', 'routeId', { unique: false });
        itemsStore.createIndex('uid', 'uid', { unique: false });
      }

      if (!db.objectStoreNames.contains(OFFLINE_STORES.yearItems)) {
        const yearItemsStore = db.createObjectStore(OFFLINE_STORES.yearItems, { keyPath: 'key' });
        yearItemsStore.createIndex('year', 'year', { unique: false });
      }

      if (!db.objectStoreNames.contains(OFFLINE_STORES.favorites)) {
        db.createObjectStore(OFFLINE_STORES.favorites, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(OFFLINE_STORES.filters)) {
        db.createObjectStore(OFFLINE_STORES.filters, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(OFFLINE_STORES.syncMeta)) {
        db.createObjectStore(OFFLINE_STORES.syncMeta, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    console.warn('IndexedDB unavailable, falling back to in-memory persistence.', error);
    return null;
  });

  return dbPromise;
}

export async function idbGet(storeName, key) {
  const db = await openDatabase();
  if (!db) {
    return cloneValue(memoryDb[storeName].get(key) ?? null);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function idbGetAll(storeName) {
  const db = await openDatabase();
  if (!db) {
    return Array.from(memoryDb[storeName].values()).map((value) => cloneValue(value));
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

export async function idbPut(storeName, value) {
  const db = await openDatabase();
  if (!db) {
    memoryDb[storeName].set(getKey(value), cloneValue(value));
    return cloneValue(value);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function idbDelete(storeName, key) {
  const db = await openDatabase();
  if (!db) {
    memoryDb[storeName].delete(key);
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function idbClear(storeName) {
  const db = await openDatabase();
  if (!db) {
    memoryDb[storeName].clear();
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function idbFindByIndex(storeName, indexName, value) {
  const db = await openDatabase();
  if (!db) {
    const records = Array.from(memoryDb[storeName].values());
    const match = records.find((record) => record?.[indexName] === value);
    return cloneValue(match ?? null);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const index = transaction.objectStore(storeName).index(indexName);
    const request = index.get(value);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export const __testing = {
  async resetOfflineDb() {
    await Promise.all(Object.values(OFFLINE_STORES).map((storeName) => idbClear(storeName)));
  },
};
