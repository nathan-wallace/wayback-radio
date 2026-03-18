import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'src', 'data', 'archive-cache.json');
const BASE_URL = 'https://www.loc.gov';
const SEARCH_PARAMS = {
  q: 'sound recording',
  fa: 'original-format:sound recording|digitized',
  fo: 'json',
  c: '100'
};
const MAX_SAMPLE_IDS = 3;
const MAX_CATALOG_PAGES = 100;

function buildSearchUrl(pageNumber = 1) {
  const params = new URLSearchParams({
    ...SEARCH_PARAMS,
    sp: String(pageNumber)
  });
  return `${BASE_URL}/search/?${params.toString()}`;
}

function extractUid(itemId) {
  if (!itemId) return null;
  const match = itemId.match(/ihas\.(\d+)/);
  return match ? match[1] : null;
}

function extractLocItemId(itemId) {
  if (!itemId) return null;
  return String(itemId)
    .replace(/^https?:\/\/(www\.)?loc\.gov\/item\//, '')
    .replace(/\/?$/, '');
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
  ) || Number.parseInt(SEARCH_PARAMS.c, 10);

  if (totalItems && currentPage * pageSize < totalItems) {
    return currentPage + 1;
  }

  return resultCount === pageSize ? currentPage + 1 : null;
}

async function fetchCatalogWithSamples() {
  const yearlySamples = new Map();
  let currentPage = 1;
  let pageCount = 0;

  while (currentPage && pageCount < MAX_CATALOG_PAGES) {
    const data = await fetchJson(buildSearchUrl(currentPage));
    const results = Array.isArray(data?.results) ? data.results : [];

    for (const item of results) {
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

    pageCount += 1;
    const nextPage = resolveNextPage(data?.pagination, currentPage, results.length);

    if (!nextPage || nextPage === currentPage || results.length === 0) {
      break;
    }

    currentPage = nextPage;
  }

  return {
    entries: Array.from(yearlySamples.values()).sort((a, b) => a.year - b.year),
    pageCount
  };
}

async function buildYearCache(entry) {
  const selectedItem = entry.sampleItem;
  const itemId = extractLocItemId(selectedItem.id);
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
    itemId,
    error: null,
    itemUids: entry.sampleItemIds
  }];
}

async function main() {
  console.log('Fetching yearly archive catalog from the Library of Congress API...');
  const { entries: catalogEntries, pageCount } = await fetchCatalogWithSamples();
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
  const source = buildSearchUrl(1);
  const payload = {
    generatedAt,
    source,
    catalog: {
      generatedAt,
      source,
      pageCount,
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
