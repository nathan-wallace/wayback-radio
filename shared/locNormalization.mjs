function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function joinMetadataParts(...parts) {
  return parts.filter(hasText).join(' · ');
}

function createLinkItems(items = []) {
  return items
    .map((item) => {
      if (!item?.url) return null;

      return {
        label: hasText(item.label) ? item.label : item.url,
        url: item.url,
      };
    })
    .filter(Boolean);
}

export function normalizeText(value) {
  if (Array.isArray(value)) {
    return normalizeText(value.find((item) => normalizeText(item)));
  }

  if (value == null) return '';
  return String(value).trim();
}

export function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

export function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return [];

    if (keys.every((key) => /^\d+$/.test(key))) {
      return keys
        .sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10))
        .map((key) => value[key]);
    }

    const nestedArrayKey = ['results', 'items', 'entries', 'files', 'resources'].find((key) => Array.isArray(value[key]));
    if (nestedArrayKey) {
      return value[nestedArrayKey];
    }
  }

  return [value];
}

export function extractLocItemId(itemId) {
  const normalized = normalizeText(itemId);
  if (!normalized) return null;

  return normalized
    .replace(/^https?:\/\/(www\.)?loc\.gov\/item\//i, '')
    .replace(/^item\//i, '')
    .replace(/\/?(\?fo=json)?$/i, '')
    .replace(/^\//, '');
}

export const normalizeLocItemId = extractLocItemId;

export function extractUid(itemId) {
  const normalized = extractLocItemId(itemId) || normalizeText(itemId);
  if (!normalized) return null;

  const match = normalized.match(/ihas\.(\d+)/i);
  return match ? match[1] : null;
}

export function extractYear(dateValue) {
  if (!dateValue) return null;
  const match = String(dateValue).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number.parseInt(match[0], 10) : null;
}

export function normalizeRouteIdentity(value) {
  const raw = normalizeText(value);
  if (!raw) return null;

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }

  const normalized = extractLocItemId(decoded) || decoded;
  return normalized
    .toLowerCase()
    .replace(/^ihas\./, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildSelectionKeys(...values) {
  return [...new Set(values.flat().map((value) => normalizeRouteIdentity(value)).filter(Boolean))];
}

export function normalizeImage(value, fallbackAlt = 'Recording cover') {
  const src = Array.isArray(value)
    ? value.find((item) => typeof item === 'string' && item.trim())
    : typeof value === 'string'
      ? value.trim()
      : value?.src;

  if (!src) return null;

  return {
    src,
    alt: fallbackAlt || 'Recording cover',
  };
}

export function normalizeLinkItems(items = []) {
  if (!Array.isArray(items)) return [];

  return createLinkItems(items.map((item) => {
    if (typeof item === 'string') {
      return { label: item, url: item };
    }

    if (item?.url) {
      return {
        label: item.label || item.url,
        url: item.url,
      };
    }

    if (item?.link) {
      return {
        label: item.title || item.label || item.link,
        url: item.link,
      };
    }

    return null;
  }).filter(Boolean));
}

export function buildMetadata(itemData, selectedItem = null, fallbackYear = null) {
  const title = normalizeText(itemData?.title || itemData?.item?.title) || 'Untitled Recording';
  const date = normalizeText(itemData?.date || itemData?.item?.date || fallbackYear?.toString());
  const url = normalizeText(itemData?.url || selectedItem?.url);
  const genre = normalizeText(itemData?.item?.genre || itemData?.type);
  const metadata = {
    title,
    date,
    url,
    uid: extractUid(selectedItem?.id || itemData?.id || selectedItem?.routeId || itemData?.itemId),
    contributor: normalizeText(itemData?.item?.contributor || itemData?.contributor),
    summary: normalizeText(
      itemData?.item?.summary
      || itemData?.item?.description
      || itemData?.description
    ),
    genre,
    recordingInfo: joinMetadataParts(date, genre),
    image: normalizeImage(itemData?.image_url || itemData?.item?.image_url, title),
    notes: normalizeList(itemData?.item?.notes || itemData?.notes),
    repository: normalizeText(itemData?.item?.repository || itemData?.repository),
    aka: normalizeLinkItems(itemData?.item?.aka || itemData?.aka),
    relatedResources: normalizeLinkItems(itemData?.item?.related_resources || itemData?.related_resources),
    formats: normalizeLinkItems(itemData?.item?.other_formats || itemData?.formats || itemData?.other_formats),
    location: normalizeText(itemData?.item?.location || itemData?.location),
    mimeType: normalizeText(itemData?.item?.mime_type || itemData?.mime_type),
    source: normalizeLinkItems(itemData?.source || (url ? [{ label: url, url }] : [])),
  };

  metadata.technicalDetails = [
    metadata.uid ? { label: 'UID', value: metadata.uid } : null,
    metadata.mimeType ? { label: 'Mime Type', value: metadata.mimeType } : null,
  ].filter(Boolean);

  return metadata;
}

export function normalizeMetadata(metadata) {
  if (!metadata) return null;

  const title = normalizeText(metadata.title) || 'Untitled Recording';
  const date = normalizeText(metadata.date);
  const genre = normalizeText(metadata.genre);
  const url = normalizeText(metadata.url);
  const normalized = {
    title,
    date,
    url,
    uid: normalizeText(metadata.uid),
    contributor: normalizeText(metadata.contributor),
    summary: normalizeText(metadata.summary),
    genre,
    recordingInfo: normalizeText(metadata.recordingInfo) || joinMetadataParts(date, genre),
    image: metadata.image?.src
      ? metadata.image
      : normalizeImage(metadata.image, title),
    notes: normalizeList(metadata.notes),
    repository: normalizeText(metadata.repository),
    aka: normalizeLinkItems(metadata.aka),
    relatedResources: normalizeLinkItems(metadata.relatedResources || metadata.related_resources),
    formats: normalizeLinkItems(metadata.formats),
    location: normalizeText(metadata.location),
    mimeType: normalizeText(metadata.mimeType || metadata.mime_type),
    source: normalizeLinkItems(metadata.source || (url ? [{ label: url, url }] : [])),
  };

  normalized.technicalDetails = Array.isArray(metadata.technicalDetails)
    ? metadata.technicalDetails
      .map((item) => ({
        label: normalizeText(item?.label),
        value: normalizeText(item?.value),
      }))
      .filter((item) => item.label && item.value)
    : [
      normalized.uid ? { label: 'UID', value: normalized.uid } : null,
      normalized.mimeType ? { label: 'Mime Type', value: normalized.mimeType } : null,
    ].filter(Boolean);

  return normalized;
}

export function isPlayableResource(resource) {
  return Boolean(
    resource?.audio
    || resource?.url?.match(/\.(mp3|wav)$/i)
    || asArray(resource?.files).some((file) => (
      file?.mimetype?.includes('audio') || file?.url?.match(/\.(mp3|wav)$/i)
    ))
  );
}

export function isPlayableSearchItem(item) {
  return asArray(item?.resources).some((resource) => isPlayableResource(resource));
}

function inferMimeType(url) {
  const normalizedUrl = normalizeText(url).toLowerCase();
  if (!normalizedUrl) return '';

  if (normalizedUrl.match(/\.mp3($|[?#])/)) return 'audio/mpeg';
  if (normalizedUrl.match(/\.wav($|[?#])/)) return 'audio/wav';
  if (normalizedUrl.match(/\.m4a($|[?#])/)) return 'audio/mp4';
  if (normalizedUrl.match(/\.aac($|[?#])/)) return 'audio/aac';
  if (normalizedUrl.match(/\.ogg($|[?#])/)) return 'audio/ogg';
  if (normalizedUrl.match(/\.flac($|[?#])/)) return 'audio/flac';
  return '';
}

function normalizeStreamCandidate(candidate = {}, fallback = {}) {
  const url = normalizeText(candidate?.url || fallback?.url);
  if (!url) return null;

  const mimeType = normalizeText(
    candidate?.mimeType
      || candidate?.mimetype
      || candidate?.type
      || fallback?.mimeType
      || inferMimeType(url)
  );

  const label = normalizeText(candidate?.label || candidate?.download || fallback?.label);
  const source = normalizeText(candidate?.source || fallback?.source);
  const bitrate = normalizeText(candidate?.bitrate || fallback?.bitrate);

  return {
    url,
    mimeType: mimeType || '',
    label: label || null,
    source: source || null,
    bitrate: bitrate || null,
  };
}

function getStreamRank(stream = {}, index = 0) {
  const mimeType = normalizeText(stream?.mimeType).toLowerCase();
  const url = normalizeText(stream?.url).toLowerCase();
  const source = normalizeText(stream?.source).toLowerCase();

  const mimeRank = [
    ['audio/mpeg', 0],
    ['audio/mp4', 1],
    ['audio/aac', 2],
    ['audio/ogg', 3],
    ['audio/wav', 4],
    ['audio/flac', 5],
  ].find(([value]) => mimeType === value)?.[1] ?? 10;

  const sourceRank = source === 'resource-audio'
    ? 0
    : source === 'resource-file'
      ? 1
      : 2;

  return [mimeRank, sourceRank, url, index];
}

function compareRanks(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) < (right[index] ?? 0)) return -1;
    if ((left[index] ?? 0) > (right[index] ?? 0)) return 1;
  }
  return 0;
}

export function extractPlaybackFromResources(itemData) {
  const streams = [];

  asArray(itemData?.resources).forEach((resource) => {
    asArray(resource?.audio).forEach((audioValue) => {
      const stream = normalizeStreamCandidate(
        typeof audioValue === 'string'
          ? { url: audioValue }
          : audioValue,
        { source: 'resource-audio' }
      );

      if (stream) {
        streams.push(stream);
      }
    });

    asArray(resource?.files).forEach((file) => {
      const stream = normalizeStreamCandidate(file, { source: 'resource-file' });
      if (!stream) return;

      if (stream.mimeType.includes('audio') || inferMimeType(stream.url)) {
        streams.push(stream);
      }
    });
  });

  const uniqueStreams = [...new Map(
    streams.map((stream) => [`${stream.url}::${stream.mimeType}`, stream])
  ).values()];

  const rankedStreams = uniqueStreams
    .map((stream, index) => ({ stream, rank: getStreamRank(stream, index) }))
    .sort((left, right) => compareRanks(left.rank, right.rank))
    .map(({ stream }) => stream);

  const primary = rankedStreams[0] || null;

  return {
    primaryUrl: primary?.url || null,
    mimeType: primary?.mimeType || null,
    streams: rankedStreams,
  };
}
