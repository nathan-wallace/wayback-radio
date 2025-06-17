const BASE_URL = 'https://www.loc.gov';

// Create caches for audio requests and available years.
const audioCache = {};
let availableYearsCache = null;
// Prefixes for storing cached data in localStorage
const LOCAL_YEARS_KEY = 'availableYears';
const YEARS_CACHE_TIMESTAMP_KEY = 'availableYearsTimestamp';
const YEARS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const AUDIO_CACHE_PREFIX = 'audioCache-';
const AUDIO_ID_CACHE_PREFIX = 'audioIdCache-';

/**
 * Helper function to extract a unique id (UID) from an item’s id.
 * Expects an id like "http://www.loc.gov/item/ihas.100010366/" and returns "100010366".
 */
function extractUid(itemId) {
  if (!itemId) return null;
  const match = itemId.match(/ihas\.(\d+)/);
  return match ? match[1] : null;
}

/**
 * Fetch audio URLs for a given year.
 * If an optional unique parameter (encodedTitle) is provided, it is combined with the year.
 */
export async function fetchAudioByYear(year, encodedTitle = null) {
  const cacheKey = `${year}-${encodedTitle || ''}`;
  if (audioCache[cacheKey]) {
    console.info(`Returning cached result for key ${cacheKey}`);
    return audioCache[cacheKey];
  }
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(`${AUDIO_CACHE_PREFIX}${cacheKey}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      audioCache[cacheKey] = parsed;
      return parsed;
    }
  }

  try {
    let query = `${year}`;
    if (encodedTitle) {
      const decodedTitle = decodeURIComponent(encodedTitle);
      query = `${decodedTitle} ${year}`;
    }
    const searchUrl = `${BASE_URL}/search/?q=${encodeURIComponent(query)}&fa=original-format:sound+recording|digitized&fo=json`;
    console.log(`Search URL: ${searchUrl}`);
    
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    const items = searchData.results || [];
    const playableItems = items.filter(item =>
      item.resources?.some(resource =>
         resource.audio ||
         (resource.url && (resource.url.includes('.mp3') || resource.url.includes('.wav')))
      )
    );
    const itemUids = playableItems.map(item => extractUid(item.id)).filter(Boolean);
    
    if (playableItems.length === 0) {
      const result = { audioUrl: null, metadata: null, title: null, error: 'No playable audio found for this year.', itemUids: [] };
      audioCache[cacheKey] = result;
      return result;
    }
    
    let selectedItem = playableItems[0];
    if (encodedTitle) {
      const decodedTitle = decodeURIComponent(encodedTitle);
      const match = playableItems.find(item =>
        item.title?.toLowerCase().includes(decodedTitle.toLowerCase())
      );
      if (match) {
        selectedItem = match;
      }
    }
    
    // Build the item-specific URL.
    const itemId = selectedItem.id.replace(/^https?:\/\/(www\.)?loc\.gov\/item\//, '').replace(/\/$/, '');
    const itemUrl = `${BASE_URL}/item/${itemId}/?fo=json`;
    console.log(`Item URL: ${itemUrl}`);
    
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
          const audioFile = resource.files.find(file =>
            file.mimetype?.includes('audio') || file.url?.match(/\.(mp3|wav)$/i)
          );
          if (audioFile) {
            audioUrl = audioFile.url;
            break;
          }
        }
      }
    }
    if (!audioUrl) {
      const result = { audioUrl: null, metadata: null, title: null, error: 'No audio URL available for this item.', itemUids };
      audioCache[cacheKey] = result;
      return result;
    }

    const processLinks = (items) => {
      if (!items || !Array.isArray(items)) return [];
      return items
        .map(item => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && item.link) return item.link;
          return null;
        })
        .filter(item => item);
    };

    const metadata = {
      title: itemData.title || itemData.item?.title || 'Untitled Recording',
      date: itemData.date || itemData.item?.date || year.toString(),
      url: itemData.url || selectedItem.url || `${BASE_URL}/item/${itemId}/`,
      uid: extractUid(selectedItem.id),
      contributor: itemData.item?.contributor?.join(', ') || itemData.contributor?.join(', ') || '',
      summary: itemData.item?.summary || (Array.isArray(itemData.item?.description) ? itemData.item.description.join(' ') : itemData.description?.[0]) || '',
      genre: itemData.item?.genre?.join(', ') || (Array.isArray(itemData.type) ? itemData.type.join(', ') : itemData.type) || '',
      image: itemData.image_url?.[0] || itemData.item?.image_url || null,
      notes: Array.isArray(itemData.item?.notes) ? itemData.item.notes : [],
      repository: itemData.item?.repository || '',
      aka: processLinks(itemData.item?.aka || itemData.aka),
      related_resources: processLinks(itemData.item?.related_resources),
      formats: processLinks(itemData.item?.other_formats),
      location: (itemData.item?.location || []).join(', ') || '',
      mime_type: (itemData.item?.mime_type || []).join(', ') || ''
    };

    const encodedAudioTitle = encodeURIComponent(itemId || metadata.title);

    const result = {
      audioUrl,
      metadata,
      title: encodedAudioTitle,
      error: null,
      itemUids
    };

    audioCache[cacheKey] = result;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          `${AUDIO_CACHE_PREFIX}${cacheKey}`,
          JSON.stringify(result)
        );
      } catch (e) {
        console.warn('Failed to persist audio cache', e);
      }
    }
    return result;
  } catch (error) {
    console.error('Error fetching audio:', error);
    const result = { audioUrl: null, metadata: null, title: null, error: 'Error fetching audio. Try another year or title.', itemUids: [] };
    audioCache[cacheKey] = result;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          `${AUDIO_CACHE_PREFIX}${cacheKey}`,
          JSON.stringify(result)
        );
      } catch (e) {
        console.warn('Failed to persist audio cache', e);
      }
    }
    return result;
  }
}

/**
 * Fetch audio data for a specific audio item given a unique parameter.
 * If the provided audioId is not a full URL, it is assumed to be a UID and the URL is built accordingly.
 */
export async function fetchAudioById(audioId) {
  let requestUrl = audioId;
  if (!audioId.startsWith("http")) {
    // Assume it's a UID and rebuild the URL.
    requestUrl = `${BASE_URL}/item/ihas.${audioId}/?fo=json`;
  } else {
    requestUrl = `${audioId}?fo=json`;
  }
  const cacheKey = `${audioId}`;
  if (audioCache[cacheKey]) {
    return audioCache[cacheKey];
  }
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(`${AUDIO_ID_CACHE_PREFIX}${cacheKey}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      audioCache[cacheKey] = parsed;
      return parsed;
    }
  }
  try {
    const response = await fetch(requestUrl);
    const selectedItem = await response.json();
    if (selectedItem) {
      let audioUrl = null;
      if (selectedItem.resources) {
        for (const resource of selectedItem.resources) {
          if (resource.audio) {
            audioUrl = resource.audio;
            break;
          }
          if (resource.files) {
            const audioFile = resource.files.find(file =>
              file.mimetype?.includes('audio') || file.url?.match(/\.(mp3|wav)$/i)
            );
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
      const processLinks = (items) => {
        if (!items || !Array.isArray(items)) return [];
        return items.map(item => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && item.link) return item.link;
          return null;
        }).filter(link => link);
      };

      const metadata = {
        title: selectedItem.title || selectedItem.item?.title || 'Untitled Recording',
        date: selectedItem.date || selectedItem.item?.date || '',
        url: selectedItem.url || `${BASE_URL}/item/${extractUid(selectedItem.id)}/`,
        uid: extractUid(selectedItem.id),
        contributor: selectedItem.item?.contributor?.join(', ') || selectedItem.contributor?.join(', ') || '',
        summary: selectedItem.item?.summary || (Array.isArray(selectedItem.item?.description) ? selectedItem.item.description.join(' ') : selectedItem.description?.[0]) || '',
        genre: selectedItem.item?.genre?.join(', ') || (Array.isArray(selectedItem.type) ? selectedItem.type.join(', ') : selectedItem.type) || '',
        image: selectedItem.image_url?.[0] || selectedItem.item?.image_url || null,
        notes: Array.isArray(selectedItem.item?.notes) ? selectedItem.item.notes : [],
        repository: selectedItem.item?.repository || '',
        aka: processLinks(selectedItem.item?.aka || selectedItem.aka),
        related_resources: processLinks(selectedItem.item?.related_resources),
        formats: processLinks(selectedItem.item?.other_formats),
        location: (selectedItem.item?.location || []).join(', ') || '',
        mime_type: (selectedItem.item?.mime_type || []).join(', ') || ''
      };
      const result = { audioUrl, metadata, error: null };
      audioCache[cacheKey] = result;
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(
            `${AUDIO_ID_CACHE_PREFIX}${cacheKey}`,
            JSON.stringify(result)
          );
        } catch (e) {
          console.warn('Failed to persist audio cache', e);
        }
      }
      return result;
    } else {
      return { audioUrl: null, metadata: null, error: 'No audio found for that id.' };
    }
  } catch (error) {
    console.error('Error fetching audio by id:', error);
    const result = { audioUrl: null, metadata: null, error: 'Error fetching audio by id.' };
    audioCache[cacheKey] = result;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          `${AUDIO_ID_CACHE_PREFIX}${cacheKey}`,
          JSON.stringify(result)
        );
      } catch (e) {
        console.warn('Failed to persist audio cache', e);
      }
    }
    return result;
  }
}

/**
 * Fetch available years that have audio content.
 */
export async function fetchAvailableYears() {
  if (availableYearsCache) {
    return availableYearsCache;
  }
  if (typeof localStorage !== 'undefined') {
    const storedYears = localStorage.getItem(LOCAL_YEARS_KEY);
    const ts = parseInt(localStorage.getItem(YEARS_CACHE_TIMESTAMP_KEY), 10);
    if (storedYears && ts && Date.now() - ts < YEARS_CACHE_TTL) {
      availableYearsCache = { years: JSON.parse(storedYears), error: null };
      return availableYearsCache;
    }
  }
  try {
    const searchUrl = `${BASE_URL}/search/?q=sound+recording&fa=original-format:sound+recording|digitized&fo=json&c=100`;
    const response = await fetch(searchUrl);
    const data = await response.json();
    const items = data.results || [];
    const yearsSet = new Set();
    items.forEach(item => {
      if (item.date) {
        const match = item.date.match(/\b(18|19|20)\d{2}\b/);
        if (match) {
          yearsSet.add(parseInt(match[0], 10));
        }
      }
    });
    const yearsArray = Array.from(yearsSet).sort((a, b) => a - b);
    availableYearsCache = { years: yearsArray, error: null };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_YEARS_KEY, JSON.stringify(yearsArray));
      localStorage.setItem(YEARS_CACHE_TIMESTAMP_KEY, Date.now().toString());
    }
    return availableYearsCache;
  } catch (error) {
    console.error('Error fetching available years:', error);
    if (typeof localStorage !== 'undefined') {
      const storedYears = localStorage.getItem(LOCAL_YEARS_KEY);
      if (storedYears) {
        return { years: JSON.parse(storedYears), error: 'Error fetching available years.' };
      }
    }
    return { years: [], error: 'Error fetching available years.' };
  }
}
