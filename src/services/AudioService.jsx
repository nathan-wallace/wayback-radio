// AudioService.js
import axios from 'axios';

const BASE_URL = 'https://www.loc.gov/audio/';

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
 * Returns a promise that resolves with an object containing either:
 * - { audioUrl: <url>, error: null } if a playable audio URL is found
 * - { audioUrl: null, error: 'error message' } if not.
 */
export async function fetchAudioByYear(year) {
  try {
    const response = await axios.get(`${BASE_URL}?q=${year}&fo=json`);
    const items = response.data.results;

    const playableItems = items.filter(item =>
      item.resources?.some(resource => resource.audio)
    );

    const selectedItem = getRandomAudio(playableItems);
console.log(selectedItem);
    if (selectedItem) {
      const audioResource = selectedItem.resources.find(resource => resource.audio);
      return {
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
      return { audioUrl: null, metadata: null, error: 'No playable audio found.' };
    }
  } catch (error) {
    return { audioUrl: null, metadata: null, error: 'Error fetching audio. Try another year.' };
  }
}


/**
 * Fetch all available years that have audio content.
 * This function queries the API and extracts unique years from the "date" field in each result.
 * Note: The extraction assumes that the "date" field contains a 4-digit year.
 */
export async function fetchAvailableYears() {
  try {
    const response = await axios.get(`${BASE_URL}?fo=json`);
    const items = response.data.results;
    const yearsSet = new Set();
    items.forEach(item => {
      if (item.date) {
        // Extract a 4-digit year (starting with 19 or 20)
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
