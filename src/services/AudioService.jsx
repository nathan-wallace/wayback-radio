import archiveCache from '../data/archive-cache.json';

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
    title: itemData.title || itemData.item?.title || 'Untitled Recording',
    date: itemData.date || itemData.item?.date || fallbackYear?.toString() || '',
    url: itemData.url || selectedItem?.url || '',
    uid: extractUid(selectedItem?.id || itemData.id),
    contributor: itemData.item?.contributor?.join(', ') || itemData.contributor?.join(', ') || '',
    summary: itemData.item?.summary || (Array.isArray(itemData.item?.description)
      ? itemData.item.description.join(' ')
      : itemData.description?.[0]) || '',
    genre: itemData.item?.genre?.join(', ') || (Array.isArray(itemData.type)
      ? itemData.type.join(', ')
      : itemData.type) || '',
    image: itemData.image_url?.[0] || itemData.item?.image_url || null,
    notes: Array.isArray(itemData.item?.notes) ? itemData.item.notes : [],
    repository: itemData.item?.repository || '',
    aka: processLinks(itemData.item?.aka || itemData.aka),
    related_resources: processLinks(itemData.item?.related_resources),
    formats: processLinks(itemData.item?.other_formats),
    location: (itemData.item?.location || []).join(', ') || '',
    mime_type: (itemData.item?.mime_type || []).join(', ') || ''
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

function getBootstrappedYearResult(year, encodedTitle) {
  if (encodedTitle) return null;

  const cached = bootstrapAudioByYear?.[year];
  if (!cached) return null;

  const result = { ...cached, metadata: cached.metadata ? { ...cached.metadata } : null };
  audioCache.set(`${year}-`, result);
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
    audioCache.set(cacheKey, localResult);
    return localResult;
  }

  const bootstrappedResult = getBootstrappedYearResult(year, encodedTitle);
  if (bootstrappedResult) {
    return bootstrappedResult;
  }

  return fetchWithCache(cacheKey, async () => {
    try {
      let query = `${year}`;
      if (encodedTitle) {
        const decodedTitle = decodeURIComponent(encodedTitle);
        query = `${decodedTitle} ${year}`;
      }

      const searchUrl = `${BASE_URL}/search/?q=${encodeURIComponent(query)}&fa=original-format:sound+recording|digitized&fo=json`;
      const searchResponse = await fetch(searchUrl);
      const searchData = await searchResponse.json();
      const items = searchData.results || [];
      const playableItems = items.filter((item) => isPlayableSearchItem(item));
      const itemUids = playableItems.map((item) => extractUid(item.id)).filter(Boolean);

      if (playableItems.length === 0) {
        const result = {
          audioUrl: null,
          metadata: null,
          title: null,
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

      let selectedItem = playableItems[0];
      if (encodedTitle) {
        const decodedTitle = decodeURIComponent(encodedTitle);
        const matchedItem = playableItems.find((item) => (
          item.title?.toLowerCase().includes(decodedTitle.toLowerCase())
        ));
        if (matchedItem) {
          selectedItem = matchedItem;
        }
      }

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
          title: null,
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
      const encodedAudioTitle = encodeURIComponent(itemId || metadata.title);
      const result = {
        audioUrl,
        metadata,
        title: encodedAudioTitle,
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
        title: null,
        error: 'Error fetching audio. Try another year or title.',
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
    audioCache.set(cacheKey, localResult);
    return localResult;
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

      const metadata = buildMetadata(selectedItem, selectedItem);
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
