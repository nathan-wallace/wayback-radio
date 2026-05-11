// FetcherService — resilient fetch with retry, backoff, circuit breaker, priority cache

function safeJson(resp) {
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json') || ct.includes('text/plain')) {
    return resp.text().then((text) => {
      try { return JSON.parse(text); } catch { return null; }
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
  constructor() { this.current = new AbortController(); }
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
 * Build a resilient fetcher. Returns a deduplicated promise with
 * adaptive retry, circuit breaker, priority cache, and abort support.
 */
export function createFetcher(url, opts = {}) {
  const c = { ...fetcherDefaults, ...opts };
  const { initialDelayMs, maxDelayMs, jitterFactor, maxRetries, cacheBust } = c;

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

  function storeResult(value) {
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
    if (c.abortStale && pendingResolve) return pendingPromise;
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
      storeResult(data);
      consecutiveFailures = 0;
      circuitBreakerOpen = false;
      return data;
    }).catch((err) => {
      if (normalizeErrorMessage(err) === 'canceled') return Promise.reject(err);
      if (err.status === 404) return Promise.reject(err);
      if (err.status >= 400 && err.status < 500 && err.status !== 429) return Promise.reject(err);
      circuitBreakerOpen = false;
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

const fetchers = Object.create(null);

/** Fire-and-forget low-priority prefetch of a URL. */
export function prefetch(url, opts = {}) {
  return createFetcher(url, { ...opts, priority: 'low', initialDelayMs: 50 });
}
