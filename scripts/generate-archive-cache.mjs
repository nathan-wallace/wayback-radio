import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildMetadata,
  extractLocItemId,
  extractPlaybackFromResources,
  extractUid,
  extractYear,
  isPlayableSearchItem,
  normalizeMetadata,
} from '../shared/locNormalization.mjs';

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
const MAX_BOOTSTRAP_AUDIO_YEARS = 6;
const FEATURED_BOOTSTRAP_YEARS = [1903, 1917, 1942, 1952, 1970, 1978];
const FALLBACK_SEED = {
  generatedAt: '2026-03-19T00:00:00.000Z',
  manifestVersion: 'fallback-seed-v1',
  source: 'bootstrap-manifest',
  sourceMetadata: {
    generator: 'scripts/generate-archive-cache.mjs',
    strategy: 'fallback-seed',
    searchUrl: buildSearchUrl(1),
    itemUrlTemplate: `${BASE_URL}/item/{itemId}/?fo=json`,
    notes: 'Static fallback seed used when the Library of Congress API is unavailable during generation.'
  },
  catalog: {
    generatedAt: '2026-03-19T00:00:00.000Z',
    source: 'bootstrap-fallback-seed',
    pageCount: 0,
    entries: [
      { year: 1903, itemCount: 1, sampleItemIds: ['100010968'], status: 'ready' },
      { year: 1917, itemCount: 1, sampleItemIds: ['100010382'], status: 'ready' },
      { year: 1942, itemCount: 1, sampleItemIds: ['200197221'], status: 'ready' },
      { year: 1952, itemCount: 1, sampleItemIds: ['200197221'], status: 'ready' },
      { year: 1970, itemCount: 1, sampleItemIds: ['200196384'], status: 'ready' },
      { year: 1978, itemCount: 1, sampleItemIds: ['200196565'], status: 'ready' }
    ]
  },
  availableYears: [1903, 1917, 1942, 1952, 1970, 1978],
  audioByYear: {
    '1903': {
      audioUrl: 'https://www.loc.gov/resource/ihas.100010968.0',
      metadata: {
        title: 'I hear America singing',
        date: '1903',
        url: 'https://www.loc.gov/item/ihas.100010968/',
        uid: '100010968',
        contributor: 'Whitman, Walt, 1819-1892, Billy Collins, b. 1941',
        summary: 'Billy Collins reads Walt Whitman\'s poem at the Library of Congress.',
        genre: 'Literary readings',
        image: null,
        notes: ['Recorded at the Library of Congress.'],
        repository: 'music division',
        aka: [],
        related_resources: [],
        formats: [],
        location: '',
        mime_type: 'audio'
      },
      title: 'ihas.100010968',
      itemId: 'ihas.100010968',
      error: null,
      itemUids: ['100010968']
    },
    '1917': {
      audioUrl: 'https://www.loc.gov/resource/ihas.100010382.0',
      metadata: {
        title: "America: My country 'tis of thee",
        date: '1917',
        url: 'https://www.loc.gov/item/ihas.100010382/',
        uid: '100010382',
        contributor: '',
        summary: 'Bootstrap seed for an Edison-era Library of Congress audio item.',
        genre: 'Audio Recording',
        image: null,
        notes: ['Representative early recording seed.'],
        repository: '',
        aka: [],
        related_resources: [],
        formats: [],
        location: '',
        mime_type: 'audio'
      },
      title: 'ihas.100010382',
      itemId: 'ihas.100010382',
      error: null,
      itemUids: ['100010382']
    },
    '1942': {
      audioUrl: 'https://www.loc.gov/resource/ihas.200197221.0',
      metadata: {
        title: 'The night herding song',
        date: '1942',
        url: 'https://www.loc.gov/item/ihas.200197221/',
        uid: '200197221',
        contributor: 'Stephens, Harry, Lomax, John A. (John Avery)',
        summary: 'Recorded in Dallas, Texas and later published in 1952.',
        genre: 'sound recording',
        image: null,
        notes: ['Date: Recorded in 1942.', 'Venue: Recorded in Dallas, Texas.'],
        repository: 'american folklife center',
        aka: [],
        related_resources: [],
        formats: [],
        location: 'Texas, United States',
        mime_type: 'audio'
      },
      title: 'ihas.200197221',
      itemId: 'ihas.200197221',
      error: null,
      itemUids: ['200197221']
    },
    '1952': {
      audioUrl: 'https://www.loc.gov/resource/ihas.200197221.0',
      metadata: {
        title: 'The night herding song',
        date: '1952',
        url: 'https://www.loc.gov/item/ihas.200197221/',
        uid: '200197221',
        contributor: 'Stephens, Harry, Lomax, John A. (John Avery)',
        summary: 'Published in 1952 from a 1942 field recording.',
        genre: 'sound recording',
        image: null,
        notes: ['Bibliographic History: Published on the Library of Congress LP AFS L28.'],
        repository: 'american folklife center',
        aka: [],
        related_resources: [],
        formats: [],
        location: 'Texas, United States',
        mime_type: 'audio'
      },
      title: 'ihas.200197221',
      itemId: 'ihas.200197221',
      error: null,
      itemUids: ['200197221']
    },
    '1970': {
      audioUrl: 'https://www.loc.gov/resource/ihas.200196384.0',
      metadata: {
        title: 'Jesus Leads Me All the Way',
        date: '1970',
        url: 'https://www.loc.gov/item/ihas.200196384/',
        uid: '200196384',
        contributor: 'Yurchenco, Henrietta, Goodwin',
        summary: "Gullah spiritual recorded on John's Island, South Carolina.",
        genre: 'sound recording',
        image: null,
        notes: ['Date: March 29, 1970.', "Venue: Recorded in John's Island, South Carolina."],
        repository: 'american folklife center',
        aka: [],
        related_resources: [],
        formats: [],
        location: 'South Carolina, United States',
        mime_type: 'audio'
      },
      title: 'ihas.200196384',
      itemId: 'ihas.200196384',
      error: null,
      itemUids: ['200196384']
    },
    '1978': {
      audioUrl: 'https://www.loc.gov/resource/ihas.200196565.0',
      metadata: {
        title: 'Deep Down in My Heart',
        date: '1978',
        url: 'https://www.loc.gov/item/ihas.200196565',
        uid: '200196565',
        contributor: 'Gordon, Robert Winslow, Givens, W. M.',
        summary: 'Bootstrap seed representing the Robert Winslow Gordon Collection release.',
        genre: 'sound recording',
        image: null,
        notes: ['Source: Published in 1978 in commemoration of the 50th anniversary of the Archive of Folk Culture.', 'Date: March 19, 1926.'],
        repository: 'american folklife center',
        aka: [],
        related_resources: [],
        formats: [],
        location: 'Georgia, United States',
        mime_type: 'audio'
      },
      title: 'ihas.200196565',
      itemId: 'ihas.200196565',
      error: null,
      itemUids: ['200196565']
    }
  }
};

function buildSearchUrl(pageNumber = 1) {
  const params = new URLSearchParams({
    ...SEARCH_PARAMS,
    sp: String(pageNumber)
  });
  return `${BASE_URL}/search/?${params.toString()}`;
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
  const audioUrl = extractPlaybackFromResources(itemData).primaryUrl;

  if (!audioUrl) {
    return [String(entry.year), null];
  }

  return [String(entry.year), {
    audioUrl,
    metadata: buildMetadata(itemData, selectedItem, entry.year),
    title: encodeURIComponent(itemId || itemData.title || String(entry.year)),
    itemId,
    error: null,
    itemUids: entry.sampleItemIds
  }];
}

function pickBootstrapAudioEntries(catalogEntries) {
  const catalogByYear = new Map(catalogEntries.map((entry) => [entry.year, entry]));
  const selected = [];

  FEATURED_BOOTSTRAP_YEARS.forEach((year) => {
    const entry = catalogByYear.get(year);
    if (entry) {
      selected.push(entry);
    }
  });

  if (selected.length >= MAX_BOOTSTRAP_AUDIO_YEARS) {
    return selected.slice(0, MAX_BOOTSTRAP_AUDIO_YEARS);
  }

  const remaining = catalogEntries.filter((entry) => !selected.some((picked) => picked.year === entry.year));
  if (remaining.length === 0) return selected;

  const step = Math.max(1, Math.floor(remaining.length / Math.max(1, MAX_BOOTSTRAP_AUDIO_YEARS - selected.length)));
  for (let index = 0; index < remaining.length && selected.length < MAX_BOOTSTRAP_AUDIO_YEARS; index += step) {
    selected.push(remaining[index]);
  }

  return selected.sort((a, b) => a.year - b.year).slice(0, MAX_BOOTSTRAP_AUDIO_YEARS);
}

function buildPayload({ catalogEntries, pageCount, audioByYear, generatedAt, source, sourceMetadata }) {
  const availableYears = catalogEntries.map((entry) => entry.year);
  const manifestVersion = createHash('sha256')
    .update(JSON.stringify({
      source,
      catalogEntries: catalogEntries.map(({ sampleItem, ...entry }) => entry),
      availableYears,
      audioByYear,
    }))
    .digest('hex')
    .slice(0, 16);
  return {
    generatedAt,
    manifestVersion,
    source,
    sourceMetadata,
    catalog: {
      generatedAt,
      source,
      pageCount,
      entries: catalogEntries.map(({ sampleItem, ...entry }) => entry)
    },
    availableYears,
    audioByYear
  };
}

function normalizeArchivePayload(payload) {
  return {
    ...payload,
    audioByYear: Object.fromEntries(Object.entries(payload?.audioByYear || {}).map(([year, audioRecord]) => [
      year,
      {
        ...audioRecord,
        metadata: normalizeMetadata(audioRecord?.metadata),
      }
    ]))
  };
}

async function writePayload(payload) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

async function main() {
  console.log('Fetching yearly archive catalog from the Library of Congress API...');
  const { entries: catalogEntries, pageCount } = await fetchCatalogWithSamples();
  const bootstrapEntries = pickBootstrapAudioEntries(catalogEntries);
  const audioByYear = {};

  for (const entry of bootstrapEntries) {
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
  const payload = buildPayload({
    catalogEntries,
    pageCount,
    audioByYear,
    generatedAt,
    source: 'loc-search-pagination',
    sourceMetadata: {
      generator: 'scripts/generate-archive-cache.mjs',
      searchUrl: source,
      itemUrlTemplate: `${BASE_URL}/item/{itemId}/?fo=json`,
      pageSize: Number.parseInt(SEARCH_PARAMS.c, 10),
      pageCount,
      bootstrapAudioYears: Object.keys(audioByYear).map((year) => Number.parseInt(year, 10)),
      strategy: 'full-catalog-small-audio-seed'
    }
  });

  await writePayload(normalizeArchivePayload(payload));
}

main().catch(async (error) => {
  const existingCache = await readExistingCache();

  if (existingCache && Array.isArray(existingCache?.catalog?.entries) && existingCache.catalog.entries.length > 0) {
    console.warn('Failed to refresh archive cache; keeping the existing static cache file.');
    console.warn(error);
    return;
  }

  console.warn('Falling back to the built-in archive cache seed.');
  console.warn(error);
  await writePayload(normalizeArchivePayload(FALLBACK_SEED));
});
