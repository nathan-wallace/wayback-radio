// services/AudioService.jsx
import axios from 'axios';

const BASE_URL = 'https://www.loc.gov/audio/';

// In-memory cache for audio data keyed by year.
const audioCache = {};

/**
 * Returns a random item from an array.
 */
function getRandomAudio(audioList) {
  if (audioList.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * audioList.length);
  return audioList[randomIndex];
}

/**
 * Fetch audio URLs for a given year.
 * Caches the result to minimize duplicate API calls.
 */
export async function fetchAudioByYear(year) {
  // Check the cache first.
  if (audioCache[year]) {
    console.info(`Returning cached result for year ${year}`);
    return audioCache[year];
  }

  try {
    const response = await axios.get(`${BASE_URL}?q=${year}&fo=json`);
    const items = response.data.results;

    const playableItems = items.filter(item =>
      item.resources?.some(resource => resource.audio)
    );

    const selectedItem = getRandomAudio(playableItems);
    let result;
    if (selectedItem) {
      const audioResource = selectedItem.resources.find(resource => resource.audio);
      result = {
        audioUrl: audioResource.audio,
        metadata: {
          title: selectedItem.title,
          date: selectedItem.date,
          url: selectedItem.url,
          contributor: selectedItem.contributor_primary?.join(', ') || "",
          summary: selectedItem.item?.summary || selectedItem.description?.[0],
          genre: selectedItem.item?.genre?.join(', ') || selectedItem.type?.join(', '),
          image: selectedItem.image_url?.[0] || null,
          notes: selectedItem.item?.notes || [],
          repository: selectedItem.item?.repository,
          aka: selectedItem.aka || [],
          related_resources: selectedItem.item?.related_resources || [],
          formats: selectedItem.item?.other_formats || [],
          location: selectedItem.location?.join(', ') || "",
          mime_type: selectedItem.mime_type?.join(', ') || ""
        },
        error: null
      };
    } else {
      result = { audioUrl: null, metadata: null, error: 'No playable audio found.' };
    }
    // Save the result in the cache.
    audioCache[year] = result;
    return result;
  } catch (error) {
    const result = { audioUrl: null, metadata: null, error: 'Error fetching audio. Try another year.' };
    // Cache the error result to prevent continuous requests in error conditions.
    audioCache[year] = result;
    return result;
  }
}

/**
 * Fetch all available years that have audio content.
 */
export async function fetchAvailableYears() {
  try {
    const response = await axios.get(`${BASE_URL}?fo=json`);
    const items = response.data.results;
    const yearsSet = new Set();
    items.forEach(item => {
      if (item.date) {
        // Extract a 4-digit year.
        const match = item.date.match(/\b(18|19|20)\d{2}\b/);
        if (match) {
          yearsSet.add(parseInt(match[0], 10));
        }
      }
    });
    const yearsArray = Array.from(yearsSet).sort((a, b) => a - b);
    return { years: yearsArray, error: null };
  } catch (error) {
    return { years: [], error: 'Error fetching available years.' };
  }
}
