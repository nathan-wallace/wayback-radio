function getRuntimeBaseUrl() {
  if (typeof globalThis !== 'undefined' && typeof globalThis.__WAYBACK_BASE_URL__ === 'string') {
    return globalThis.__WAYBACK_BASE_URL__;
  }

  try {
    return Function('return import.meta.env && import.meta.env.BASE_URL;')();
  } catch (error) {
    return '/';
  }
}

export function normalizeBaseUrl(baseUrl = getRuntimeBaseUrl()) {
  if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
    return '/';
  }

  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

export function buildDatasetUrl(path = '', baseUrl = getRuntimeBaseUrl()) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedPath = String(path)
    .replace(/^\/+/, '')
    .replace(/^data\/+/, '');

  return `${normalizedBaseUrl}data/${normalizedPath}`;
}
