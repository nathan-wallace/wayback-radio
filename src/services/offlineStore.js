import {
  OFFLINE_STORES,
  __testing as offlineDbTesting,
  idbClear,
  idbFindByIndex,
  idbGet,
  idbGetAll,
  idbPut,
} from './offlineDb';
import { saveEntityFreshness } from './offlineStateService';

function isFresh(record, ttl) {
  if (!record) return false;
  if (record.expiresAt != null) {
    return Date.now() < record.expiresAt;
  }
  if (!ttl) return true;

  const fetchedAt = record.fetchedAt ?? record.updatedAt;
  if (!fetchedAt) return false;
  return Date.now() - fetchedAt < ttl;
}

function createYearItemKey(year, requestedIdentity = null) {
  return `${year}::${requestedIdentity || ''}`;
}

function buildFreshness({ fetchedAt, expiresAt, lastPlayedAt }) {
  return {
    fetchedAt: fetchedAt ?? null,
    expiresAt: expiresAt ?? null,
    lastPlayedAt: lastPlayedAt ?? null,
  };
}

async function persistFreshness(entityKey, freshness) {
  await saveEntityFreshness(entityKey, freshness);
}

function assembleItemResult(record) {
  if (!record) return null;
  return {
    audioUrl: record.audioUrl ?? null,
    metadata: record.metadata ?? null,
    error: record.error ?? null,
    itemId: record.routeId || record.id || null,
    freshness: buildFreshness(record),
  };
}

function normalizeFreshness(freshness = {}, ttl = 0) {
  const fetchedAt = freshness?.fetchedAt ?? freshness?.updatedAt ?? Date.now();
  return {
    fetchedAt,
    expiresAt: freshness?.expiresAt ?? (ttl ? fetchedAt + ttl : null),
    lastPlayedAt: freshness?.lastPlayedAt ?? null,
  };
}

export async function getCatalogSnapshot({ ttl } = {}) {
  const meta = await idbGet(OFFLINE_STORES.syncMeta, 'catalog');
  if (!meta || !isFresh(meta, ttl)) {
    return null;
  }

  const entries = await idbGetAll(OFFLINE_STORES.catalogEntries);
  return {
    entries: entries.sort((a, b) => a.year - b.year),
    source: meta.source || null,
    generatedAt: meta.generatedAt || null,
    error: meta.error || null,
    freshness: buildFreshness(meta),
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
    freshness: buildFreshness(meta),
  };
}

export async function saveCatalogSnapshot({ entries = [], source = null, generatedAt = null, error = null, freshness } = {}) {
  const normalizedFreshness = normalizeFreshness(freshness);
  await idbClear(OFFLINE_STORES.catalogEntries);
  await Promise.all(entries.map((entry) => idbPut(OFFLINE_STORES.catalogEntries, {
    ...entry,
    fetchedAt: normalizedFreshness.fetchedAt,
    expiresAt: normalizedFreshness.expiresAt,
  })));
  await idbPut(OFFLINE_STORES.syncMeta, {
    key: 'catalog',
    source,
    generatedAt,
    error,
    ...normalizedFreshness,
  });
  await persistFreshness('catalog', normalizedFreshness);
}

async function lookupItemRecord(lookupValue) {
  const directRecord = await idbGet(OFFLINE_STORES.items, lookupValue);
  const routeRecord = directRecord || await idbFindByIndex(OFFLINE_STORES.items, 'routeId', lookupValue);
  const uidRecord = routeRecord || await idbFindByIndex(OFFLINE_STORES.items, 'uid', lookupValue);
  return uidRecord;
}

export async function getItemByLookup(lookupValue, { ttl } = {}) {
  if (!lookupValue) return null;

  const record = await lookupItemRecord(lookupValue);
  if (!record || !isFresh(record, ttl)) {
    return null;
  }

  return assembleItemResult(record);
}

export async function getStaleItemByLookup(lookupValue) {
  if (!lookupValue) return null;

  const record = await lookupItemRecord(lookupValue);
  return assembleItemResult(record);
}

export async function saveItemRecord(record, { ttl, freshness } = {}) {
  if (!record?.id) return null;

  const normalizedFreshness = normalizeFreshness(freshness || record, ttl);
  const nextRecord = {
    ...record,
    ...normalizedFreshness,
  };

  await idbPut(OFFLINE_STORES.items, nextRecord);
  await persistFreshness(`item:${record.id}`, normalizedFreshness);
  if (record.routeId && record.routeId !== record.id) {
    await persistFreshness(`route:${record.routeId}`, normalizedFreshness);
  }
  if (record.uid) {
    await persistFreshness(`uid:${record.uid}`, normalizedFreshness);
  }
  return nextRecord;
}

async function getYearSelectionRecord(year, requestedIdentity = null) {
  return idbGet(OFFLINE_STORES.yearItems, createYearItemKey(year, requestedIdentity));
}

async function assembleYearSelection(record, { ttl } = {}) {
  if (!record || (!isFresh(record, ttl) && ttl !== undefined)) {
    return null;
  }

  if (!record.itemId) {
    return {
      audioUrl: null,
      metadata: null,
      error: record.error || null,
      itemUids: record.itemUids || [],
      itemId: null,
      freshness: buildFreshness(record),
    };
  }

  const itemResult = ttl === undefined
    ? await getStaleItemByLookup(record.itemId)
    : await getItemByLookup(record.itemId, { ttl });
  if (!itemResult) {
    return null;
  }

  return {
    ...itemResult,
    itemUids: record.itemUids || [],
    freshness: buildFreshness(record),
  };
}

export async function getYearSelection(year, requestedIdentity = null, { ttl } = {}) {
  const record = await getYearSelectionRecord(year, requestedIdentity);
  return assembleYearSelection(record, { ttl });
}

export async function getStaleYearSelection(year, requestedIdentity = null) {
  const record = await getYearSelectionRecord(year, requestedIdentity);
  return assembleYearSelection(record);
}

export async function saveYearSelection(year, requestedIdentity = null, result, itemRecord = null, { ttl, freshness } = {}) {
  const normalizedFreshness = normalizeFreshness(freshness || result, ttl);

  if (itemRecord?.id) {
    await saveItemRecord({
      ...itemRecord,
      lastPlayedAt: itemRecord.lastPlayedAt ?? normalizedFreshness.lastPlayedAt,
    }, { ttl, freshness: normalizedFreshness });
  }

  const yearSelectionRecord = {
    key: createYearItemKey(year, requestedIdentity),
    year,
    requestedIdentity: requestedIdentity || null,
    itemId: itemRecord?.id || null,
    itemUids: result?.itemUids || [],
    error: result?.error || null,
    ...normalizedFreshness,
  };

  await idbPut(OFFLINE_STORES.yearItems, yearSelectionRecord);
  await persistFreshness(`year:${year}:${requestedIdentity || ''}`, normalizedFreshness);
  return yearSelectionRecord;
}

export async function getCachedLibrarySnapshot() {
  const [catalogEntries, items, yearSelections] = await Promise.all([
    idbGetAll(OFFLINE_STORES.catalogEntries),
    idbGetAll(OFFLINE_STORES.items),
    idbGetAll(OFFLINE_STORES.yearItems),
  ]);

  return {
    catalogEntries: catalogEntries.sort((a, b) => a.year - b.year),
    items,
    yearSelections,
  };
}

export const __testing = {
  async resetOfflineStore() {
    await offlineDbTesting.resetOfflineDb();
  },
  createYearItemKey,
};
