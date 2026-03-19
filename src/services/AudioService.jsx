import archiveCache from '../data/archive-cache.json';
import { createLinkItems, joinMetadataParts } from '../config/metadataFields';
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
const requestCache = new Map();
const bootstrapAudioByYear = archiveCache?.audioByYear || {};
const bootstrapCatalogEntries = archiveCache?.catalog?.entries
  || archiveCache?.catalogEntries
  || (archiveCache?.availableYears || []).map((year) => ({
    year,
    itemCount: null,
    sampleItemIds: [],
    status: 'manifest'
  }));

let availableYearsCache = bootstrapCatalogEntries.length
  ? buildCatalogPayload(bootstrapCatalogEntries, {
    error: null,
    source: archiveCache?.catalog?.source || archiveCache?.source || 'bootstrap-manifest',
    generatedAt: archiveCache?.catalog?.generatedAt || archiveCache?.generatedAt || null
  })
  : null;

function extractUid(itemId) {
  if (!itemId) return null;
  const match = String(itemId).match(/ihas\.(\d+)/);
  return match ? match[1] : null;
}

function extractYear(dateValue) {
  if (!dateValue) return null;
  const match = String(dateValue).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function normalizeText(value) {
  if (Array.isArray(value)) {
    return normalizeText(value.find((item) => normalizeText(item)));
  }

  if (value == null) return '';
  const text = String(value).trim();
  return text;
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeImage(value, fallbackAlt = 'Recording cover') {
  const src = Array.isArray(value)
    ? value.find((item) => typeof item === 'string' && item.trim())
    : typeof value === 'string'
      ? value.trim()
      : value?.src;

  if (!src) return null;

  return {
    src,
    alt: fallbackAlt || 'Recording cover'
  };
}

function normalizeLinkItems(items = []) {
  if (!Array.isArray(items)) return [];

  return createLinkItems(items.map((item) => {
    if (typeof item === 'string') {
      return { label: item, url: item };
    }

    if (item?.url) {
      return {
        label: item.label || item.url,
        url: item.url
      };
    }

    if (item?.link) {
      return {
        label: item.title || item.label || item.link,
        url: item.link
      };
    }

    return null;
  }).filter(Boolean));
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

function processLinks(items) {
  if (!items || !Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && item.link) return item.link;
      return null;
    })
    .filter(Boolean);
}

function buildMetadata(itemData, selectedItem, fallbackYear) {
  const title = normalizeText(itemData.title || itemData.item?.title) || 'Untitled Recording';
  const date = normalizeText(itemData.date || itemData.item?.date || fallbackYear?.toString());
  const url = normalizeText(itemData.url || selectedItem?.url);
  const genre = normalizeText(itemData.item?.genre || itemData.type);
  const notes = normalizeList(itemData.item?.notes);
  const relatedResources = normalizeLinkItems(itemData.item?.related_resources);
  const formats = normalizeLinkItems(itemData.item?.other_formats);
  const aka = normalizeLinkItems(itemData.item?.aka || itemData.aka);
  const metadata = {
    title,
    date,
    url,
    uid: extractUid(selectedItem?.id || itemData.id),
    contributor: normalizeText(itemData.item?.contributor || itemData.contributor),
    summary: normalizeText(
      itemData.item?.summary
      || itemData.item?.description
      || itemData.description?.[0]
    ),
    genre,
    recordingInfo: joinMetadataParts(date, genre),
    image: normalizeImage(itemData.image_url || itemData.item?.image_url, title),
    notes,
    repository: normalizeText(itemData.item?.repository),
    aka,
    relatedResources,
    formats,
    location: normalizeText(itemData.item?.location),
    mimeType: normalizeText(itemData.item?.mime_type),
    source: url ? [{ label: url, url }] : [],
  };

  metadata.technicalDetails = [
    metadata.uid ? { label: 'UID', value: metadata.uid } : null,
    metadata.mimeType ? { label: 'Mime Type', value: metadata.mimeType } : null,
  ].filter(Boolean);

  return metadata;
}

function normalizeMetadata(metadata) {
  if (!metadata) return null;

  const title = normalizeText(metadata.title) || 'Untitled Recording';
  const date = normalizeText(metadata.date);
  const genre = normalizeText(metadata.genre);
  const url = normalizeText(metadata.url);
  const normalized = {
    title,
    date,
    url,
    uid: normalizeText(metadata.uid),
    contributor: normalizeText(metadata.contributor),
    summary: normalizeText(metadata.summary),
    genre,
    recordingInfo: normalizeText(metadata.recordingInfo) || joinMetadataParts(date, genre),
    image: metadata.image?.src
      ? metadata.image
      : normalizeImage(metadata.image, title),
    notes: normalizeList(metadata.notes),
    repository: normalizeText(metadata.repository),
    aka: normalizeLinkItems(metadata.aka),
    relatedResources: normalizeLinkItems(metadata.relatedResources || metadata.related_resources),
    formats: normalizeLinkItems(metadata.formats),
    location: normalizeText(metadata.location),
    mimeType: normalizeText(metadata.mimeType || metadata.mime_type),
    source: normalizeLinkItems(metadata.source || (url ? [{ label: url, url }] : [])),
  };

  normalized.technicalDetails = Array.isArray(metadata.technicalDetails)
    ? metadata.technicalDetails
        .map((item) => ({
          label: normalizeText(item?.label),
          value: normalizeText(item?.value),
        }))
        .filter((item) => item.label && item.value)
    : [
        normalized.uid ? { label: 'UID', value: normalized.uid } : null,
        normalized.mimeType ? { label: 'Mime Type', value: normalized.mimeType } : null,
      ].filter(Boolean);

  return normalized;
}

function normalizeAudioResult(result) {
  if (!result) return result;

  return {
    ...result,
    metadata: normalizeMetadata(result.metadata),
  };
}

function extractLocItemId(itemId) {
  const normalized = normalizeText(itemId);
  if (!normalized) return null;

  return normalized
    .replace(/^https?:\/\/(www\.)?loc\.gov\/item\//, '')
    .replace(/^item\//, '')
    .replace(/\/?(\?fo=json)?$/, '')
    .replace(/^\//, '');
}

function normalizeRouteIdentity(value) {
  const raw = normalizeText(value);
  if (!raw) return null;

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (error) {
    decoded = raw;
  }

  const normalized = extractLocItemId(decoded) || decoded;
  return normalized
    .toLowerCase()
    .replace(/^ihas\./, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildItemIdentityVariants(item) {
  const itemId = extractLocItemId(item?.id);
  const title = normalizeText(item?.title || item?.item?.title);
  const uid = extractUid(item?.id);

  return [
    item?.id,
    itemId,
    uid,
    uid ? `ihas.${uid}` : null,
    title,
    title ? encodeURIComponent(title) : null,
    itemId ? encodeURIComponent(itemId) : null,
  ]
    .map((candidate) => normalizeRouteIdentity(candidate))
    .filter(Boolean);
}

function getItemRouteId(item, itemData = null) {
  const itemId = extractLocItemId(item?.id || itemData?.id);
  if (itemId) return itemId;

  const title = normalizeText(itemData?.title || itemData?.item?.title || item?.title);
  return title ? encodeURIComponent(title) : null;
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

function isPlayableResource(resource) {
  return Boolean(
    resource?.audio
    || resource?.url?.match(/\.(mp3|wav)$/i)
    || resource?.files?.some((file) => (
      file.mimetype?.includes('audio') || file.url?.match(/\.(mp3|wav)$/i)
    ))
  );
}

function isPlayableSearchItem(item) {
  return item?.resources?.some((resource) => isPlayableResource(resource));
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
  };
}

function getBootstrappedYearResult(year, requestedIdentity = null) {
  const cached = bootstrapAudioByYear?.[year];
  if (!cached || !isBootstrapSelectionMatch(cached, requestedIdentity)) {
    return null;
  }

  const result = normalizeAudioResult({
    ...cached,
    itemId: cached.itemId || cached.title || null,
    metadata: cached.metadata ? { ...cached.metadata } : null,
  });
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
    const response = await fetch(buildCatalogPageUrl(currentPage));
    const data = await response.json();
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

function getAudioUrlFromResources(itemData) {
  for (const resource of itemData.resources || []) {
    if (resource.audio) {
      return resource.audio;
    }
    if (resource.files) {
      const audioFile = resource.files.find((file) => (
        file.mimetype?.includes('audio') || file.url?.match(/\.(mp3|wav)$/i)
      ));
      if (audioFile) {
        return audioFile.url;
      }
    }
  }
  return null;
}

async function fetchJson(url) {
  const response = await fetch(url);
  return response.json();
}

export async function fetchAudioByYear(year, requestedIdentity = null) {
  const cacheKey = `${year}-${requestedIdentity || ''}`;
  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey);
  }

  const normalizedIdentity = normalizeRouteIdentity(requestedIdentity);
  const storedResult = await getYearSelection(year, normalizedIdentity, { ttl: AUDIO_CACHE_TTL });
  if (storedResult) {
    const normalizedStoredResult = normalizeAudioResult(storedResult);
    audioCache.set(cacheKey, normalizedStoredResult);
    return normalizedStoredResult;
  }

  const bootstrappedResult = getBootstrappedYearResult(year, requestedIdentity);
  if (bootstrappedResult) {
    return bootstrappedResult;
  }

  return fetchWithCache(cacheKey, async () => {
    try {
      const searchUrl = `${BASE_URL}/search/?q=${encodeURIComponent(year)}&fa=original-format:sound+recording|digitized&fo=json`;
      const searchData = await fetchJson(searchUrl);
      const items = searchData.results || [];
      const { selectedItem, yearMatches, candidates } = selectPlayableItemForYear(items, year, requestedIdentity);
      const itemUids = (yearMatches.length > 0 ? yearMatches : candidates)
        .map((item) => extractUid(item.id))
        .filter(Boolean);

      if (!selectedItem) {
        const result = {
          audioUrl: null,
          metadata: null,
          error: 'No playable audio found for this year.',
          itemUids: []
        };
        audioCache.set(cacheKey, result);
        await saveYearSelection(year, normalizedIdentity, result, null, { ttl: AUDIO_CACHE_TTL, freshness: buildFreshness(AUDIO_CACHE_TTL) });
        return result;
      }

      const itemId = extractLocItemId(selectedItem.id);
      const itemUrl = `${BASE_URL}/item/${itemId}/?fo=json`;
      const itemData = await fetchJson(itemUrl);
      const audioUrl = getAudioUrlFromResources(itemData);

      if (!audioUrl) {
        const result = {
          audioUrl: null,
          metadata: null,
          error: 'No audio URL available for this item.',
          itemUids
        };
        audioCache.set(cacheKey, result);
        await saveYearSelection(year, normalizedIdentity, result, null, { ttl: AUDIO_CACHE_TTL, freshness: buildFreshness(AUDIO_CACHE_TTL) });
        return result;
      }

      const metadata = buildMetadata(itemData, selectedItem, year);
      const result = normalizeAudioResult({
        audioUrl,
        metadata,
        error: null,
        itemUids,
        itemId: getItemRouteId(selectedItem, itemData)
      });
      const itemRecord = buildItemRecord(result, itemData.id || selectedItem.id);

      audioCache.set(cacheKey, result);
      await saveYearSelection(year, normalizedIdentity, result, itemRecord, { ttl: AUDIO_CACHE_TTL, freshness: buildFreshness(AUDIO_CACHE_TTL) });
      return result;
    } catch (error) {
      console.error('Error fetching audio:', error);
      const staleResult = await getStaleYearSelection(year, normalizedIdentity);
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
        error: 'Error fetching audio. Try another year.',
        itemUids: []
      };
      audioCache.set(cacheKey, result);
      await saveYearSelection(year, normalizedIdentity, result, null, { ttl: AUDIO_CACHE_TTL, freshness: buildFreshness(AUDIO_CACHE_TTL) });
      return result;
    }
  });
}

export async function fetchAudioById(audioId) {
  const cacheKey = `${audioId}`;
  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey);
  }

  const normalizedLookupId = extractLocItemId(audioId) || normalizeText(audioId);
  const storedResult = await getItemByLookup(normalizedLookupId, { ttl: AUDIO_CACHE_TTL });
  if (storedResult) {
    const normalizedStoredResult = normalizeAudioResult(storedResult);
    audioCache.set(cacheKey, normalizedStoredResult);
    return normalizedStoredResult;
  }

  let requestUrl = audioId;
  if (!audioId.startsWith('http')) {
    requestUrl = `${BASE_URL}/item/ihas.${audioId}/?fo=json`;
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
      await saveItemRecord(itemRecord, { ttl: AUDIO_CACHE_TTL, freshness: buildFreshness(AUDIO_CACHE_TTL) });
      return result;
    } catch (error) {
      console.error('Error fetching audio by id:', error);
      const staleResult = await getStaleItemByLookup(normalizedLookupId);
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

  const storedCatalog = await getCatalogSnapshot({ ttl: CATALOG_CACHE_TTL });
  if (storedCatalog) {
    availableYearsCache = buildCatalogPayload(storedCatalog.entries, {
      error: null,
      source: storedCatalog.source || 'indexeddb',
      generatedAt: storedCatalog.generatedAt || null
    });
    return availableYearsCache;
  }

  if (bootstrapCatalogEntries.length) {
    availableYearsCache = buildCatalogPayload(bootstrapCatalogEntries, {
      error: null,
      source: archiveCache?.catalog?.source || archiveCache?.source || 'bootstrap-manifest',
      generatedAt: archiveCache?.catalog?.generatedAt || archiveCache?.generatedAt || null
    });
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
    });
    return availableYearsCache;
  } catch (error) {
    console.error('Error fetching available years:', error);
    const staleCatalog = await getStaleCatalogSnapshot();

    if (staleCatalog) {
      return buildCatalogPayload(staleCatalog.entries, {
        error: 'Error fetching available years.',
        source: staleCatalog.source || 'stale-indexeddb',
        generatedAt: staleCatalog.generatedAt || null
      });
    }

    return buildCatalogPayload(bootstrapCatalogEntries, {
      error: 'Error fetching available years.',
      source: archiveCache?.catalog?.source || archiveCache?.source || 'bootstrap-manifest',
      generatedAt: archiveCache?.catalog?.generatedAt || archiveCache?.generatedAt || null
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
  extractUid,
  extractYear,
  normalizeRouteIdentity,
  selectPlayableItemForYear,
  getItemRouteId,
  normalizeMetadata,
  processLinks,
  buildItemRecord,
  resetCaches() {
    audioCache.clear();
    requestCache.clear();
    availableYearsCache = null;
  },
};
