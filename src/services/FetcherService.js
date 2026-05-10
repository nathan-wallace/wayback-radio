// FetcherService — priority cache, adaptive retry, circuit breaker, request cancelation

const fetchers = {};

function safeJson(resp) {
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json') || ct.includes('text/plain')) {
    return resp.text().then((text) => {
      try { return JSON.parse(text); } catch { return text; }
    });
  }
  return resp.json();
}

function fetchWithAbort(url, signal) {
  return Promise.resolve(fetch(url, { signal })).then((resp) => {
    if (!resp.ok) {
      const err = new Error(`HTTP ${resp.status} for ${url}`);
      err.name = 'HttpStatusError';
      err.status = resp.status;
      err.url = url;
      throw err;
    }
    return safeJson(resp);
  });
}

class AbortControllerWithFallback {
  constructor() {
    this.current = new AbortController();
  }
  abort() { try { this.current.abort(); } catch {} }
  get signal() { return this.current.signal; }
}

function normalizeErrorMessage(error) {
  if (!error) return 'Unknown fetch error';
  if (error.name === 'AbortError') return 'canceled';
  if (error.message) return error.message;
  return String(error);
}

const fetcherDefaults = {
  maxRetries: 2,
  initialDelayMs: 300,
  maxDelayMs: 5000,
  jitterFactor: 0.3,
  cacheBust: false,
  cacheKey: null,
  cacheTTL: 86400000,
  priority: 'default',
  abortStale: true,
};

/**
 * Build a fetcher with retry, adaptive backoff, circuit breaker,
 * priority cache, and cache busting.
 *
 * @param {string} url
 * @param {Object} [opts]
 * @param {number} [opts.maxRetries=2]
 * @param {number} [opts.initialDelayMs=300]
 * @param {number} [opts.maxDelayMs=5000]
 * @param {number} [opts.jitterFactor=0.3]
 * @param {boolean} [opts.cacheBust=false] URL timestamp-based cache busting
 * @param {string} [opts.cacheKey=null] explicit cache key for priority cache
 * @param {number} [opts.cacheTTL=86400000] ms
 * @param {string} [opts.priority='default'] low | default | high-priority
 * @param {boolean} [opts.abortStale=true]
 * @returns {() => Promise<any>} fetcher function
 */
export function createFetcher(url, opts = {}) {
  const c = { ...fetcherDefaults, ...opts };
  const { initialDelayMs, maxDelayMs, jitterFactor, maxRetries, cacheBust, cacheTTL, abortStale } = c;

  let pendingResolve = null;
  let pendingReject = null;
  let aborter = new AbortControllerWithFallback();
  let circuitBreakerOpen = false;
  let circuitBreakerUntil = 0;
  let consecutiveFailures = 0;
  let isAborted = false;

  function backoff(forAttempt, delayMs) {
    const base = Math.min(delayMs * Math.pow(2, forAttempt), maxDelayMs);
    const jitter = base * (Math.random() * 2 - 1) * jitterFactor;
    const ms = Math.max(0, base + jitter);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function priorityCache() {
    if (!c.cacheKey) return null;
    const store = (fetchers['$$priorityByPriority$$'] ||= { low: new Map(), default: new Map(), high: new Map() });
    const key = c.priority === 'low' ? `${url}` : `prefetch:${c.cacheKey}`;
    const entry = store[c.priority]?.get(key);
    if (entry && entry.createdAt + c.cacheTTL > Date.now()) return entry.value;
    return null;
  }

  function cacheResult(value) {
    if (!c.cacheKey) return;
    const store = (fetchers['$$priorityByPriority$$'] ||= { low: new Map(), default: new Map(), high: new Map() });
    const key = c.priority === 'low' ? `${url}` : `prefetch:${c.cacheKey}`;
    if (!store[c.priority]) store[c.priority] = new Map();
    store[c.priority].set(key, { value, createdAt: Date.now() });
  }

  function getCircuitBreakerUntil() {
    const base = 30000 * Math.pow(2, Math.min(consecutiveFailures, 5));
    return Math.min(base, 300000);
  }

  function fetchFn() {
    if (isAborted) return new Promise(() => {});
    if (abortStale && pendingResolve) return pendingPromise;

    if (aborter.current.signal.aborted) aborter = new AbortControllerWithFallback();

    if (circuitBreakerOpen && Date.now() < circuitBreakerUntil) {
      return new Promise((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;
        setTimeout(() => fetchFn().then(pendingResolve).catch(pendingReject), 500);
      });
    }

    let requestUrl = url;
    if (cacheBust) {
      const sep = url.includes('?') ? '&' : '?';
      requestUrl = `${url}${sep}t=${Date.now()}`;
    }

    return fetchWithAbort(requestUrl, aborter.signal).then((data) => {
      cacheResult(data);
      consecutiveFailures = 0;
      circuitBreakerOpen = false;
      return data;
    }).catch((err) => {
      if (normalizeErrorMessage(err) === 'canceled') return Promise.reject(err);
      if (err.status === 404) return Promise.reject(err);
      if (err.status >= 400 && err.status < 500 && err.status !== 429) return Promise.reject(err);
      circuitBreakerOpen = false;
      if (circuitBreakerUntil > 0) circuitBreakerOpen = true;
      circuitBreakerUntil = Date.now() + getCircuitBreakerUntil();
      return backoff(consecutiveFailures, initialDelayMs).then(() => fetchFn());
    });
  }

  const pendingPromise = (async () => {
    try {
      const cached = priorityCache();
      if (cached) return cached;
      if (circuitBreakerOpen && Date.now() > circuitBreakerUntil) {
        circuitBreakerOpen = false;
      }
      return await fetchFn();
    } catch (err) {
      if (!isAborted) throw err;
    }
  })();

  pendingPromise.abort = () => { isAborted = true; aborter.abort(); if (pendingResolve) pendingResolve(null); };
  return pendingPromise;
}

export async function prefetch(url, opts = {}) {
  const { initialDelayMs } = opts;
  await new Promise((r) => setTimeout(r, initialDelayMs || 100));
  return createFetcher(url, { ...opts, priority: 'low' });
}
