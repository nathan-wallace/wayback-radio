import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractYear, normalizeMetadata, normalizeText } from './locNormalization.mjs';

function createError(message) {
  return { message };
}

function toYearNumber(year) {
  return Number.parseInt(String(year), 10);
}

function formatYears(years = []) {
  return [...new Set(years)].sort().join(', ');
}

export function validateArchiveCacheDataset(archiveCache = {}) {
  const errors = [];
  const routeIdYears = new Map();
  const globalItemWrites = new Map();
  const audioByYear = archiveCache?.audioByYear || {};

  for (const [year, audioRecord] of Object.entries(audioByYear)) {
    const normalizedYear = toYearNumber(year);
    const normalizedAudioRecord = {
      ...audioRecord,
      metadata: normalizeMetadata(audioRecord?.metadata),
    };
    const routeId = normalizeText(normalizedAudioRecord?.itemId)
      || normalizeText(normalizedAudioRecord?.metadata?.uid)
      || String(year);
    const itemDate = normalizeText(normalizedAudioRecord?.metadata?.date) || String(year);
    const itemYear = extractYear(itemDate);

    if (!routeIdYears.has(routeId)) {
      routeIdYears.set(routeId, []);
    }
    routeIdYears.get(routeId).push(String(year));

    const globalItemPayloadPath = routeId ? `items/${routeId}.json` : null;
    if (globalItemPayloadPath) {
      if (!globalItemWrites.has(globalItemPayloadPath)) {
        globalItemWrites.set(globalItemPayloadPath, []);
      }
      globalItemWrites.get(globalItemPayloadPath).push(String(year));
    }

    if (itemYear !== null && itemYear !== normalizedYear) {
      errors.push(createError(
        `Mismatched year manifest date vs item payload date for year ${year}: manifest year ${normalizedYear} does not match item date \"${itemDate}\".`
      ));
    }
  }

  for (const [routeId, years] of routeIdYears.entries()) {
    if (years.length > 1) {
      errors.push(createError(
        `Duplicate routeId across year manifests for \"${routeId}\": ${formatYears(years)}.`
      ));
    }
  }

  for (const [globalItemPayloadPath, years] of globalItemWrites.entries()) {
    if (years.length > 1) {
      errors.push(createError(
        `Duplicate global item write detected for \"${globalItemPayloadPath}\": ${formatYears(years)} would overwrite the same payload.`
      ));
    }
  }

  return errors;
}

async function collectJsonFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      return collectJsonFiles(entryPath);
    }

    if (entry.isFile() && entry.name.endsWith('.json')) {
      return [entryPath];
    }

    return [];
  }));

  return files.flat();
}

export async function validateJsonDirectory(rootDir, directoryPath) {
  const errors = [];
  const jsonFiles = await collectJsonFiles(directoryPath);

  await Promise.all(jsonFiles.map(async (filePath) => {
    try {
      JSON.parse(await readFile(filePath, 'utf8'));
    } catch (error) {
      const relativePath = path.relative(rootDir, filePath) || filePath;
      errors.push(createError(`Invalid JSON in ${relativePath}: ${error.message}`));
    }
  }));

  return errors.sort((left, right) => left.message.localeCompare(right.message));
}

export function assertNoDatasetValidationErrors(errors = [], heading = 'Dataset validation failed') {
  if (!errors.length) {
    return;
  }

  const message = [heading, ...errors.map((error) => `- ${error.message}`)].join('\n');
  throw new Error(message);
}
