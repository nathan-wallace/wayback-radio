import {
  OFFLINE_STORES,
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
} from './offlineDb';

const FILTERS_KEY = 'active-filters';
const SYNC_STATE_KEY = 'app-sync-state';
const ENTITY_PREFIX = 'entity:';

export const DEFAULT_FILTERS = {
  yearRange: {
    start: null,
    end: null,
  },
  hasAudioOnly: false,
  favoritesOnly: false,
};

export const DEFAULT_SYNC_STATE = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  lastSuccessfulSync: null,
  pendingRefresh: false,
};

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function normalizeTimestamp(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeYearBoundary(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeStableId(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

export function normalizeOfflineFilters(filters = {}) {
  const normalizedStart = normalizeYearBoundary(filters?.yearRange?.start ?? filters?.yearStart ?? null);
  const normalizedEnd = normalizeYearBoundary(filters?.yearRange?.end ?? filters?.yearEnd ?? null);
  const start = normalizedStart != null && normalizedEnd != null
    ? Math.min(normalizedStart, normalizedEnd)
    : normalizedStart;
  const end = normalizedStart != null && normalizedEnd != null
    ? Math.max(normalizedStart, normalizedEnd)
    : normalizedEnd;

  return {
    yearRange: {
      start,
      end,
    },
    hasAudioOnly: normalizeBoolean(filters?.hasAudioOnly, DEFAULT_FILTERS.hasAudioOnly),
    favoritesOnly: normalizeBoolean(filters?.favoritesOnly, DEFAULT_FILTERS.favoritesOnly),
  };
}

function normalizeSyncState(syncState = {}) {
  return {
    online: normalizeBoolean(syncState?.online, DEFAULT_SYNC_STATE.online),
    lastSuccessfulSync: normalizeTimestamp(syncState?.lastSuccessfulSync),
    pendingRefresh: normalizeBoolean(syncState?.pendingRefresh, DEFAULT_SYNC_STATE.pendingRefresh),
  };
}

function normalizeFavoriteRecord(record = {}) {
  const id = normalizeStableId(record?.id);
  if (!id) return null;

  return {
    id,
    routeId: normalizeStableId(record?.routeId),
    uid: normalizeStableId(record?.uid) || id,
    title: record?.title ? String(record.title) : null,
    year: normalizeYearBoundary(record?.year),
    createdAt: normalizeTimestamp(record?.createdAt) || Date.now(),
  };
}

function normalizeEntityFreshness(record = {}) {
  if (!record?.key?.startsWith(ENTITY_PREFIX)) {
    return null;
  }

  return {
    key: record.key.slice(ENTITY_PREFIX.length),
    fetchedAt: normalizeTimestamp(record.fetchedAt),
    expiresAt: normalizeTimestamp(record.expiresAt),
    lastPlayedAt: normalizeTimestamp(record.lastPlayedAt),
  };
}

function buildFavoritesState(records = []) {
  const favorites = records
    .map((record) => normalizeFavoriteRecord(record))
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return {
    favorites,
    favoriteIds: favorites.map((record) => record.id),
    favoritesById: Object.fromEntries(favorites.map((record) => [record.id, record])),
  };
}

function buildFreshnessState(records = []) {
  const freshnessEntries = records
    .map((record) => normalizeEntityFreshness(record))
    .filter(Boolean);

  return Object.fromEntries(freshnessEntries.map((record) => [record.key, record]));
}

function matchesYearRange(year, yearRange) {
  if (!yearRange) return true;
  const { start, end } = yearRange;
  if (start != null && year < start) return false;
  if (end != null && year > end) return false;
  return true;
}

function getYearFromItemRecord(itemRecord) {
  if (itemRecord?.metadata?.date != null) {
    const parsed = normalizeYearBoundary(itemRecord.metadata.date);
    if (parsed != null) return parsed;
  }

  return normalizeYearBoundary(itemRecord?.year);
}

function hasPlayableAudio(itemRecord) {
  return Boolean(itemRecord?.audioUrl || itemRecord?.metadata?.source?.length);
}

function buildFavoriteYearSet(yearSelections = [], itemRecords = [], favoritesById = {}) {
  const favoriteIds = new Set(Object.keys(favoritesById));
  const favoriteYears = new Set();

  yearSelections.forEach((selection) => {
    const year = normalizeYearBoundary(selection?.year);
    if (year == null) return;

    const matchingUid = (selection?.itemUids || []).some((itemUid) => favoriteIds.has(normalizeStableId(itemUid)));
    const matchingSelectedItem = favoriteIds.has(normalizeStableId(selection?.itemId));

    if (matchingUid || matchingSelectedItem) {
      favoriteYears.add(year);
    }
  });

  itemRecords.forEach((itemRecord) => {
    const candidates = [itemRecord?.uid, itemRecord?.routeId, itemRecord?.id]
      .map((value) => normalizeStableId(value))
      .filter(Boolean);

    if (!candidates.some((candidate) => favoriteIds.has(candidate))) {
      return;
    }

    const year = getYearFromItemRecord(itemRecord);
    if (year != null) {
      favoriteYears.add(year);
    }
  });

  return favoriteYears;
}

export function deriveFilteredCatalogEntries(
  catalogEntries = [],
  {
    filters = DEFAULT_FILTERS,
    favoritesById = {},
    itemRecords = [],
    yearSelections = [],
  } = {}
) {
  const normalizedFilters = normalizeOfflineFilters(filters);
  const favoriteYears = normalizedFilters.favoritesOnly
    ? buildFavoriteYearSet(yearSelections, itemRecords, favoritesById)
    : null;

  return (Array.isArray(catalogEntries) ? catalogEntries : []).filter((entry) => {
    const year = normalizeYearBoundary(entry?.year);
    if (year == null) return false;
    if (!matchesYearRange(year, normalizedFilters.yearRange)) {
      return false;
    }
    if (favoriteYears && !favoriteYears.has(year)) {
      return false;
    }
    return true;
  });
}

export function deriveFilteredItemUids(
  itemUids = [],
  {
    filters = DEFAULT_FILTERS,
    favoritesById = {},
    itemRecordsById = {},
  } = {}
) {
  const normalizedFilters = normalizeOfflineFilters(filters);
  const favoriteIds = new Set(Object.keys(favoritesById));

  return (Array.isArray(itemUids) ? itemUids : []).filter((itemUid) => {
    const normalizedId = normalizeStableId(itemUid);
    const itemRecord = itemRecordsById?.[normalizedId] || null;

    if (normalizedFilters.favoritesOnly && !favoriteIds.has(normalizedId)) {
      return false;
    }

    if (normalizedFilters.hasAudioOnly && itemRecord && !hasPlayableAudio(itemRecord)) {
      return false;
    }

    return true;
  });
}

export async function getActiveFilters() {
  const record = await idbGet(OFFLINE_STORES.filters, FILTERS_KEY);
  return normalizeOfflineFilters(record?.value || DEFAULT_FILTERS);
}

export async function saveActiveFilters(nextFilters) {
  const normalized = normalizeOfflineFilters(nextFilters);
  await idbPut(OFFLINE_STORES.filters, {
    key: FILTERS_KEY,
    value: normalized,
  });
  return normalized;
}

export async function getFavorites() {
  const records = await idbGetAll(OFFLINE_STORES.favorites);
  return buildFavoritesState(records);
}

export async function addFavorite(record) {
  const normalized = normalizeFavoriteRecord(record);
  if (!normalized) return null;
  await idbPut(OFFLINE_STORES.favorites, normalized);
  return normalized;
}

export async function removeFavorite(stableId) {
  const normalizedId = normalizeStableId(stableId);
  if (!normalizedId) return;
  await idbDelete(OFFLINE_STORES.favorites, normalizedId);
}

export async function toggleFavorite(record) {
  const normalized = normalizeFavoriteRecord(record);
  if (!normalized) {
    return { favorite: null, isFavorite: false };
  }

  const existing = await idbGet(OFFLINE_STORES.favorites, normalized.id);
  if (existing) {
    await removeFavorite(normalized.id);
    return { favorite: null, isFavorite: false };
  }

  await addFavorite(normalized);
  return { favorite: normalized, isFavorite: true };
}

export async function getSyncState() {
  const record = await idbGet(OFFLINE_STORES.syncMeta, SYNC_STATE_KEY);
  return normalizeSyncState(record || DEFAULT_SYNC_STATE);
}

export async function saveSyncState(nextSyncState) {
  const existing = await getSyncState();
  const normalized = normalizeSyncState({
    ...existing,
    ...nextSyncState,
  });
  await idbPut(OFFLINE_STORES.syncMeta, {
    key: SYNC_STATE_KEY,
    ...normalized,
  });
  return normalized;
}

export async function recordSuccessfulSync(timestamp = Date.now()) {
  return saveSyncState({
    lastSuccessfulSync: timestamp,
    pendingRefresh: false,
  });
}

export async function setPendingRefresh(pendingRefresh) {
  return saveSyncState({ pendingRefresh: Boolean(pendingRefresh) });
}

export async function setOnlineStatus(online) {
  return saveSyncState({ online: Boolean(online) });
}

export async function getEntityFreshness() {
  const records = await idbGetAll(OFFLINE_STORES.syncMeta);
  return buildFreshnessState(records);
}

export async function saveEntityFreshness(entityKey, updates = {}) {
  if (!entityKey) return null;

  const storageKey = `${ENTITY_PREFIX}${entityKey}`;
  const existing = await idbGet(OFFLINE_STORES.syncMeta, storageKey);
  const nextRecord = {
    key: storageKey,
    fetchedAt: normalizeTimestamp(updates?.fetchedAt ?? existing?.fetchedAt),
    expiresAt: normalizeTimestamp(updates?.expiresAt ?? existing?.expiresAt),
    lastPlayedAt: normalizeTimestamp(updates?.lastPlayedAt ?? existing?.lastPlayedAt),
  };

  await idbPut(OFFLINE_STORES.syncMeta, nextRecord);
  return normalizeEntityFreshness(nextRecord);
}

export async function touchLastPlayed(entityKey, timestamp = Date.now()) {
  return saveEntityFreshness(entityKey, {
    lastPlayedAt: timestamp,
  });
}

export async function getOfflineStateSnapshot() {
  const [favoriteState, filters, sync, freshnessByEntity] = await Promise.all([
    getFavorites(),
    getActiveFilters(),
    getSyncState(),
    getEntityFreshness(),
  ]);

  return {
    ...favoriteState,
    filters,
    sync,
    freshnessByEntity,
  };
}

export const __testing = {
  normalizeFavoriteRecord,
  normalizeSyncState,
  normalizeStableId,
};
