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

function isFresh(updatedAt, ttl) {
  if (!ttl) return true;
  if (!updatedAt) return false;
  return Date.now() - updatedAt < ttl;
}

function createYearItemKey(year, requestedIdentity = null) {
  return `${year}::${requestedIdentity || ''}`;
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

async function idbGet(storeName, key) {
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

async function idbGetAll(storeName) {
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

async function idbPut(storeName, value) {
  const db = await openDatabase();
  if (!db) {
    const key = value?.id ?? value?.key ?? value?.year;
    memoryDb[storeName].set(key, cloneValue(value));
    return cloneValue(value);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function idbClear(storeName) {
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

async function idbFindByIndex(storeName, indexName, value) {
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

function assembleItemResult(record) {
  if (!record) return null;
  return {
    audioUrl: record.audioUrl ?? null,
    metadata: record.metadata ?? null,
    error: record.error ?? null,
    itemId: record.routeId || record.id || null,
  };
}

export async function getCatalogSnapshot({ ttl } = {}) {
  const meta = await idbGet(OFFLINE_STORES.syncMeta, 'catalog');
  if (!meta || !isFresh(meta.updatedAt, ttl)) {
    return null;
  }

  const entries = await idbGetAll(OFFLINE_STORES.catalogEntries);
  return {
    entries: entries.sort((a, b) => a.year - b.year),
    source: meta.source || null,
    generatedAt: meta.generatedAt || null,
    error: meta.error || null,
    updatedAt: meta.updatedAt || null,
  };
}

export async function getStaleCatalogSnapshot() {
  const meta = await idbGet(OFFLINE_STORES.syncMeta, 'catalog');
  if (!meta) {
    return null;
  }

  const entries = await idbGetAll(OFFLINE_STORES.catalogEntries);
  return {
    entries: entries.sort((a, b) => a.year - b.year),
    source: meta.source || null,
    generatedAt: meta.generatedAt || null,
    error: meta.error || null,
    updatedAt: meta.updatedAt || null,
  };
}

export async function saveCatalogSnapshot({ entries = [], source = null, generatedAt = null, error = null }) {
  const updatedAt = Date.now();
  await idbClear(OFFLINE_STORES.catalogEntries);
  await Promise.all(entries.map((entry) => idbPut(OFFLINE_STORES.catalogEntries, {
    ...entry,
    updatedAt,
  })));
  await idbPut(OFFLINE_STORES.syncMeta, {
    key: 'catalog',
    source,
    generatedAt,
    error,
    updatedAt,
  });
}

export async function getItemByLookup(lookupValue, { ttl } = {}) {
  if (!lookupValue) return null;

  const directRecord = await idbGet(OFFLINE_STORES.items, lookupValue);
  const routeRecord = directRecord || await idbFindByIndex(OFFLINE_STORES.items, 'routeId', lookupValue);
  const uidRecord = routeRecord || await idbFindByIndex(OFFLINE_STORES.items, 'uid', lookupValue);
  const record = uidRecord;

  if (!record || !isFresh(record.updatedAt, ttl)) {
    return null;
  }

  return assembleItemResult(record);
}

export async function saveItemRecord(record) {
  if (!record?.id) return;

  await idbPut(OFFLINE_STORES.items, {
    ...record,
    updatedAt: record.updatedAt || Date.now(),
  });
}

export async function getYearSelection(year, requestedIdentity = null, { ttl } = {}) {
  const record = await idbGet(OFFLINE_STORES.yearItems, createYearItemKey(year, requestedIdentity));
  if (!record || !isFresh(record.updatedAt, ttl)) {
    return null;
  }

  if (!record.itemId) {
    return {
      audioUrl: null,
      metadata: null,
      error: record.error || null,
      itemUids: record.itemUids || [],
      itemId: null,
    };
  }

  const itemResult = await getItemByLookup(record.itemId, { ttl });
  if (!itemResult) {
    return null;
  }

  return {
    ...itemResult,
    itemUids: record.itemUids || [],
  };
}

export async function saveYearSelection(year, requestedIdentity = null, result, itemRecord = null) {
  const updatedAt = Date.now();

  if (itemRecord?.id) {
    await saveItemRecord({
      ...itemRecord,
      updatedAt,
    });
  }

  await idbPut(OFFLINE_STORES.yearItems, {
    key: createYearItemKey(year, requestedIdentity),
    year,
    requestedIdentity: requestedIdentity || null,
    itemId: itemRecord?.id || null,
    itemUids: result?.itemUids || [],
    error: result?.error || null,
    updatedAt,
  });
}

export const __testing = {
  async resetOfflineStore() {
    await Promise.all(Object.values(OFFLINE_STORES).map((storeName) => idbClear(storeName)));
  },
  createYearItemKey,
};
