import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'src', 'data', 'archive-cache.json');
const BASE_URL = 'https://www.loc.gov';
const SEARCH_URL = `${BASE_URL}/search/?q=sound+recording&fa=original-format:sound+recording|digitized&fo=json&c=100`;
const MAX_SAMPLE_IDS = 3;

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

function getAudioUrl(itemData) {
  for (const resource of itemData.resources || []) {
    if (resource.audio) return resource.audio;
    const fileMatch = resource.files?.find((file) => (
      file.mimetype?.includes('audio') || file.url?.match(/\.(mp3|wav)$/i)
    ));
    if (fileMatch) return fileMatch.url;
  }
  return null;
}

function processLinks(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && item.link) return item.link;
      return null;
    })
    .filter(Boolean);
}

function buildMetadata(itemData, fallbackYear, selectedItem) {
  return {
    title: itemData.title || itemData.item?.title || 'Untitled Recording',
    date: itemData.date || itemData.item?.date || String(fallbackYear),
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

function isPlayableSearchItem(item) {
  return item.resources?.some((resource) => (
    resource.audio
    || resource.url?.match(/\.(mp3|wav)$/i)
    || resource.files?.some((file) => (
      file.mimetype?.includes('audio') || file.url?.match(/\.(mp3|wav)$/i)
    ))
  ));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'wayback-radio-cache-builder/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

async function readExistingCache() {
  try {
    const fileContents = await readFile(outputPath, 'utf8');
    return JSON.parse(fileContents);
  } catch (error) {
    return null;
  }
}

async function fetchCatalogWithSamples() {
  const data = await fetchJson(SEARCH_URL);
  const yearlySamples = new Map();

  for (const item of data.results || []) {
    const year = extractYear(item.date);

    if (!year || !isPlayableSearchItem(item)) {
      continue;
    }

    const existing = yearlySamples.get(year) || {
      year,
      itemCount: 0,
      sampleItemIds: [],
      sampleItem: null,
      status: 'ready'
    };

    existing.itemCount += 1;

    const uid = extractUid(item.id);
    if (uid && !existing.sampleItemIds.includes(uid)) {
      existing.sampleItemIds.push(uid);
      existing.sampleItemIds = existing.sampleItemIds.slice(0, MAX_SAMPLE_IDS);
    }

    if (!existing.sampleItem) {
      existing.sampleItem = item;
    }

    yearlySamples.set(year, existing);
  }

  return Array.from(yearlySamples.values()).sort((a, b) => a.year - b.year);
}

async function buildYearCache(entry) {
  const selectedItem = entry.sampleItem;
  const itemId = selectedItem.id
    .replace(/^https?:\/\/(www\.)?loc\.gov\/item\//, '')
    .replace(/\/$/, '');
  const itemUrl = `${BASE_URL}/item/${itemId}/?fo=json`;
  const itemData = await fetchJson(itemUrl);
  const audioUrl = getAudioUrl(itemData);

  if (!audioUrl) {
    return [String(entry.year), null];
  }

  return [String(entry.year), {
    audioUrl,
    metadata: buildMetadata(itemData, entry.year, selectedItem),
    title: encodeURIComponent(itemId || itemData.title || String(entry.year)),
    error: null,
    itemUids: entry.sampleItemIds
  }];
}

async function main() {
  console.log('Fetching yearly archive catalog from the Library of Congress API...');
  const catalogEntries = await fetchCatalogWithSamples();
  const availableYears = catalogEntries.map((entry) => entry.year);
  const audioByYear = {};

  for (const entry of catalogEntries) {
    const [year, yearCache] = await buildYearCache(entry);
    if (yearCache) {
      audioByYear[year] = yearCache;
      console.log(`Cached bootstrap audio for ${year}`);
    } else {
      console.warn(`Skipped ${year}: no audio URL found in item payload.`);
    }
  }

  const generatedAt = new Date().toISOString();
  const payload = {
    generatedAt,
    source: SEARCH_URL,
    catalog: {
      generatedAt,
      source: SEARCH_URL,
      entries: catalogEntries.map(({ sampleItem, ...entry }) => entry)
    },
    availableYears,
    audioByYear
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

main().catch(async (error) => {
  const existingCache = await readExistingCache();

  if (existingCache) {
    console.warn('Failed to refresh archive cache; keeping the existing static cache file.');
    console.warn(error);
    return;
  }

  console.error(error);
  process.exitCode = 1;
});
