import {
  OFFLINE_STORES,
  __testing as offlineDbTesting,
  idbClear,
  idbDelete,
  idbFindByIndex,
  idbGet,
  idbGetAll,
  idbPut,
} from './offlineDb';
import { saveEntityFreshness } from './offlineStateService';

const CATALOG_META_KEY = 'catalog';

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

function buildFreshness({ fetchedAt, expiresAt, lastPlayedAt, datasetVersion }) {
  return {
    fetchedAt: fetchedAt ?? null,
    expiresAt: expiresAt ?? null,
    lastPlayedAt: lastPlayedAt ?? null,
    datasetVersion: datasetVersion ?? null,
  };
}

function normalizeDatasetVersion(datasetVersion) {
  if (datasetVersion == null || datasetVersion === '') {
    return null;
  }

  const normalized = String(datasetVersion).trim();
  return normalized || null;
}

function isDatasetVersionMatch(record, datasetVersion) {
  const normalizedVersion = normalizeDatasetVersion(datasetVersion);
  if (!normalizedVersion) {
    return true;
  }

  return normalizeDatasetVersion(record?.datasetVersion) === normalizedVersion;
}

async function persistFreshness(entityKey, freshness, datasetVersion = null) {
  await saveEntityFreshness(entityKey, {
    ...freshness,
    datasetVersion: normalizeDatasetVersion(datasetVersion ?? freshness?.datasetVersion),
  });
}

function assembleItemResult(record) {
  if (!record) return null;
  return {
    audioUrl: record.audioUrl ?? null,
    metadata: record.metadata ?? null,
    error: record.error ?? null,
    itemId: record.routeId || record.id || null,
    source: record.source ?? null,
    freshness: buildFreshness(record),
  };
}

function normalizeFreshness(freshness = {}, ttl = 0, datasetVersion = null) {
  const fetchedAt = freshness?.fetchedAt ?? freshness?.updatedAt ?? Date.now();
  return {
    fetchedAt,
    expiresAt: freshness?.expiresAt ?? (ttl ? fetchedAt + ttl : null),
    lastPlayedAt: freshness?.lastPlayedAt ?? null,
    datasetVersion: normalizeDatasetVersion(datasetVersion ?? freshness?.datasetVersion),
  };
}

async function deleteRecordsMatching(storeName, predicate) {
  const records = await idbGetAll(storeName);
  await Promise.all(records.filter(predicate).map((record) => idbDelete(storeName, record?.id ?? record?.key ?? record?.year)));
}

function isVersionedRecordStale(record, datasetVersion) {
  const normalizedVersion = normalizeDatasetVersion(datasetVersion);
  if (!normalizedVersion) return false;
  return normalizeDatasetVersion(record?.datasetVersion) !== normalizedVersion;
}

export async function clearVersionedRecords(datasetVersion = null) {
  const normalizedVersion = normalizeDatasetVersion(datasetVersion);
  if (!normalizedVersion) {
    await Promise.all([
      idbClear(OFFLINE_STORES.catalogEntries),
      idbClear(OFFLINE_STORES.items),
      idbClear(OFFLINE_STORES.yearItems),
    ]);
    return;
  }

  await Promise.all([
    deleteRecordsMatching(OFFLINE_STORES.catalogEntries, (record) => isVersionedRecordStale(record, normalizedVersion)),
    deleteRecordsMatching(OFFLINE_STORES.items, (record) => isVersionedRecordStale(record, normalizedVersion)),
    deleteRecordsMatching(OFFLINE_STORES.yearItems, (record) => isVersionedRecordStale(record, normalizedVersion)),
  ]);
}

export async function getCatalogSnapshot({ ttl, datasetVersion } = {}) {
  const meta = await idbGet(OFFLINE_STORES.syncMeta, CATALOG_META_KEY);
  if (!meta || !isDatasetVersionMatch(meta, datasetVersion) || !isFresh(meta, ttl)) {
    return null;
  }

  const entries = (await idbGetAll(OFFLINE_STORES.catalogEntries))
    .filter((entry) => isDatasetVersionMatch(entry, datasetVersion));
  return {
    entries: entries.sort((a, b) => a.year - b.year),
    source: meta.source || null,
    generatedAt: meta.generatedAt || null,
    error: meta.error || null,
    datasetVersion: normalizeDatasetVersion(meta.datasetVersion),
    freshness: buildFreshness(meta),
  };
}

export async function getStaleCatalogSnapshot({ datasetVersion } = {}) {
  const meta = await idbGet(OFFLINE_STORES.syncMeta, CATALOG_META_KEY);
  if (!meta || !isDatasetVersionMatch(meta, datasetVersion)) {
    return null;
  }

  const entries = (await idbGetAll(OFFLINE_STORES.catalogEntries))
    .filter((entry) => isDatasetVersionMatch(entry, datasetVersion));
  return {
    entries: entries.sort((a, b) => a.year - b.year),
    source: meta.source || null,
    generatedAt: meta.generatedAt || null,
    error: meta.error || null,
    datasetVersion: normalizeDatasetVersion(meta.datasetVersion),
    freshness: buildFreshness(meta),
  };
}

export async function saveCatalogSnapshot({ entries = [], source = null, generatedAt = null, error = null, freshness, datasetVersion } = {}) {
  const normalizedFreshness = normalizeFreshness(freshness, 0, datasetVersion);
  await clearVersionedRecords(normalizedFreshness.datasetVersion);
  await idbClear(OFFLINE_STORES.catalogEntries);
  await Promise.all(entries.map((entry) => idbPut(OFFLINE_STORES.catalogEntries, {
    ...entry,
    datasetVersion: normalizedFreshness.datasetVersion,
    fetchedAt: normalizedFreshness.fetchedAt,
    expiresAt: normalizedFreshness.expiresAt,
  })));
  await idbPut(OFFLINE_STORES.syncMeta, {
    key: CATALOG_META_KEY,
    source,
    generatedAt,
    error,
    ...normalizedFreshness,
  });
  await persistFreshness('catalog', normalizedFreshness, normalizedFreshness.datasetVersion);
}

async function lookupItemRecord(lookupValue) {
  const directRecord = await idbGet(OFFLINE_STORES.items, lookupValue);
  const routeRecord = directRecord || await idbFindByIndex(OFFLINE_STORES.items, 'routeId', lookupValue);
  const uidRecord = routeRecord || await idbFindByIndex(OFFLINE_STORES.items, 'uid', lookupValue);
  return uidRecord;
}

export async function getItemByLookup(lookupValue, { ttl, datasetVersion } = {}) {
  if (!lookupValue) return null;

  const record = await lookupItemRecord(lookupValue);
  if (!record || !isDatasetVersionMatch(record, datasetVersion) || !isFresh(record, ttl)) {
    return null;
  }

  return assembleItemResult(record);
}

export async function getStaleItemByLookup(lookupValue, { datasetVersion } = {}) {
  if (!lookupValue) return null;

  const record = await lookupItemRecord(lookupValue);
  if (!record || !isDatasetVersionMatch(record, datasetVersion)) {
    return null;
  }

  return assembleItemResult(record);
}

export async function saveItemRecord(record, { ttl, freshness, datasetVersion } = {}) {
  if (!record?.id) return null;

  const normalizedFreshness = normalizeFreshness(freshness || record, ttl, datasetVersion ?? record?.datasetVersion);
  const nextRecord = {
    ...record,
    ...normalizedFreshness,
  };

  await idbPut(OFFLINE_STORES.items, nextRecord);
  await persistFreshness(`item:${record.id}`, normalizedFreshness, normalizedFreshness.datasetVersion);
  if (record.routeId && record.routeId !== record.id) {
    await persistFreshness(`route:${record.routeId}`, normalizedFreshness, normalizedFreshness.datasetVersion);
  }
  if (record.uid) {
    await persistFreshness(`uid:${record.uid}`, normalizedFreshness, normalizedFreshness.datasetVersion);
  }
  return nextRecord;
}

async function getYearSelectionRecord(year, requestedIdentity = null) {
  return idbGet(OFFLINE_STORES.yearItems, createYearItemKey(year, requestedIdentity));
}

async function assembleYearSelection(record, { ttl, datasetVersion } = {}) {
  if (!record || !isDatasetVersionMatch(record, datasetVersion) || (!isFresh(record, ttl) && ttl !== undefined)) {
    return null;
  }

  if (!record.itemId) {
    return {
      audioUrl: null,
      metadata: null,
      error: record.error || null,
      itemUids: record.itemUids || [],
      itemRouteIds: record.itemRouteIds || [],
      itemId: null,
      freshness: buildFreshness(record),
    };
  }

  const itemResult = ttl === undefined
    ? await getStaleItemByLookup(record.itemId, { datasetVersion })
    : await getItemByLookup(record.itemId, { ttl, datasetVersion });
  if (!itemResult) {
    return null;
  }

  return {
    ...itemResult,
    itemUids: record.itemUids || [],
    itemRouteIds: record.itemRouteIds || [],
    freshness: buildFreshness(record),
  };
}

export async function getYearSelection(year, requestedIdentity = null, { ttl, datasetVersion } = {}) {
  const record = await getYearSelectionRecord(year, requestedIdentity);
  return assembleYearSelection(record, { ttl, datasetVersion });
}

export async function getStaleYearSelection(year, requestedIdentity = null, { datasetVersion } = {}) {
  const record = await getYearSelectionRecord(year, requestedIdentity);
  return assembleYearSelection(record, { datasetVersion });
}

export async function saveYearSelection(year, requestedIdentity = null, result, itemRecord = null, { ttl, freshness, datasetVersion } = {}) {
  const normalizedFreshness = normalizeFreshness(freshness || result, ttl, datasetVersion);

  if (itemRecord?.id) {
    await saveItemRecord({
      ...itemRecord,
      datasetVersion: normalizedFreshness.datasetVersion,
      lastPlayedAt: itemRecord.lastPlayedAt ?? normalizedFreshness.lastPlayedAt,
    }, { ttl, freshness: normalizedFreshness, datasetVersion: normalizedFreshness.datasetVersion });
  }

  const yearSelectionRecord = {
    key: createYearItemKey(year, requestedIdentity),
    year,
    requestedIdentity: requestedIdentity || null,
    itemId: itemRecord?.id || null,
    itemUids: result?.itemUids || [],
    itemRouteIds: result?.itemRouteIds || [],
    error: result?.error || null,
    ...normalizedFreshness,
  };

  await idbPut(OFFLINE_STORES.yearItems, yearSelectionRecord);
  await persistFreshness(`year:${year}:${requestedIdentity || ''}`, normalizedFreshness, normalizedFreshness.datasetVersion);
  return yearSelectionRecord;
}

export async function getCachedLibrarySnapshot({ datasetVersion } = {}) {
  const [catalogEntries, items, yearSelections] = await Promise.all([
    idbGetAll(OFFLINE_STORES.catalogEntries),
    idbGetAll(OFFLINE_STORES.items),
    idbGetAll(OFFLINE_STORES.yearItems),
  ]);

  return {
    catalogEntries: catalogEntries
      .filter((record) => isDatasetVersionMatch(record, datasetVersion))
      .sort((a, b) => a.year - b.year),
    items: items.filter((record) => isDatasetVersionMatch(record, datasetVersion)),
    yearSelections: yearSelections.filter((record) => isDatasetVersionMatch(record, datasetVersion)),
  };
}

export const __testing = {
  async resetOfflineStore() {
    await offlineDbTesting.resetOfflineDb();
  },
  createYearItemKey,
  normalizeDatasetVersion,
};
