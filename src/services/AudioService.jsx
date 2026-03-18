import archiveCache from '../data/archive-cache.json';

const BASE_URL = 'https://www.loc.gov';
const AUDIO_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const YEARS_CACHE_TTL = 24 * 60 * 60 * 1000;
const LOCAL_YEARS_KEY = 'availableYears';
const YEARS_CACHE_TIMESTAMP_KEY = 'availableYearsTimestamp';
const AUDIO_CACHE_PREFIX = 'audioCache-';
const AUDIO_ID_CACHE_PREFIX = 'audioIdCache-';
const AUDIO_CACHE_TIMESTAMP_PREFIX = 'audioCacheTimestamp-';
const AUDIO_ID_CACHE_TIMESTAMP_PREFIX = 'audioIdCacheTimestamp-';

const audioCache = new Map();
const requestCache = new Map();
const bootstrapAudioByYear = archiveCache?.audioByYear || {};
const bootstrapAvailableYears = archiveCache?.availableYears || [];

let availableYearsCache = bootstrapAvailableYears.length
  ? { years: bootstrapAvailableYears, error: null }
  : null;

function extractUid(itemId) {
  if (!itemId) return null;
  const match = itemId.match(/ihas\.(\d+)/);
  return match ? match[1] : null;
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

export async function fetchAudioByYear(year) {
  const cacheKey = `${year}`;
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
      const playableItems = items.filter((item) => (
        item.resources?.some((resource) => (
          resource.audio ||
          (resource.url && (resource.url.includes('.mp3') || resource.url.includes('.wav')))
        ))
      ));
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

      let audioUrl = null;
      if (itemData.resources) {
        for (const resource of itemData.resources) {
          if (resource.audio) {
            audioUrl = resource.audio;
            break;
          }
          if (resource.files) {
            const audioFile = resource.files.find((file) => (
              file.mimetype?.includes('audio') || file.url?.match(/\.(mp3|wav)$/i)
            ));
            if (audioFile) {
              audioUrl = audioFile.url;
              break;
            }
          }
        }
      }

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

      let audioUrl = null;
      if (selectedItem.resources) {
        for (const resource of selectedItem.resources) {
          if (resource.audio) {
            audioUrl = resource.audio;
            break;
          }
          if (resource.files) {
            const audioFile = resource.files.find((file) => (
              file.mimetype?.includes('audio') || file.url?.match(/\.(mp3|wav)$/i)
            ));
            if (audioFile) {
              audioUrl = audioFile.url;
              break;
            }
          }
        }
      }

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

  const localYears = readLocalCache(LOCAL_YEARS_KEY, YEARS_CACHE_TIMESTAMP_KEY, YEARS_CACHE_TTL);
  if (localYears) {
    availableYearsCache = { years: localYears, error: null };
    return availableYearsCache;
  }

  if (bootstrapAvailableYears.length) {
    availableYearsCache = { years: bootstrapAvailableYears, error: null };
    return availableYearsCache;
  }

  try {
    const searchUrl = `${BASE_URL}/search/?q=sound+recording&fa=original-format:sound+recording|digitized&fo=json&c=100`;
    const response = await fetch(searchUrl);
    const data = await response.json();
    const items = data.results || [];
    const yearsSet = new Set();

    items.forEach((item) => {
      if (!item.date) return;
      const match = item.date.match(/\b(18|19|20)\d{2}\b/);
      if (match) {
        yearsSet.add(Number.parseInt(match[0], 10));
      }
    });

    const yearsArray = Array.from(yearsSet).sort((a, b) => a - b);
    availableYearsCache = { years: yearsArray, error: null };
    writeLocalCache(LOCAL_YEARS_KEY, YEARS_CACHE_TIMESTAMP_KEY, yearsArray);
    return availableYearsCache;
  } catch (error) {
    console.error('Error fetching available years:', error);
    const staleYears = typeof localStorage !== 'undefined'
      ? localStorage.getItem(LOCAL_YEARS_KEY)
      : null;

    if (staleYears) {
      try {
        return {
          years: JSON.parse(staleYears),
          error: 'Error fetching available years.'
        };
      } catch (parseError) {
        console.warn('Failed to parse stale available years cache', parseError);
      }
    }

    return { years: bootstrapAvailableYears, error: 'Error fetching available years.' };
  }
}
