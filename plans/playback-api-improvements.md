playback-api-improvements
========================

Goal
----
Improve the working audio playback experience in Wayback Radio by:
- Making the fetch layer resilient (retry, backoff, circuit breaker, cache busting)
- Making the playback layer smoother (crossfades, auto-retry, source fallback, ready state)

Problems identified
-------------------
1. AudioService.jsx fetch layer
   - No HTTP retry on 5xx or 429 failures
   - Cache keys have no TTL — stale stale data blocks live data forever
   - No circuit breaker — repeated 502/503s keep hammering the API
   - No cache-busting for manifest refreshes — stale catalog shown until reload
   - In-memory caches (audioCache, yearManifestCache) are unbounded Maps with no eviction
   - No request dedup across parallel calls (two selections at once = two fetches for the same thing)

2. useAudioManager hook
   - 500ms hardcoded fade (too short for 404s, too long for snappy 404s) — no tuning control
   - No source fallback in Howl — first source fails, playback silently fails
   - No ready-state check before play — Howl reports "play" but underlying <audio> might not be ready
   - Howl's onplayerror/onloaderror are fire-and-forget — no retry or state recovery
   - No audioReady state — UI doesn't know when buffering is complete
   - Volume sync only fires when transportState === 'playing' — misses edge case of ondemand fades into volume change

3. useRadioController
   - Year switching does not cancel in-flight fetches from old selections
   - Next/prev navigation fires without checking if the prior fetch completed
   - No prefetch of adjacent tracks — user waits on every navigation

4. OfflineStateService
   - IndexedDB saves unbounded item records with no cleanup

Plan
----
Phase 1 (done in this branch)
  A. FetcherService.js (new file)
     - createFetcher(url, opts) — returns a deduplicated promise with:
       - Adaptive retry with jitter on 5xx and 429
       - Circuit breaker (exponential backoff escalation)
       - Priority-based in-memory cache (low-prefetch / default / high-priority)
       - Cache-busting URL parameter for manifest/catalog
       - AbortController signal on stale calls
     - prefetch(url, opts) — fire-and-forget low-priority prefetch of a resource

  B. useAudioManager — enhanced
     - Source fallback on Howl onloaderror (automatically tries next src)
     - audioReady state — UI can show "loading" vs "error" correctly
     - Proper cleanup on unmount (clears all pending fades, cancels active sounds)
     - isMountedRef pattern to prevent state updates after unmount (fixes React warnings)

Phase 2 (next branch)
  C. AudioService integration
     - Wire createFetcher into fetchJson() with retry config per endpoint
     - Add circuit breaker tracking to LOC API requests
     - Add cache-busting to catalog/year-manifest refreshes
     - Set priority on year-manifest fetches vs year-manifest prefetches

  D. useRadioController improvements
     - Request ID cancellation for in-flight fetches on year switch
     - prefetchAdjacentYears() wired with prefetch() to use low-priority FetcherService
     - Debounce rapid next/prev navigations (100ms guard)

  E. Cache cleanup cron (new service)
     - Periodic LRU eviction on audioCache and yearManifestCache
     - Max 500 entries, evict oldest on overflow

Priority
--------
Phase 1 gives immediate UX improvements:
- Playback no longer silently fails on format mismatches (source fallback)
- UI correctly shows error states instead of stuck "loading"
- Next phase fetch layer eliminates flicker from repeated 5xx errors
