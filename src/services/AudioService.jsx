import archiveCache from '../data/archive-cache.json';
import { buildDatasetUrl } from '../utils/datasetUrl';
import {
  asArray,
  buildMetadata,
  buildSelectionKeys,
  extractLocItemId,
  extractUid,
  extractYear,
  getAudioUrlFromResources,
  isPlayableResource,
  isPlayableSearchItem,
  normalizeLocItemId,
  normalizeMetadata,
  normalizeRouteIdentity,
  normalizeText,
} from '../../shared/locNormalization.mjs';
import {
  getCatalogSnapshot,
  getItemByLookup,
  getStaleCatalogSnapshot,
  getStaleItemByLookup,
  getStaleYearSelection,
  getYearSelection,
  saveCatalogSnapshot,
  saveItemRecord,
  saveYearSelection,
} from './offlineStore';

const BASE_URL = 'https://www.loc.gov';
const AUDIO_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const CATALOG_CACHE_TTL = 24 * 60 * 60 * 1000;
export const datasetUrls = Object.freeze({
  manifest: () => buildDatasetUrl('manifest.json'),
  catalog: () => buildDatasetUrl('catalog.json'),
  yearManifest: (year) => buildDatasetUrl(`catalog/years/${year}.json`),
  item: (itemId) => buildDatasetUrl(`items/${itemId}.json`),
  audio: (year) => buildDatasetUrl(`audio/${year}.json`)
});

function buildFreshness(ttl, now = Date.now()) {
  return {
    fetchedAt: now,
    expiresAt: ttl ? now + ttl : null,
  };
}
const CATALOG_PAGE_SIZE = 100;
const MAX_CATALOG_SAMPLE_IDS = 3;
const MAX_CATALOG_PAGES = 100;

const audioCache = new Map();
const yearManifestCache = new Map();
const requestCache = new Map();
const locApiState = {
  unavailable: false,
  reason: null,
};
const bootstrapAudioByYear = archiveCache?.audioByYear || {};
const bootstrapCatalogEntries = archiveCache?.catalog?.entries
  || archiveCache?.catalogEntries
  || (archiveCache?.availableYears || []).map((year) => ({
    year,
    itemCount: null,
    sampleItemIds: [],
    status: 'manifest'
  }));
export const CURRENT_DATASET_VERSION = normalizeText(archiveCache?.version || archiveCache?.manifestVersion || archiveCache?.generatedAt) || 'bootstrap-manifest';

const bootstrapCatalogPayload = bootstrapCatalogEntries.length
  ? buildCatalogPayload(bootstrapCatalogEntries, {
    error: null,
    source: archiveCache?.catalog?.source || archiveCache?.source || 'bootstrap-manifest',
    generatedAt: archiveCache?.catalog?.generatedAt || archiveCache?.generatedAt || null
  })
  : null;

let availableYearsCache = null;
let bootstrapCatalogRefreshPromise = null;
const bootstrapYearRefreshPromises = new Map();

function shouldAutoRefreshBootstrappedData() {
  if (typeof globalThis.__WAYBACK_ENABLE_BOOTSTRAP_AUTO_REFRESH__ === 'boolean') {
    return globalThis.__WAYBACK_ENABLE_BOOTSTRAP_AUTO_REFRESH__;
  }

  const hostname = globalThis?.location?.hostname;
  if (!hostname) return true;

  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}

function createLocApiUnavailableError(message = 'Library of Congress JSON API is unavailable from this origin.') {
  const error = new Error(message);
  error.name = 'LocApiUnavailableError';
  error.code = 'LOC_API_UNAVAILABLE';
  error.isLocApiUnavailable = true;
  return error;
}

function markLocApiUnavailable(reason = 'unknown') {
  locApiState.unavailable = true;
  locApiState.reason = reason;
}

function isLocApiUnavailableError(error) {
  return Boolean(error?.isLocApiUnavailable || error?.code === 'LOC_API_UNAVAILABLE');
}

function shouldSkipLocApiRequests() {
  return locApiState.unavailable;
}

function isCrossOriginLocAudioResource(url) {
  const normalizedUrl = normalizeText(url);
  return normalizedUrl.startsWith(`${BASE_URL}/resource/`);
}

function normalizeBootstrapAudioResult(result) {
  if (!result) return result;

  if (!isCrossOriginLocAudioResource(result.audioUrl)) {
    return result;
  }

  return {
    ...result,
    audioUrl: null,
    error: result.error || 'Library of Congress playback is blocked from this origin, so this bundled recording metadata is view-only until a live refresh succeeds.'
  };
}

function normalizeCatalogEntries(entries) {
  if (!Array.isArray(entries)) return [];

  const deduped = new Map();

  entries.forEach((entry) => {
    const year = Number.parseInt(
      typeof entry === 'number' ? entry : entry?.year,
      10
    );
    if (!year) return;

    const existing = deduped.get(year);
    const itemCount = Number.isFinite(entry?.itemCount)
      ? Math.max(0, Number.parseInt(entry.itemCount, 10))
      : null;
    const sampleItemIds = Array.isArray(entry?.sampleItemIds)
      ? entry.sampleItemIds.filter(Boolean).slice(0, MAX_CATALOG_SAMPLE_IDS)
      : [];
    const normalizedEntry = {
      year,
      itemCount,
      sampleItemIds,
      status: entry?.status || (itemCount === 0 ? 'empty' : 'ready')
    };

    if (!existing) {
      deduped.set(year, normalizedEntry);
      return;
    }

    const nextCount = existing.itemCount == null || normalizedEntry.itemCount == null
      ? existing.itemCount ?? normalizedEntry.itemCount
      : existing.itemCount + normalizedEntry.itemCount;

    deduped.set(year, {
      ...existing,
      itemCount: nextCount,
      sampleItemIds: [...new Set([
        ...existing.sampleItemIds,
        ...normalizedEntry.sampleItemIds
      ])].slice(0, MAX_CATALOG_SAMPLE_IDS),
      status: existing.status === 'ready' || normalizedEntry.status === 'ready'
        ? 'ready'
        : normalizedEntry.status || existing.status
    });
  });

  return Array.from(deduped.values()).sort((a, b) => a.year - b.year);
}

function buildCatalogPayload(entries, meta = {}) {
  const normalizedEntries = normalizeCatalogEntries(entries);

  return {
    entries: normalizedEntries,
    years: normalizedEntries
      .filter((entry) => entry.itemCount !== 0)
      .map((entry) => entry.year),
    byYear: Object.fromEntries(normalizedEntries.map((entry) => [entry.year, entry])),
    source: meta.source || null,
    generatedAt: meta.generatedAt || null,
    error: meta.error || null
  };
}


function normalizeAudioResult(result) {
  if (!result) return result;

  return {
    ...result,
    metadata: normalizeMetadata(result.metadata),
  };
}


function buildItemIdentityVariants(item) {
  const itemId = normalizeLocItemId(item?.id);
  const title = normalizeText(item?.title || item?.item?.title);
  const uid = extractUid(item?.id);

  return buildSelectionKeys(
    item?.id,
    itemId,
    uid,
    uid ? `ihas.${uid}` : null,
    title,
    title ? encodeURIComponent(title) : null,
    itemId ? encodeURIComponent(itemId) : null,
  );
}

function getItemRouteId(item, itemData = null) {
  const itemId = extractLocItemId(item?.id || itemData?.id);
  if (itemId) return itemId;

  const title = normalizeText(itemData?.title || itemData?.item?.title || item?.title);
  return title ? encodeURIComponent(title) : null;
}

function buildManifestSelectionKeys(item) {
  const routeId = normalizeText(item?.routeId);
  const title = normalizeText(item?.title);
  const uid = normalizeText(item?.uid || item?.normalizedUid);
  const explicitSelectionKeys = Array.isArray(item?.selectionKeys)
    ? item.selectionKeys
    : Array.isArray(item?.requestedIdentityOrder)
      ? item.requestedIdentityOrder
      : [];

  return buildSelectionKeys(
    ...explicitSelectionKeys,
    routeId,
    routeId ? encodeURIComponent(routeId) : null,
    uid,
    uid ? `ihas.${uid}` : null,
    title,
    title ? encodeURIComponent(title) : null,
  );
}

function normalizeYearManifestItem(item, fallbackYear = null, index = 0) {
  if (!item || typeof item !== 'object') return null;

  const normalizedUid = normalizeText(item.normalizedUid || item.uid) || null;
  const routeId = normalizeText(item.routeId) || null;
  const title = normalizeText(item.title) || null;
  const contributor = normalizeText(item.contributor) || '';
  const date = normalizeText(item.date || fallbackYear) || null;
  const hasPlayableAudio = item.hasPlayableAudio !== false;

  return {
    uid: normalizedUid,
    normalizedUid,
    routeId,
    title,
    date,
    contributor,
    hasPlayableAudio,
    selectionKeys: buildManifestSelectionKeys({
      ...item,
      normalizedUid,
      uid: normalizedUid,
      routeId,
      title,
    }),
    order: Number.isFinite(item.order) ? item.order : index,
  };
}

function buildYearManifestPayload(year, items = [], requestedIdentity = null, meta = {}) {
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item, index) => normalizeYearManifestItem(item, year, index))
    .filter(Boolean)
    .sort((left, right) => left.order - right.order);
  const playableItems = normalizedItems.filter((item) => item.hasPlayableAudio);
  const selectionPool = playableItems.length > 0 ? playableItems : normalizedItems;
  const normalizedIdentity = normalizeRouteIdentity(requestedIdentity);
  const selectedIndex = normalizedIdentity
    ? selectionPool.findIndex((item) => item.selectionKeys.includes(normalizedIdentity))
    : 0;
  const selectedItem = selectionPool[selectedIndex >= 0 ? selectedIndex : 0] || null;
  const itemUids = selectionPool.map((item) => item.normalizedUid).filter(Boolean);
  const itemRouteIds = selectionPool.map((item) => item.routeId).filter(Boolean);
  const selectedItemIdentity = selectedItem?.routeId || selectedItem?.normalizedUid || null;

  return {
    year,
    items: normalizedItems,
    itemUids,
    itemRouteIds,
    selectedItem,
    selectedIndex: selectedItem ? selectionPool.indexOf(selectedItem) : -1,
    selectedItemIdentity,
    requestedIdentity: normalizedIdentity,
    source: meta.source || null,
    generatedAt: meta.generatedAt || null,
  };
}

function buildYearManifestFromSearchItems(items, year, requestedIdentity = null) {
  const playableItems = (Array.isArray(items) ? items : []).filter((item) => isPlayableSearchItem(item));
  const yearMatches = playableItems.filter((item) => extractYear(item.date) === year);
  const candidates = yearMatches.length > 0 ? yearMatches : playableItems;

  return buildYearManifestPayload(
    year,
    candidates.map((item, index) => ({
      uid: extractUid(item.id),
      normalizedUid: extractUid(item.id),
      routeId: getItemRouteId(item, item),
      title: normalizeText(item?.title || item?.item?.title),
      date: normalizeText(item?.date || year),
      contributor: normalizeText(item?.item?.contributor?.join(', ') || item?.contributor?.join(', ') || ''),
      hasPlayableAudio: true,
      selectionKeys: buildItemIdentityVariants(item),
      order: index,
    })),
    requestedIdentity,
    { source: 'loc-search-manifest' }
  );
}

function getBootstrappedYearManifest(year, requestedIdentity = null) {
  const cached = bootstrapAudioByYear?.[year];
  if (!cached) return null;

  return buildYearManifestPayload(year, [{
    uid: normalizeText(cached?.metadata?.uid) || extractUid(cached?.itemId || cached?.title),
    normalizedUid: normalizeText(cached?.metadata?.uid) || extractUid(cached?.itemId || cached?.title),
    routeId: normalizeText(cached?.itemId || cached?.title) || null,
    title: normalizeText(cached?.metadata?.title) || normalizeText(cached?.title) || null,
    date: normalizeText(cached?.metadata?.date) || String(year),
    contributor: normalizeText(cached?.metadata?.contributor) || '',
    hasPlayableAudio: !normalizeBootstrapAudioResult(normalizeAudioResult(cached))?.error,
    selectionKeys: [
      cached?.itemId,
      cached?.title,
      cached?.metadata?.title,
      cached?.metadata?.uid,
    ],
    order: 0,
  }], requestedIdentity, {
    source: cached?.source || archiveCache?.source || 'bootstrap-manifest',
    generatedAt: archiveCache?.generatedAt || null,
  });
}

function selectPlayableItemForYear(items, year, requestedIdentity = null) {
  const playableItems = (Array.isArray(items) ? items : []).filter((item) => isPlayableSearchItem(item));
  const yearMatches = playableItems.filter((item) => extractYear(item.date) === year);
  const candidates = yearMatches.length > 0 ? yearMatches : playableItems;
  const normalizedIdentity = normalizeRouteIdentity(requestedIdentity);

  if (!normalizedIdentity) {
    return {
      selectedItem: candidates[0] || null,
      playableItems,
      yearMatches,
      candidates,
    };
  }

  const exactMatch = candidates.find((item) => buildItemIdentityVariants(item).includes(normalizedIdentity));

  return {
    selectedItem: exactMatch || candidates[0] || null,
    playableItems,
    yearMatches,
    candidates,
  };
}

function isBootstrapSelectionMatch(cached, requestedIdentity) {
  if (!requestedIdentity) return true;

  const normalizedIdentity = normalizeRouteIdentity(requestedIdentity);
  if (!normalizedIdentity) return true;

  const candidates = [
    cached?.itemId,
    cached?.title,
    cached?.metadata?.title,
    cached?.metadata?.uid,
    ...(cached?.itemUids || []),
  ].map((value) => normalizeRouteIdentity(value)).filter(Boolean);

  return candidates.includes(normalizedIdentity);
}

function buildItemRecord(result, fallbackId = null) {
  if (!result?.metadata && !result?.audioUrl && !result?.error) return null;

  const routeId = normalizeText(result?.itemId) || null;
  const uid = normalizeText(result?.metadata?.uid) || extractUid(routeId) || normalizeText(fallbackId) || null;
  const id = extractLocItemId(routeId)
    || extractLocItemId(fallbackId)
    || (uid && !/^https?:/i.test(uid) ? uid : null);

  if (!id) return null;

  return {
    id,
    routeId: routeId || id,
    uid,
    audioUrl: result.audioUrl || null,
    metadata: normalizeMetadata(result.metadata),
    error: result.error || null,
    source: result.source || null,
  };
}

function getBootstrappedYearResult(year, requestedIdentity = null) {
  const cached = bootstrapAudioByYear?.[year];
  if (!cached || !isBootstrapSelectionMatch(cached, requestedIdentity)) {
    return null;
  }

  const manifest = getBootstrappedYearManifest(year, requestedIdentity);
  const result = normalizeBootstrapAudioResult(normalizeAudioResult({
    ...cached,
    itemId: manifest?.selectedItemIdentity || cached.itemId || cached.title || null,
    itemUids: manifest?.itemUids || cached.itemUids || [],
    itemRouteIds: manifest?.itemRouteIds || cached.itemRouteIds || [],
    metadata: cached.metadata ? { ...cached.metadata } : null,
    source: cached.source || archiveCache?.source || 'bootstrap-manifest',
    bootstrap: true
  }));
  audioCache.set(`${year}-${requestedIdentity || ''}`, result);
  return result;
}

async function fetchWithCache(cacheKey, fetcher) {
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey);
  }

  const request = fetcher().finally(() => {
    requestCache.delete(cacheKey);
  });

  requestCache.set(cacheKey, request);
  return request;
}

function buildCatalogPageUrl(pageNumber) {
  const params = new URLSearchParams({
    q: 'sound recording',
    fa: 'original-format:sound recording|digitized',
    fo: 'json',
    c: String(CATALOG_PAGE_SIZE),
    sp: String(pageNumber)
  });
  return `${BASE_URL}/search/?${params.toString()}`;
}

function resolveNextPage(pagination, currentPage, resultCount) {
  const nextCandidates = [
    pagination?.next,
    pagination?.next_page,
    pagination?.nextPage,
    pagination?.next_url
  ].filter(Boolean);

  for (const candidate of nextCandidates) {
    if (typeof candidate === 'number' && candidate > currentPage) {
      return candidate;
    }

    if (typeof candidate === 'string') {
      const match = candidate.match(/[?&]sp=(\d+)/);
      if (match) {
        const nextPage = Number.parseInt(match[1], 10);
        if (nextPage > currentPage) {
          return nextPage;
        }
      }
    }
  }

  const totalItems = Number.parseInt(
    pagination?.total
      || pagination?.total_items
      || pagination?.results
      || pagination?.count,
    10
  );
  const pageSize = Number.parseInt(
    pagination?.per_page
      || pagination?.items_per_page
      || pagination?.c,
    10
  ) || CATALOG_PAGE_SIZE;

  if (totalItems && currentPage * pageSize < totalItems) {
    return currentPage + 1;
  }

  return resultCount === CATALOG_PAGE_SIZE ? currentPage + 1 : null;
}

async function loadCatalogFromSearch() {
  const yearlyCatalog = new Map();
  let currentPage = 1;
  let pageCount = 0;

  while (currentPage && pageCount < MAX_CATALOG_PAGES) {
    const data = await fetchJson(buildCatalogPageUrl(currentPage));
    const items = Array.isArray(data?.results) ? data.results : [];

    items.forEach((item) => {
      const year = extractYear(item.date);
      if (!year || !isPlayableSearchItem(item)) {
        return;
      }

      const existingEntry = yearlyCatalog.get(year) || {
        year,
        itemCount: 0,
        sampleItemIds: [],
        status: 'ready'
      };

      existingEntry.itemCount += 1;

      const uid = extractUid(item.id);
      if (uid && !existingEntry.sampleItemIds.includes(uid)) {
        existingEntry.sampleItemIds.push(uid);
        existingEntry.sampleItemIds = existingEntry.sampleItemIds.slice(0, MAX_CATALOG_SAMPLE_IDS);
      }

      yearlyCatalog.set(year, existingEntry);
    });

    pageCount += 1;
    const nextPage = resolveNextPage(data?.pagination, currentPage, items.length);

    if (!nextPage || nextPage === currentPage || items.length === 0) {
      break;
    }

    currentPage = nextPage;
  }

  return buildCatalogPayload(Array.from(yearlyCatalog.values()), {
    source: 'loc-search-pagination',
    generatedAt: new Date().toISOString(),
    error: null
  });
}

async function fetchJson(url) {
  if (shouldSkipLocApiRequests() && String(url).startsWith(BASE_URL)) {
    throw createLocApiUnavailableError();
  }

  try {
    const response = await fetch(url);
    return response.json();
  } catch (error) {
    const isLocRequest = String(url).startsWith(BASE_URL);
    const isNetworkStyleFailure = error instanceof TypeError || /failed to fetch|network/i.test(normalizeText(error?.message));

    if (isLocRequest && isNetworkStyleFailure) {
      markLocApiUnavailable('cors-or-network');
      throw createLocApiUnavailableError();
    }

    throw error;
  }
}

async function loadYearManifestFromSearch(year, requestedIdentity = null, cacheKey = `${year}-${requestedIdentity || ''}`) {
  return fetchWithCache(`year-manifest:${cacheKey}`, async () => {
    const searchUrl = `${BASE_URL}/search/?q=${encodeURIComponent(year)}&fa=original-format:sound+recording|digitized&fo=json`;
    const searchData = await fetchJson(searchUrl);
    const items = searchData.results || [];
    const manifest = buildYearManifestFromSearchItems(items, year, requestedIdentity);
    yearManifestCache.set(cacheKey, manifest);
    return manifest;
  });
}

export async function fetchYearManifest(year, requestedIdentity = null) {
  const cacheKey = `${year}-${requestedIdentity || ''}`;
  if (yearManifestCache.has(cacheKey)) {
    return yearManifestCache.get(cacheKey);
  }

  const bootstrappedManifest = getBootstrappedYearManifest(year, requestedIdentity);
  if (bootstrappedManifest) {
    yearManifestCache.set(cacheKey, bootstrappedManifest);
    return bootstrappedManifest;
  }

  return loadYearManifestFromSearch(year, requestedIdentity, cacheKey);
}

async function loadAudioByYearFromSearch(year, requestedIdentity = null, cacheKey = `${year}-${requestedIdentity || ''}`, options = {}) {
  const normalizedIdentity = normalizeRouteIdentity(requestedIdentity);
  const { deferAudio = false } = options;

  return fetchWithCache(cacheKey, async () => {
    try {
      const manifest = await loadYearManifestFromSearch(year, requestedIdentity, cacheKey);
      const selectedItem = manifest?.selectedItem;
      const itemUids = manifest?.itemUids || [];
      const itemRouteIds = manifest?.itemRouteIds || [];

      if (!selectedItem) {
        const result = {
          audioUrl: null,
          metadata: null,
          error: 'No playable audio found for this year.',
          itemUids: [],
          itemRouteIds: []
        };
        audioCache.set(cacheKey, result);
        await saveYearSelection(year, normalizedIdentity, result, null, { ttl: AUDIO_CACHE_TTL, freshness: buildFreshness(AUDIO_CACHE_TTL), datasetVersion: CURRENT_DATASET_VERSION });
        return result;
      }

      if (deferAudio) {
        const deferredResult = normalizeAudioResult({
          audioUrl: null,
          metadata: buildMetadata(selectedItem, selectedItem, year),
          error: null,
          itemUids,
          itemRouteIds,
          itemId: manifest.selectedItemIdentity,
          source: 'loc-search-selection',
          pendingAudio: true
        });
        const deferredItemRecord = buildItemRecord(deferredResult, selectedItem.routeId || selectedItem.uid);

        audioCache.set(cacheKey, deferredResult);
        await saveYearSelection(year, normalizedIdentity, deferredResult, deferredItemRecord, { ttl: AUDIO_CACHE_TTL, freshness: buildFreshness(AUDIO_CACHE_TTL), datasetVersion: CURRENT_DATASET_VERSION });
        return deferredResult;
      }

      const selectedItemIdentity = manifest.selectedItemIdentity || selectedItem.routeId || selectedItem.uid;
      const itemLookupId = extractLocItemId(selectedItemIdentity) || (selectedItem?.normalizedUid ? `ihas.${selectedItem.normalizedUid}` : null);
      const itemUrl = `${BASE_URL}/item/${itemLookupId}/?fo=json`;
      const itemData = await fetchJson(itemUrl);
      const audioUrl = getAudioUrlFromResources(itemData);

      if (!audioUrl) {
        const result = {
          audioUrl: null,
          metadata: null,
          error: 'No audio URL available for this item.',
          itemUids,
          itemRouteIds
        };
        audioCache.set(cacheKey, result);
        await saveYearSelection(year, normalizedIdentity, result, null, { ttl: AUDIO_CACHE_TTL, freshness: buildFreshness(AUDIO_CACHE_TTL), datasetVersion: CURRENT_DATASET_VERSION });
        return result;
      }

      const metadata = buildMetadata(itemData, selectedItem, year);
      const result = normalizeAudioResult({
        audioUrl,
        metadata,
        error: null,
        itemUids,
        itemRouteIds,
        itemId: normalizeText(getItemRouteId(selectedItem, itemData) || selectedItemIdentity) || null,
        source: 'loc-item-search'
      });
      const itemRecord = buildItemRecord(result, itemData.id || selectedItemIdentity);

      audioCache.set(cacheKey, result);
      await saveYearSelection(year, normalizedIdentity, result, itemRecord, { ttl: AUDIO_CACHE_TTL, freshness: buildFreshness(AUDIO_CACHE_TTL), datasetVersion: CURRENT_DATASET_VERSION });
      return result;
    } catch (error) {
      if (!isLocApiUnavailableError(error)) {
        console.error('Error fetching audio:', error);
      }
      const staleResult = await getStaleYearSelection(year, normalizedIdentity, { datasetVersion: CURRENT_DATASET_VERSION });
      if (staleResult) {
        const normalizedStaleResult = normalizeAudioResult({
          ...staleResult,
          stale: true,
          source: 'stale-year-cache'
        });
        audioCache.set(cacheKey, normalizedStaleResult);
        return normalizedStaleResult;
      }

      const result = {
        audioUrl: null,
        metadata: null,
        error: isLocApiUnavailableError(error)
          ? 'Live Library of Congress data is blocked by this browser origin, so only preloaded recordings are available here.'
          : 'Error fetching audio. Try another year.',
        itemUids: [],
        itemRouteIds: []
      };
      audioCache.set(cacheKey, result);
      await saveYearSelection(year, normalizedIdentity, result, null, { ttl: AUDIO_CACHE_TTL, freshness: buildFreshness(AUDIO_CACHE_TTL), datasetVersion: CURRENT_DATASET_VERSION });
      return result;
    }
  });
}

function refreshBootstrappedYearInBackground(year, requestedIdentity = null, cacheKey = `${year}-${requestedIdentity || ''}`) {
  if (shouldSkipLocApiRequests() || !shouldAutoRefreshBootstrappedData()) {
    return Promise.resolve(null);
  }

  if (bootstrapYearRefreshPromises.has(cacheKey)) {
    return bootstrapYearRefreshPromises.get(cacheKey);
  }

  const refreshPromise = loadAudioByYearFromSearch(year, requestedIdentity, cacheKey)
    .catch((error) => {
      if (!isLocApiUnavailableError(error)) {
        console.error('Error refreshing bootstrapped audio:', error);
      }
      return null;
    })
    .finally(() => {
      bootstrapYearRefreshPromises.delete(cacheKey);
    });

  bootstrapYearRefreshPromises.set(cacheKey, refreshPromise);
  return refreshPromise;
}

function refreshBootstrappedCatalogInBackground() {
  if (shouldSkipLocApiRequests() || !shouldAutoRefreshBootstrappedData()) {
    return Promise.resolve(null);
  }

  if (bootstrapCatalogRefreshPromise) {
    return bootstrapCatalogRefreshPromise;
  }

  bootstrapCatalogRefreshPromise = loadCatalogFromSearch()
    .then(async (catalogPayload) => {
      availableYearsCache = catalogPayload;
      await saveCatalogSnapshot({
        entries: catalogPayload.entries,
        source: catalogPayload.source,
        generatedAt: catalogPayload.generatedAt,
        error: null,
        freshness: buildFreshness(CATALOG_CACHE_TTL),
        datasetVersion: CURRENT_DATASET_VERSION,
      });
      return catalogPayload;
    })
    .catch((error) => {
      if (!isLocApiUnavailableError(error)) {
        console.error('Error refreshing bootstrapped catalog:', error);
      }
      return null;
    })
    .finally(() => {
      bootstrapCatalogRefreshPromise = null;
    });

  return bootstrapCatalogRefreshPromise;
}

export async function fetchAudioByYear(year, requestedIdentity = null, options = {}) {
  const cacheKey = `${year}-${requestedIdentity || ''}`;
  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey);
  }

  const normalizedIdentity = normalizeRouteIdentity(requestedIdentity);
  const storedResult = await getYearSelection(year, normalizedIdentity, { ttl: AUDIO_CACHE_TTL, datasetVersion: CURRENT_DATASET_VERSION });
  if (storedResult) {
    const normalizedStoredResult = normalizeAudioResult(storedResult);
    audioCache.set(cacheKey, normalizedStoredResult);
    return normalizedStoredResult;
  }

  const bootstrappedResult = getBootstrappedYearResult(year, requestedIdentity);
  if (bootstrappedResult) {
    refreshBootstrappedYearInBackground(year, requestedIdentity, cacheKey);
    return bootstrappedResult;
  }

  return loadAudioByYearFromSearch(year, requestedIdentity, cacheKey, options);
}

export async function fetchAudioById(audioId) {
  const cacheKey = `${audioId}`;
  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey);
  }

  const normalizedLookupId = extractLocItemId(audioId) || normalizeText(audioId);
  const storedResult = await getItemByLookup(normalizedLookupId, { ttl: AUDIO_CACHE_TTL, datasetVersion: CURRENT_DATASET_VERSION });
  if (storedResult) {
    const normalizedStoredResult = normalizeAudioResult(storedResult);
    audioCache.set(cacheKey, normalizedStoredResult);
    return normalizedStoredResult;
  }

  let requestUrl = audioId;
  if (!audioId.startsWith('http')) {
    const normalizedItemId = extractLocItemId(audioId) || normalizeText(audioId);
    const normalizedUid = extractUid(normalizedItemId) || (/^\d+$/.test(normalizedItemId) ? normalizedItemId : null);
    requestUrl = normalizedUid
      ? `${BASE_URL}/item/ihas.${normalizedUid}/?fo=json`
      : `${BASE_URL}/item/${normalizedItemId}/?fo=json`;
  } else {
    requestUrl = `${audioId}?fo=json`;
  }

  return fetchWithCache(cacheKey, async () => {
    try {
      const selectedItem = await fetchJson(requestUrl);
      if (!selectedItem) {
        return { audioUrl: null, metadata: null, error: 'No audio found for that id.' };
      }

      const audioUrl = getAudioUrlFromResources(selectedItem);

      if (!audioUrl) {
        return { audioUrl: null, metadata: null, error: 'No audio found for that id.' };
      }

      const metadata = normalizeMetadata(buildMetadata(selectedItem, selectedItem));
      const result = {
        audioUrl,
        metadata,
        error: null,
        itemId: getItemRouteId(selectedItem, selectedItem)
      };
      const itemRecord = buildItemRecord(result, selectedItem.id || audioId);
      audioCache.set(cacheKey, result);
      await saveItemRecord(itemRecord, { ttl: AUDIO_CACHE_TTL, freshness: buildFreshness(AUDIO_CACHE_TTL), datasetVersion: CURRENT_DATASET_VERSION });
      return result;
    } catch (error) {
      console.error('Error fetching audio by id:', error);
      const staleResult = await getStaleItemByLookup(normalizedLookupId, { datasetVersion: CURRENT_DATASET_VERSION });
      if (staleResult) {
        const normalizedStaleResult = normalizeAudioResult({
          ...staleResult,
          stale: true,
          source: 'stale-item-cache'
        });
        audioCache.set(cacheKey, normalizedStaleResult);
        return normalizedStaleResult;
      }

      const result = { audioUrl: null, metadata: null, error: 'Error fetching audio by id.' };
      audioCache.set(cacheKey, result);
      return result;
    }
  });
}

export async function fetchAvailableYears() {
  if (availableYearsCache) {
    return availableYearsCache;
  }

  const storedCatalog = await getCatalogSnapshot({ ttl: CATALOG_CACHE_TTL, datasetVersion: CURRENT_DATASET_VERSION });
  if (storedCatalog) {
    availableYearsCache = buildCatalogPayload(storedCatalog.entries, {
      error: null,
      source: storedCatalog.source || 'indexeddb',
      generatedAt: storedCatalog.generatedAt || null
    });
    return availableYearsCache;
  }

  if (bootstrapCatalogPayload) {
    availableYearsCache = {
      ...bootstrapCatalogPayload,
      source: bootstrapCatalogPayload.source || 'bootstrap-manifest',
      bootstrap: true
    };
    refreshBootstrappedCatalogInBackground();
    return availableYearsCache;
  }

  try {
    availableYearsCache = await loadCatalogFromSearch();
    await saveCatalogSnapshot({
      entries: availableYearsCache.entries,
      source: availableYearsCache.source,
      generatedAt: availableYearsCache.generatedAt,
      error: null,
      freshness: buildFreshness(CATALOG_CACHE_TTL),
      datasetVersion: CURRENT_DATASET_VERSION,
    });
    return availableYearsCache;
  } catch (error) {
    if (!isLocApiUnavailableError(error)) {
      console.error('Error fetching available years:', error);
    }
    const staleCatalog = await getStaleCatalogSnapshot({ datasetVersion: CURRENT_DATASET_VERSION });

    if (staleCatalog) {
      return buildCatalogPayload(staleCatalog.entries, {
        error: 'Error fetching available years.',
        source: staleCatalog.source || 'stale-indexeddb',
        generatedAt: staleCatalog.generatedAt || null
      });
    }

    return bootstrapCatalogPayload
      ? {
          ...bootstrapCatalogPayload,
          error: isLocApiUnavailableError(error)
            ? 'Live Library of Congress catalog refresh is blocked by this browser origin. Showing the bundled catalog instead.'
            : 'Error fetching available years.',
          source: bootstrapCatalogPayload.source || 'bootstrap-manifest',
          bootstrap: true
        }
      : buildCatalogPayload([], {
          error: 'Error fetching available years.',
          source: 'empty-catalog',
          generatedAt: null
        });
  }
}

export function mergeCatalogYearEntry(entries, year, entryPatch = {}) {
  return normalizeCatalogEntries([
    ...(Array.isArray(entries) ? entries : []),
    { year, ...entryPatch }
  ]);
}

export const __testing = {
  datasetUrls,
  buildDatasetUrl,
  extractUid,
  extractYear,
  normalizeRouteIdentity,
  selectPlayableItemForYear,
  getItemRouteId,
  buildManifestSelectionKeys,
  buildYearManifestPayload,
  buildYearManifestFromSearchItems,
  normalizeMetadata,
  buildItemRecord,
  asArray,
  isPlayableResource,
  isPlayableSearchItem,
  getAudioUrlFromResources,
  resetCaches() {
    audioCache.clear();
    yearManifestCache.clear();
    requestCache.clear();
    availableYearsCache = null;
    bootstrapCatalogRefreshPromise = null;
    bootstrapYearRefreshPromises.clear();
    locApiState.unavailable = false;
    locApiState.reason = null;
  },
  isLocApiUnavailableError,
  shouldAutoRefreshBootstrappedData,
  getLocApiState() {
    return { ...locApiState };
  },
};
