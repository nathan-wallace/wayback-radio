import archiveCache from '../data/archive-cache.json';
import { createLinkItems, joinMetadataParts } from '../config/metadataFields';

const BASE_URL = 'https://www.loc.gov';
const AUDIO_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const CATALOG_CACHE_TTL = 24 * 60 * 60 * 1000;
const LOCAL_CATALOG_KEY = 'availableCatalog';
const CATALOG_CACHE_TIMESTAMP_KEY = 'availableCatalogTimestamp';
const AUDIO_CACHE_PREFIX = 'audioCache-';
const AUDIO_ID_CACHE_PREFIX = 'audioIdCache-';
const AUDIO_CACHE_TIMESTAMP_PREFIX = 'audioCacheTimestamp-';
const AUDIO_ID_CACHE_TIMESTAMP_PREFIX = 'audioIdCacheTimestamp-';
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
  const match = itemId.match(/ihas\.(\d+)/);
  return match ? match[1] : null;
}

function extractYear(dateValue) {
  if (!dateValue) return null;
  const match = String(dateValue).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number.parseInt(match[0], 10) : null;
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

    deduped.set(year, {
      ...existing,
      itemCount: (existing.itemCount || 0) + (normalizedEntry.itemCount || 0),
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

function buildMetadata(itemData, selectedItem, fallbackYear) {
  return {
    src,
    alt: title ? `${title} cover` : 'Recording cover',
  };
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

function readLocalCache(storageKey, timestampKey, ttl) {
  if (typeof localStorage === 'undefined') return null;

  const stored = localStorage.getItem(storageKey);
  if (!stored) return null;

  const timestamp = Number.parseInt(localStorage.getItem(timestampKey), 10);
  if (!timestamp || Date.now() - timestamp >= ttl) {
    return null;
  }

  try {
    return JSON.parse(stored);
  } catch (error) {
    console.warn(`Failed to parse cache for ${storageKey}`, error);
    return null;
  }
}

function writeLocalCache(storageKey, timestampKey, value) {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
    localStorage.setItem(timestampKey, Date.now().toString());
  } catch (error) {
    console.warn(`Failed to persist cache for ${storageKey}`, error);
  }
}

function getBootstrappedYearResult(year) {
  const cached = bootstrapAudioByYear?.[year];
  if (!cached) return null;

  const result = { ...cached, metadata: cached.metadata ? { ...cached.metadata } : null };
  audioCache.set(`${year}`, result);
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

export async function fetchAudioByYear(year, encodedTitle = null) {
  const cacheKey = `${year}-${encodedTitle || ''}`;
  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey);
  }

  const localResult = readLocalCache(
    `${AUDIO_CACHE_PREFIX}${cacheKey}`,
    `${AUDIO_CACHE_TIMESTAMP_PREFIX}${cacheKey}`,
    AUDIO_CACHE_TTL
  );
  if (localResult) {
    const normalizedLocalResult = normalizeAudioResult(localResult);
    audioCache.set(cacheKey, normalizedLocalResult);
    return normalizedLocalResult;
  }

  const bootstrappedResult = getBootstrappedYearResult(year);
  if (bootstrappedResult) {
    return bootstrappedResult;
  }

  return fetchWithCache(cacheKey, async () => {
    try {
      const searchUrl = `${BASE_URL}/search/?q=${encodeURIComponent(year)}&fa=original-format:sound+recording|digitized&fo=json`;
      const searchResponse = await fetch(searchUrl);
      const searchData = await searchResponse.json();
      const items = searchData.results || [];
      const playableItems = items.filter((item) => isPlayableSearchItem(item));
      const itemUids = playableItems.map((item) => extractUid(item.id)).filter(Boolean);

      if (playableItems.length === 0) {
        const result = {
          audioUrl: null,
          metadata: null,
          error: 'No playable audio found for this year.',
          itemUids: []
        };
        audioCache.set(cacheKey, result);
        writeLocalCache(
          `${AUDIO_CACHE_PREFIX}${cacheKey}`,
          `${AUDIO_CACHE_TIMESTAMP_PREFIX}${cacheKey}`,
          result
        );
        return result;
      }

      const selectedItem = playableItems[0];

      const itemId = selectedItem.id
        .replace(/^https?:\/\/(www\.)?loc\.gov\/item\//, '')
        .replace(/\/$/, '');
      const itemUrl = `${BASE_URL}/item/${itemId}/?fo=json`;
      const itemResponse = await fetch(itemUrl);
      const itemData = await itemResponse.json();
      const audioUrl = getAudioUrlFromResources(itemData);

      if (!audioUrl) {
        const result = {
          audioUrl: null,
          metadata: null,
          error: 'No audio URL available for this item.',
          itemUids
        };
        audioCache.set(cacheKey, result);
        writeLocalCache(
          `${AUDIO_CACHE_PREFIX}${cacheKey}`,
          `${AUDIO_CACHE_TIMESTAMP_PREFIX}${cacheKey}`,
          result
        );
        return result;
      }

      const metadata = buildMetadata(itemData, selectedItem, year);
      const result = {
        audioUrl,
        metadata,
        error: null,
        itemUids
      };

      audioCache.set(cacheKey, result);
      writeLocalCache(
        `${AUDIO_CACHE_PREFIX}${cacheKey}`,
        `${AUDIO_CACHE_TIMESTAMP_PREFIX}${cacheKey}`,
        result
      );
      return result;
    } catch (error) {
      console.error('Error fetching audio:', error);
      const result = {
        audioUrl: null,
        metadata: null,
        error: 'Error fetching audio. Try another year.',
        itemUids: []
      };
      audioCache.set(cacheKey, result);
      writeLocalCache(
        `${AUDIO_CACHE_PREFIX}${cacheKey}`,
        `${AUDIO_CACHE_TIMESTAMP_PREFIX}${cacheKey}`,
        result
      );
      return result;
    }
  });
}

export async function fetchAudioById(audioId) {
  const cacheKey = `${audioId}`;
  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey);
  }

  const localResult = readLocalCache(
    `${AUDIO_ID_CACHE_PREFIX}${cacheKey}`,
    `${AUDIO_ID_CACHE_TIMESTAMP_PREFIX}${cacheKey}`,
    AUDIO_CACHE_TTL
  );
  if (localResult) {
    const normalizedLocalResult = normalizeAudioResult(localResult);
    audioCache.set(cacheKey, normalizedLocalResult);
    return normalizedLocalResult;
  }

  let requestUrl = audioId;
  if (!audioId.startsWith('http')) {
    requestUrl = `${BASE_URL}/item/ihas.${audioId}/?fo=json`;
  } else {
    requestUrl = `${audioId}?fo=json`;
  }

  return fetchWithCache(cacheKey, async () => {
    try {
      const response = await fetch(requestUrl);
      const selectedItem = await response.json();
      if (!selectedItem) {
        return { audioUrl: null, metadata: null, error: 'No audio found for that id.' };
      }

      const audioUrl = getAudioUrlFromResources(selectedItem);

      if (!audioUrl) {
        return { audioUrl: null, metadata: null, error: 'No audio found for that id.' };
      }

      const metadata = normalizeMetadata(buildMetadata(selectedItem, selectedItem));
      const result = { audioUrl, metadata, error: null };
      audioCache.set(cacheKey, result);
      writeLocalCache(
        `${AUDIO_ID_CACHE_PREFIX}${cacheKey}`,
        `${AUDIO_ID_CACHE_TIMESTAMP_PREFIX}${cacheKey}`,
        result
      );
      return result;
    } catch (error) {
      console.error('Error fetching audio by id:', error);
      const result = { audioUrl: null, metadata: null, error: 'Error fetching audio by id.' };
      audioCache.set(cacheKey, result);
      writeLocalCache(
        `${AUDIO_ID_CACHE_PREFIX}${cacheKey}`,
        `${AUDIO_ID_CACHE_TIMESTAMP_PREFIX}${cacheKey}`,
        result
      );
      return result;
    }
  });
}

export async function fetchAvailableYears() {
  if (availableYearsCache) {
    return availableYearsCache;
  }

  const localCatalog = readLocalCache(
    LOCAL_CATALOG_KEY,
    CATALOG_CACHE_TIMESTAMP_KEY,
    CATALOG_CACHE_TTL
  );
  if (localCatalog) {
    availableYearsCache = buildCatalogPayload(localCatalog.entries || localCatalog, {
      error: null,
      source: localCatalog.source || 'local-cache',
      generatedAt: localCatalog.generatedAt || null
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
    writeLocalCache(LOCAL_CATALOG_KEY, CATALOG_CACHE_TIMESTAMP_KEY, {
      entries: availableYearsCache.entries,
      source: availableYearsCache.source,
      generatedAt: availableYearsCache.generatedAt
    });
    return availableYearsCache;
  } catch (error) {
    console.error('Error fetching available years:', error);
    const staleCatalog = typeof localStorage !== 'undefined'
      ? localStorage.getItem(LOCAL_CATALOG_KEY)
      : null;

    if (staleCatalog) {
      try {
        const parsedCatalog = JSON.parse(staleCatalog);
        return buildCatalogPayload(parsedCatalog.entries || parsedCatalog, {
          error: 'Error fetching available years.',
          source: parsedCatalog.source || 'stale-local-cache',
          generatedAt: parsedCatalog.generatedAt || null
        });
      } catch (parseError) {
        console.warn('Failed to parse stale available years cache', parseError);
      }
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
