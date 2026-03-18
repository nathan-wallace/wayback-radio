import archiveCache from '../data/archive-cache.json';
import { createLinkItems, joinMetadataParts } from '../config/metadataFields';

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

function normalizeText(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean).join(', ');
  return '';
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeLinkItems(items) {
  if (!Array.isArray(items)) return [];

  return createLinkItems(items.map((item) => {
    if (typeof item === 'string') {
      return { label: item, url: item };
    }

    if (item?.link) {
      return {
        label: normalizeText(item.title || item.label || item.link),
        url: item.link,
      };
    }

    if (item?.url) {
      return {
        label: normalizeText(item.label || item.title || item.url),
        url: item.url,
      };
    }

    return null;
  }).filter(Boolean));
}

function normalizeImage(imageUrl, title) {
  const src = Array.isArray(imageUrl) ? imageUrl[0] : imageUrl;
  if (!src) return null;

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

  const result = normalizeAudioResult({ ...cached, metadata: cached.metadata ? { ...cached.metadata } : null });
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

      const metadata = normalizeMetadata(buildMetadata(itemData, selectedItem, year));
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
