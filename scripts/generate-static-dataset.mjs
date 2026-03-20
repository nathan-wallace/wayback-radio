import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoDatasetValidationErrors, validateArchiveCacheDataset } from '../shared/datasetValidation.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE_CACHE_PATH = path.join(ROOT_DIR, 'src', 'data', 'archive-cache.json');

async function main() {
  const archiveCache = JSON.parse(await readFile(ARCHIVE_CACHE_PATH, 'utf8'));
  assertNoDatasetValidationErrors(validateArchiveCacheDataset(archiveCache));

  const catalogEntryCount = Array.isArray(archiveCache?.catalog?.entries)
    ? archiveCache.catalog.entries.length
    : Array.isArray(archiveCache?.availableYears)
      ? archiveCache.availableYears.length
      : 0;

  console.log(
    `Using checked-in archive cache snapshot from ${ARCHIVE_CACHE_PATH} (${catalogEntryCount} catalog years).`
  );
  console.log('Static dataset generation in CI now reuses the committed snapshot instead of crawling the live LOC API.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
