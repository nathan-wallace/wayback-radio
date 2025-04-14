// AudioService.jsx
const BASE_URL = 'https://www.loc.gov';

// Create caches for audio requests and available years
const audioCache = {};
let availableYearsCache = null;

export async function fetchAudioByYear(year, encodedTitle = null) {
  const cacheKey = `${year}-${encodedTitle || ''}`;
  if (audioCache[cacheKey]) {
    return audioCache[cacheKey];
  }

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
    const playableItems = items.filter(item =>
      item.resources?.some(resource => resource.audio || resource.url?.includes('.mp3') || resource.url?.includes('.wav'))
    );
    if (playableItems.length === 0) {
      const result = { audioUrl: null, metadata: null, title: null, error: 'No playable audio found for this year.' };
      audioCache[cacheKey] = result;
      return result;
    }
    let selectedItem = playableItems[0];
    if (encodedTitle) {
      const decodedTitle = decodeURIComponent(encodedTitle);
      const match = playableItems.find(item => item.title?.toLowerCase().includes(decodedTitle.toLowerCase()));
      if (match) {
        selectedItem = match;
      }
    }
    const itemId = selectedItem.id.replace(/^https?:\/\/(www\.)?loc\.gov\/item\//, '').replace(/\/$/, '');
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
          const audioFile = resource.files.find(file => file.mimetype?.includes('audio') || file.url?.match(/\.(mp3|wav)$/i));
          if (audioFile) {
            audioUrl = audioFile.url;
            break;
          }
        }
      }
    }
    if (!audioUrl) {
      const result = { audioUrl: null, metadata: null, title: null, error: 'No audio URL available for this item.' };
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
        .filter(item => item && typeof item === 'string');
    };

    const metadata = {
      title: itemData.title || itemData.item?.title || 'Untitled Recording',
      date: itemData.date || itemData.item?.date || year.toString(),
      url: itemData.url || selectedItem.url || `https://www.loc.gov/item/${itemId}/`,
      contributor: itemData.item?.contributor?.join(', ') || itemData.contributor?.join(', ') || '',
      summary: itemData.item?.description?.join(' ') || itemData.description?.[0] || '',
      genre: itemData.item?.genre?.join(', ') || itemData.type?.join(', ') || '',
      image: itemData.image_url?.[0] || itemData.item?.image_url || null,
      notes: Array.isArray(itemData.item?.notes) ? itemData.item.notes : [],
      repository: itemData.item?.repository || '',
      aka: processLinks(itemData.item?.aka || itemData.aka),
      related_resources: processLinks(itemData.item?.related_resources),
      formats: processLinks(itemData.item?.other_formats),
      location: itemData.item?.location?.join(', ') || '',
      mime_type: itemData.item?.mime_type?.join(', ') || ''
    };

    const encodedAudioTitle = encodeURIComponent(itemId || metadata.title);

    const result = {
      audioUrl,
      metadata,
      title: encodedAudioTitle,
      error: null
    };

    // Cache the result
    audioCache[cacheKey] = result;
    return result;
  } catch (error) {
    console.error('Error fetching audio:', error);
    const result = { audioUrl: null, metadata: null, title: null, error: 'Error fetching audio. Try another year or title.' };
    audioCache[cacheKey] = result;
    return result;
  }
}

export async function fetchAvailableYears() {
  // Return cached available years if they exist.
  if (availableYearsCache) {
    return availableYearsCache;
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
    return availableYearsCache;
  } catch (error) {
    console.error('Error fetching years:', error);
    return { years: [], error: 'Error fetching available years.' };
  }
}
