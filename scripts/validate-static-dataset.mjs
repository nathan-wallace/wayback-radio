import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNoDatasetValidationErrors,
  validateArchiveCacheDataset,
  validateJsonDirectory,
} from '../shared/datasetValidation.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE_CACHE_PATH = path.join(ROOT_DIR, 'src', 'data', 'archive-cache.json');

function parseArgs(argv = []) {
  const directories = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dir') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --dir');
      }
      directories.push(value);
      index += 1;
    }
  }

  return directories;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const directories = parseArgs(process.argv.slice(2));
  const archiveCache = JSON.parse(await readFile(ARCHIVE_CACHE_PATH, 'utf8'));
  const errors = [...validateArchiveCacheDataset(archiveCache)];

  for (const directory of directories) {
    const targetPath = path.join(ROOT_DIR, directory);
    if (!await pathExists(targetPath)) {
      errors.push({ message: `Missing dataset directory ${directory}.` });
      continue;
    }

    errors.push(...await validateJsonDirectory(ROOT_DIR, targetPath));
  }

  assertNoDatasetValidationErrors(errors);
  console.log(`Validated dataset source and ${directories.length} JSON director${directories.length === 1 ? 'y' : 'ies'}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
