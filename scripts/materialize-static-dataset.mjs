import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSelectionKeys as buildNormalizedSelectionKeys,
  extractUid,
  normalizeMetadata,
  normalizeText,
} from '../shared/locNormalization.mjs';
import { assertNoDatasetValidationErrors, validateArchiveCacheDataset } from '../shared/datasetValidation.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE_CACHE_PATH = path.join(ROOT_DIR, 'src', 'data', 'archive-cache.json');
const PUBLIC_DATA_DIR = path.join(ROOT_DIR, 'public', 'data');

function buildSelectionKeys(routeId, uid, title) {
  return buildNormalizedSelectionKeys(routeId, uid, title);
}

function buildItemPayloadPath(year, routeId) {
  const normalizedYear = normalizeText(year);
  const normalizedRouteId = normalizeText(routeId);

  if (!normalizedYear || !normalizedRouteId) {
    return null;
  }

  return `items/${normalizedYear}/${normalizedRouteId}.json`;
}

async function writeJson(relativePath, payload) {
  const targetPath = path.join(PUBLIC_DATA_DIR, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function buildCatalogEntries(archiveCache) {
  const entries = archiveCache?.catalog?.entries;

  if (Array.isArray(entries) && entries.length > 0) {
    return entries;
  }

  return (archiveCache?.availableYears || []).map((year) => ({
    year,
    itemCount: null,
    sampleItemIds: [],
    status: 'manifest'
  }));
}

function buildManifestPayload(archiveCache, catalogEntries) {
  return {
    generatedAt: archiveCache?.generatedAt || null,
    source: archiveCache?.source || 'bootstrap-manifest',
    manifestVersion: archiveCache?.manifestVersion || archiveCache?.generatedAt || 'bootstrap-manifest',
    availableYears: archiveCache?.availableYears || catalogEntries.map((entry) => entry.year),
    catalog: {
      generatedAt: archiveCache?.catalog?.generatedAt || archiveCache?.generatedAt || null,
      source: archiveCache?.catalog?.source || archiveCache?.source || 'bootstrap-manifest',
      pageCount: archiveCache?.catalog?.pageCount ?? 0,
      entries: catalogEntries,
    }
  };
}

function buildYearManifest(year, audioRecord, generatedAt, source) {
  const routeId = normalizeText(audioRecord?.itemId) || normalizeText(audioRecord?.metadata?.uid) || String(year);
  const uid = normalizeText(audioRecord?.metadata?.uid) || extractUid(routeId) || routeId;
  const title = normalizeText(audioRecord?.metadata?.title) || normalizeText(audioRecord?.title) || routeId;
  const payloadPath = buildItemPayloadPath(year, routeId);

  return {
    year: Number.parseInt(year, 10),
    generatedAt,
    source,
    items: [
      {
        uid,
        normalizedUid: uid,
        routeId,
        payloadPath,
        title,
        date: normalizeText(audioRecord?.metadata?.date) || String(year),
        contributor: normalizeText(audioRecord?.metadata?.contributor),
        hasPlayableAudio: Boolean(audioRecord?.audioUrl),
        selectionKeys: buildSelectionKeys(routeId, uid, title),
        order: 0,
      }
    ]
  };
}

async function main() {
  const archiveCache = JSON.parse(await readFile(ARCHIVE_CACHE_PATH, 'utf8'));
  assertNoDatasetValidationErrors(validateArchiveCacheDataset(archiveCache));
  const catalogEntries = buildCatalogEntries(archiveCache);
  const generatedAt = archiveCache?.generatedAt || new Date().toISOString();
  const source = archiveCache?.catalog?.source || archiveCache?.source || 'bootstrap-manifest';

  await rm(PUBLIC_DATA_DIR, { recursive: true, force: true });
  await mkdir(PUBLIC_DATA_DIR, { recursive: true });

  const catalogPayload = {
    generatedAt: archiveCache?.catalog?.generatedAt || generatedAt,
    source,
    pageCount: archiveCache?.catalog?.pageCount ?? 0,
    entries: catalogEntries,
  };

  await writeJson('manifest.json', buildManifestPayload(archiveCache, catalogEntries));
  await writeJson('catalog.json', catalogPayload);
  await writeJson('catalog/index.json', catalogPayload);

  const audioByYear = archiveCache?.audioByYear || {};
  await Promise.all(Object.entries(audioByYear).flatMap(([year, audioRecord]) => {
    const routeId = normalizeText(audioRecord?.itemId) || normalizeText(audioRecord?.metadata?.uid) || String(year);
    const itemPayloadPath = buildItemPayloadPath(year, routeId);
    const normalizedAudioRecord = {
      ...audioRecord,
      metadata: normalizeMetadata(audioRecord?.metadata),
    };
    const writes = [
      writeJson(`audio/${year}.json`, normalizedAudioRecord),
      writeJson(`catalog/years/${year}.json`, buildYearManifest(year, normalizedAudioRecord, generatedAt, source)),
    ];

    if (itemPayloadPath) {
      writes.push(writeJson(itemPayloadPath, normalizedAudioRecord));
    }

    return writes;
  }));

  console.log(`Materialized static dataset into ${PUBLIC_DATA_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
