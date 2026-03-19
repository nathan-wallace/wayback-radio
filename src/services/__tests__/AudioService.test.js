import { __testing as audioServiceTesting, CURRENT_DATASET_VERSION, fetchAudioByYear, fetchAvailableYears, fetchRecordingById, fetchYearManifest, resolvePlaybackForDirectUrl } from '../AudioService';
import { __testing as offlineStoreTesting, saveYearSelection } from '../offlineStore';

function createJsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

function notFoundResponse() {
  return createJsonResponse({}, { ok: false, status: 404 });
}

function createPlayback(url, mimeType = 'audio/mpeg') {
  return {
    primaryUrl: url,
    mimeType,
    streams: [{ url, mimeType, label: null, source: null, bitrate: null }],
  };
}

function createSearchItem({ id, year, title, audio = true }) {
  return {
    id: `https://www.loc.gov/item/${id}/`,
    title,
    date: String(year),
    url: `https://www.loc.gov/item/${id}/`,
    resources: audio ? [{ audio: `https://cdn.example/${id}.mp3` }] : []
  };
}

function createItemPayload({ id, year, title }) {
  return {
    id: `https://www.loc.gov/item/${id}/`,
    title,
    date: String(year),
    url: `https://www.loc.gov/item/${id}/`,
    item: {
      title,
      date: String(year),
      contributor: ['Library of Congress'],
      summary: ['Summary'],
      related_resources: [{ link: `https://related.example/${id}` }],
      other_formats: [{ link: `https://formats.example/${id}` }],
      location: ['Washington, DC'],
      mime_type: ['audio/mpeg']
    },
    resources: [{ audio: `https://cdn.example/${id}.mp3` }]
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function mockLocSearchAndItem({ results, item }) {
  global.fetch.mockImplementation(async (url) => {
    if (String(url).includes('/data/')) {
      return notFoundResponse();
    }

    if (String(url).includes('/search/')) {
      return createJsonResponse({ results });
    }

    if (String(url).includes('/item/')) {
      return createJsonResponse(item);
    }

    throw new Error(`Unexpected URL: ${url}`);
  });
}

describe('fetchAudioByYear', () => {
  beforeEach(async () => {
    window.history.replaceState({}, '', 'http://localhost/');
    delete global.__WAYBACK_ENABLE_BOOTSTRAP_AUTO_REFRESH__;
    jest.restoreAllMocks();
    global.fetch = jest.fn().mockImplementation(async () => notFoundResponse());
    audioServiceTesting.resetCaches();
    await offlineStoreTesting.resetOfflineStore();
    localStorage.clear();
  });

  it('filters playable candidates to the requested year before selecting an item', async () => {
    mockLocSearchAndItem({
      results: [
        createSearchItem({ id: 'mismatch-1981', year: 1981, title: 'Wrong year first' }),
        createSearchItem({ id: 'match-1980', year: 1980, title: 'Correct year second' })
      ],
      item: createItemPayload({ id: 'match-1980', year: 1980, title: 'Correct year second' })
    });

    const result = await fetchAudioByYear(1980);

    expect(result.error).toBeNull();
    expect(result.playback).toMatchObject({
      primaryUrl: 'https://cdn.example/match-1980.mp3',
      mimeType: 'audio/mpeg',
    });
    expect(result.metadata.title).toBe('Correct year second');
    expect(result.metadata.date).toBe('1980');
    expect(global.fetch.mock.calls.at(-1)[0]).toContain('/item/match-1980/');
  });

  it('prefers an exact requested identity match within the requested year', async () => {
    mockLocSearchAndItem({
      results: [
        createSearchItem({ id: 'default-1980', year: 1980, title: 'Default Choice' }),
        createSearchItem({ id: 'special-1980', year: 1980, title: 'Special Match Title' })
      ],
      item: createItemPayload({ id: 'special-1980', year: 1980, title: 'Special Match Title' })
    });

    const result = await fetchAudioByYear(1980, 'Special%20Match%20Title');

    expect(result.error).toBeNull();
    expect(result.metadata.title).toBe('Special Match Title');
    expect(result.itemId).toBe('special-1980');
    expect(global.fetch.mock.calls.at(-1)[0]).toContain('/item/special-1980/');
  });

  it('falls back deterministically to the first playable match for the year when no identity matches', async () => {
    mockLocSearchAndItem({
      results: [
        createSearchItem({ id: 'first-1980', year: 1980, title: 'First playable' }),
        createSearchItem({ id: 'second-1980', year: 1980, title: 'Second playable' })
      ],
      item: createItemPayload({ id: 'first-1980', year: 1980, title: 'First playable' })
    });

    const result = await fetchAudioByYear(1980, 'Missing%20Identity');

    expect(result.error).toBeNull();
    expect(result.metadata.title).toBe('First playable');
    expect(global.fetch.mock.calls.at(-1)[0]).toContain('/item/first-1980/');
  });


  it('can defer item-detail requests until playback time while preserving the selected route id', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/data/')) {
        return notFoundResponse();
      }

      if (String(url).includes('/search/')) {
        return createJsonResponse({
          results: [
            createSearchItem({ id: 'deferred-1980', year: 1980, title: 'Deferred Choice' })
          ]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchAudioByYear(1980, null, { deferAudio: true });

    expect(result.error).toBeNull();
    expect(result.playback).toEqual({
      primaryUrl: null,
      mimeType: null,
      streams: [],
    });
    expect(result.itemId).toBe('deferred-1980');
    expect(result.metadata.title).toBe('Deferred Choice');
    expect(result.source).toBe('loc-search-selection');
    expect(global.fetch.mock.calls.filter(([url]) => !String(url).includes('/data/'))).toHaveLength(1);
  });

  it('falls back to stale cached audio when the network request fails', async () => {
    await saveYearSelection(
      1980,
      null,
      {
        playback: createPlayback('https://cdn.example/stale.mp3'),
        metadata: { title: 'Cached Result', date: '1980', uid: '900' },
        error: null,
        itemUids: ['900']
      },
      {
        id: '900',
        routeId: 'cached-1980',
        uid: '900',
        playback: createPlayback('https://cdn.example/stale.mp3'),
        metadata: { title: 'Cached Result', date: '1980', uid: '900' },
      },
      {
        ttl: 7 * 24 * 60 * 60 * 1000,
        freshness: {
          fetchedAt: Date.now() - (8 * 24 * 60 * 60 * 1000),
          expiresAt: Date.now() - (24 * 60 * 60 * 1000),
        },
        datasetVersion: CURRENT_DATASET_VERSION,
      }
    );

    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/data/')) {
        return notFoundResponse();
      }

      throw new Error('network down');
    });

    const result = await fetchAudioByYear(1980);

    expect(result.stale).toBe(true);
    expect(result.source).toBe('stale-year-cache');
    expect(result.playback.primaryUrl).toBe('https://cdn.example/stale.mp3');
    expect(result.metadata.title).toBe('Cached Result');
  });

  it('keeps fresh cached metadata visible while stale playback is re-resolved for a year selection', async () => {
    const now = Date.now();

    await saveYearSelection(
      1980,
      null,
      {
        playback: createPlayback('https://cdn.example/expired.mp3'),
        metadata: { title: 'Cached Metadata', date: '1980', uid: '901' },
        error: null,
        itemUids: ['901'],
        itemRouteIds: ['cached-1980'],
      },
      {
        id: '901',
        routeId: 'cached-1980',
        uid: '901',
        playback: createPlayback('https://cdn.example/expired.mp3'),
        metadata: { title: 'Cached Metadata', date: '1980', uid: '901' },
      },
      {
        selectionTtl: 14 * 24 * 60 * 60 * 1000,
        metadataTtl: 7 * 24 * 60 * 60 * 1000,
        playbackTtl: 60 * 60 * 1000,
        freshness: {
          fetchedAt: now - (2 * 60 * 60 * 1000),
          expiresAt: now + (6 * 24 * 60 * 60 * 1000),
        },
        playbackFreshness: {
          playbackFetchedAt: now - (3 * 60 * 60 * 1000),
          playbackExpiresAt: now - (60 * 1000),
        },
        datasetVersion: CURRENT_DATASET_VERSION,
      }
    );

    mockLocSearchAndItem({
      results: [
        createSearchItem({ id: 'cached-1980', year: 1980, title: 'Cached Metadata' })
      ],
      item: createItemPayload({ id: 'cached-1980', year: 1980, title: 'Refreshed Playback' })
    });

    const result = await fetchAudioByYear(1980);

    expect(result.playback.primaryUrl).toBe('https://cdn.example/cached-1980.mp3');
    expect(result.metadata.title).toBe('Refreshed Playback');
    expect(result.stalePlayback).toBe(false);
  });

  it('returns cached metadata without an expired playback URL when playback re-resolution fails for a year selection', async () => {
    const now = Date.now();

    await saveYearSelection(
      1980,
      null,
      {
        playback: createPlayback('https://cdn.example/expired.mp3'),
        metadata: { title: 'Metadata Only', date: '1980', uid: '902' },
        error: null,
        itemUids: ['902'],
        itemRouteIds: ['cached-1980'],
      },
      {
        id: '902',
        routeId: 'cached-1980',
        uid: '902',
        playback: createPlayback('https://cdn.example/expired.mp3'),
        metadata: { title: 'Metadata Only', date: '1980', uid: '902' },
      },
      {
        selectionTtl: 14 * 24 * 60 * 60 * 1000,
        metadataTtl: 7 * 24 * 60 * 60 * 1000,
        playbackTtl: 60 * 60 * 1000,
        freshness: {
          fetchedAt: now - (2 * 60 * 60 * 1000),
          expiresAt: now + (6 * 24 * 60 * 60 * 1000),
        },
        playbackFreshness: {
          playbackFetchedAt: now - (3 * 60 * 60 * 1000),
          playbackExpiresAt: now - (60 * 1000),
        },
        datasetVersion: CURRENT_DATASET_VERSION,
      }
    );

    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/data/')) {
        return notFoundResponse();
      }

      throw new Error('network down');
    });

    const result = await fetchAudioByYear(1980);

    expect(result.metadata.title).toBe('Metadata Only');
    expect(result.playback.primaryUrl).toBeNull();
    expect(result.pendingAudio).toBe(true);
    expect(result.source).toBe('stale-playback-metadata-cache');
  });

  it('prefers the materialized static dataset before falling back to LOC search', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (String(url).endsWith('/data/catalog/years/1980.json')) {
        return createJsonResponse({
          year: 1980,
          generatedAt: '2026-03-19T00:00:00.000Z',
          source: 'static-dataset-year-manifest',
          items: [
            {
              uid: '1980-a',
              normalizedUid: '1980-a',
              routeId: 'static-1980-a',
              title: 'Static Dataset Choice',
              date: '1980',
              contributor: 'Static Source',
              hasPlayableAudio: true,
              selectionKeys: ['static dataset choice', 'static-1980-a'],
              order: 0,
            }
          ]
        });
      }

      if (String(url).endsWith('/data/items/static-1980-a.json')) {
        return createJsonResponse({
          playback: createPlayback('https://cdn.example/static-1980-a.mp3'),
          metadata: {
            title: 'Static Dataset Choice',
            date: '1980',
            uid: '1980-a',
            contributor: 'Static Source',
          },
          itemId: 'static-1980-a',
          source: 'static-dataset-item'
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchAudioByYear(1980);

    expect(result.error ?? null).toBeNull();
    expect(result.source).toBe('static-dataset-item');
    expect(result.metadata.title).toBe('Static Dataset Choice');
    expect(result.itemRouteIds).toEqual(['static-1980-a']);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls.every(([url]) => String(url).includes('/data/'))).toBe(true);
  });
});





describe('fetchYearManifest', () => {
  beforeEach(async () => {
    window.history.replaceState({}, '', 'http://localhost/');
    delete global.__WAYBACK_ENABLE_BOOTSTRAP_AUTO_REFRESH__;
    jest.restoreAllMocks();
    global.fetch = jest.fn().mockImplementation(async () => notFoundResponse());
    audioServiceTesting.resetCaches();
    await offlineStoreTesting.resetOfflineStore();
    localStorage.clear();
  });

  it('returns ordered route ids, normalized uids, and the selected identity for the requested year', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/data/')) {
        return notFoundResponse();
      }

      if (String(url).includes('/search/')) {
        return createJsonResponse({
          results: [
            createSearchItem({ id: 'default-1980', year: 1980, title: 'Default Choice' }),
            createSearchItem({ id: 'special-1980', year: 1980, title: 'Special Match Title' }),
            createSearchItem({ id: 'other-1979', year: 1979, title: 'Wrong year' })
          ]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const manifest = await fetchYearManifest(1980, 'Special%20Match%20Title');

    expect(manifest.itemRouteIds).toEqual(['default-1980', 'special-1980']);
    expect(manifest.itemUids).toEqual([]);
    expect(manifest.selectedItemIdentity).toBe('special-1980');
    expect(manifest.selectedIndex).toBe(1);
    expect(manifest.selectedItem).toMatchObject({
      routeId: 'special-1980',
      title: 'Special Match Title',
      date: '1980',
      hasPlayableAudio: true,
    });
    expect(manifest.selectedItem.selectionKeys).toContain('special match title');
  });

  it('falls back to the first playable item when the requested identity does not match', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/data/')) {
        return notFoundResponse();
      }

      if (String(url).includes('/search/')) {
        return createJsonResponse({
          results: [
            createSearchItem({ id: 'first-1980', year: 1980, title: 'First playable' }),
            createSearchItem({ id: 'second-1980', year: 1980, title: 'Second playable' })
          ]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const manifest = await fetchYearManifest(1980, 'Missing%20Identity');

    expect(manifest.itemRouteIds).toEqual(['first-1980', 'second-1980']);
    expect(manifest.selectedItemIdentity).toBe('first-1980');
    expect(manifest.selectedIndex).toBe(0);
  });

  it('uses the materialized year manifest when it exists', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (String(url).endsWith('/data/catalog/years/1980.json')) {
        return createJsonResponse({
          year: 1980,
          generatedAt: '2026-03-19T00:00:00.000Z',
          source: 'static-dataset-year-manifest',
          items: [
            {
              uid: 'static-one',
              normalizedUid: 'static-one',
              routeId: 'static-one',
              title: 'Static One',
              date: '1980',
              contributor: 'Static',
              hasPlayableAudio: true,
              selectionKeys: ['static one', 'static-one'],
              order: 0,
            },
            {
              uid: 'static-two',
              normalizedUid: 'static-two',
              routeId: 'static-two',
              title: 'Static Two',
              date: '1980',
              contributor: 'Static',
              hasPlayableAudio: true,
              selectionKeys: ['static two', 'static-two'],
              order: 1,
            }
          ]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const manifest = await fetchYearManifest(1980, 'static-two');

    expect(manifest.itemRouteIds).toEqual(['static-one', 'static-two']);
    expect(manifest.itemUids).toEqual(['static-one', 'static-two']);
    expect(manifest.selectedItemIdentity).toBe('static-two');
    expect(manifest.source).toBe('static-dataset-year-manifest');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('available years normalization', () => {
  it('treats object-shaped resources and files as playable', () => {
    expect(audioServiceTesting.isPlayableSearchItem({
      resources: {
        files: {
          url: 'https://cdn.example/object-shaped.mp3',
          mimetype: 'audio/mpeg'
        }
      }
    })).toBe(true);
  });

  it('coerces object-shaped resources when extracting playback metadata', () => {
    expect(audioServiceTesting.extractPlaybackFromResources({
      resources: {
        files: {
          url: 'https://cdn.example/object-shaped.mp3',
          mimetype: 'audio/mpeg'
        }
      }
    })).toEqual({
      primaryUrl: 'https://cdn.example/object-shaped.mp3',
      mimeType: 'audio/mpeg',
      streams: [{
        url: 'https://cdn.example/object-shaped.mp3',
        mimeType: 'audio/mpeg',
        label: null,
        source: 'resource-file',
        bitrate: null,
      }],
    });
  });

  it('treats numeric-keyed resource collections as playable when fetching available years', async () => {
    jest.restoreAllMocks();
    global.fetch = jest.fn().mockImplementation(async (url) => {
      if (String(url).includes('/data/')) {
        return notFoundResponse();
      }

      return createJsonResponse({
        results: [
          {
            id: 'https://www.loc.gov/item/numeric-keys/',
            title: 'Numeric keyed resource',
            date: '1980',
            resources: {
              0: {
                files: {
                  0: {
                    url: 'https://cdn.example/numeric-keyed.mp3',
                    mimetype: 'audio/mpeg'
                  }
                }
              }
            }
          }
        ],
        pagination: { total: 1, per_page: 100 }
      });
    });

    audioServiceTesting.resetCaches();
    await offlineStoreTesting.resetOfflineStore();
    localStorage.clear();

    const initial = await fetchAvailableYears();

    expect(initial.bootstrap).toBe(true);

    await flushAsyncWork();

    audioServiceTesting.resetCaches();
    const result = await fetchAvailableYears();

    expect(result.error).toBeNull();
    expect(result.years).toEqual([1980]);
    expect(result.byYear[1980]).toMatchObject({
      year: 1980,
      itemCount: 1,
      status: 'ready'
    });
  });

  it('loads the catalog from the materialized static dataset when available', async () => {
    jest.restoreAllMocks();
    global.fetch = jest.fn().mockImplementation(async (url) => {
      if (String(url).endsWith('/data/catalog.json')) {
        return createJsonResponse({
          generatedAt: '2026-03-19T00:00:00.000Z',
          source: 'static-dataset-catalog',
          entries: [
            { year: 1933, itemCount: 2, sampleItemIds: ['a', 'b'], status: 'ready' }
          ]
        });
      }

      if (String(url).endsWith('/data/manifest.json')) {
        return notFoundResponse();
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    audioServiceTesting.resetCaches();
    await offlineStoreTesting.resetOfflineStore();
    localStorage.clear();

    const result = await fetchAvailableYears();

    expect(result.error).toBeNull();
    expect(result.source).toBe('static-dataset-catalog');
    expect(result.years).toEqual([1933]);
    expect(global.fetch.mock.calls.every(([url]) => String(url).includes('/data/'))).toBe(true);
  });
});

describe('bootstrap manifest behavior', () => {
  beforeEach(async () => {
    window.history.replaceState({}, '', 'http://localhost/');
    delete global.__WAYBACK_ENABLE_BOOTSTRAP_AUTO_REFRESH__;
    jest.restoreAllMocks();
    global.fetch = jest.fn().mockImplementation(async () => notFoundResponse());
    audioServiceTesting.resetCaches();
    await offlineStoreTesting.resetOfflineStore();
    localStorage.clear();
  });

  it('returns the bootstrap catalog first and refreshes it in the background', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/data/')) {
        return notFoundResponse();
      }

      return createJsonResponse({
        results: [
          createSearchItem({ id: 'refreshed-1942', year: 1942, title: 'Refreshed 1942' }),
          createSearchItem({ id: 'refreshed-1970', year: 1970, title: 'Refreshed 1970' })
        ],
        pagination: { total: 2, per_page: 100 }
      });
    });

    const initial = await fetchAvailableYears();

    expect(initial.bootstrap).toBe(true);
    expect(initial.entries.length).toBeGreaterThan(0);
    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/search/'))).toBe(true);

    await flushAsyncWork();

    audioServiceTesting.resetCaches();
    const refreshed = await fetchAvailableYears();

    expect(refreshed.bootstrap).toBeUndefined();
    expect(refreshed.entries.map((entry) => entry.year)).toEqual([1942, 1970]);
  });

  it('sanitizes bundled LOC resource audio URLs so blocked cross-origin playback does not start immediately', async () => {
    const initial = await fetchAudioByYear(1942);

    expect(initial.bootstrap).toBe(true);
    expect(initial.playback.primaryUrl).toBeNull();
    expect(initial.error).toMatch(/playback is blocked from this origin/i);
    expect(initial.metadata.title).toBe('The night herding song');
  });

  it('uses bootstrap audio as a startup optimization and replaces it after the background refresh completes', async () => {
    mockLocSearchAndItem({
      results: [
        createSearchItem({ id: 'refreshed-1942', year: 1942, title: 'Refreshed 1942' })
      ],
      item: createItemPayload({ id: 'refreshed-1942', year: 1942, title: 'Refreshed 1942' })
    });

    const initial = await fetchAudioByYear(1942);

    expect(initial.bootstrap).toBe(true);
    expect(initial.source).toBe('bootstrap-manifest');
    expect(initial.metadata.title).toBe('The night herding song');

    await flushAsyncWork();

    audioServiceTesting.resetCaches();
    const refreshed = await fetchAudioByYear(1942);

    expect(refreshed.bootstrap).toBeUndefined();
    expect(refreshed.source).toBe('loc-item-search');
    expect(refreshed.metadata.title).toBe('Refreshed 1942');
  });

  it('skips automatic bootstrap refreshes when the override disables them', async () => {
    global.__WAYBACK_ENABLE_BOOTSTRAP_AUTO_REFRESH__ = false;

    const initial = await fetchAvailableYears();

    expect(initial.bootstrap).toBe(true);
    expect(audioServiceTesting.shouldAutoRefreshBootstrappedData()).toBe(false);

    await flushAsyncWork();

    expect(global.fetch.mock.calls.every(([url]) => String(url).includes('/data/'))).toBe(true);
  });

  it('waits for repeated CORS-style LOC failures before entering the temporary cooldown', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/data/')) {
        return notFoundResponse();
      }

      throw new TypeError('Failed to fetch');
    });

    const firstCatalog = await fetchAvailableYears();

    expect(firstCatalog.bootstrap).toBe(true);

    await flushAsyncWork();

    expect(audioServiceTesting.getLocApiState()).toMatchObject({
      consecutiveFailures: 1,
      reason: 'cors-or-network'
    });

    global.fetch.mockClear();

    const bootstrappedAudio = await fetchAudioByYear(1942);

    expect(bootstrappedAudio.bootstrap).toBe(true);

    await flushAsyncWork();

    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/search/'))).toBe(true);
    expect(audioServiceTesting.getLocApiState()).toMatchObject({
      consecutiveFailures: 2,
      reason: 'cors-or-network'
    });
  });
});


describe('fetchRecordingById', () => {
  beforeEach(async () => {
    window.history.replaceState({}, '', 'http://localhost/');
    delete global.__WAYBACK_ENABLE_BOOTSTRAP_AUTO_REFRESH__;
    jest.restoreAllMocks();
    global.fetch = jest.fn();
    audioServiceTesting.resetCaches();
    await offlineStoreTesting.resetOfflineStore();
    localStorage.clear();
  });

  it('requests non-UID route ids from the LOC item endpoint without forcing an ihas prefix', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/data/')) {
        return notFoundResponse();
      }

      return createJsonResponse(createItemPayload({ id: 'route-only-1980', year: 1980, title: 'Route Based Item' }));
    });

    const result = await fetchRecordingById('route-only-1980');

    expect(result.error).toBeNull();
    expect(result.itemId).toBe('route-only-1980');
    expect(result.metadata.title).toBe('Route Based Item');
    expect(global.fetch.mock.calls.at(-1)[0]).toBe('https://www.loc.gov/item/route-only-1980/?fo=json');
  });

  it('re-resolves stale playback for cached item metadata without discarding the metadata', async () => {
    const now = Date.now();

    await saveYearSelection(
      1940,
      null,
      {
        playback: createPlayback('https://cdn.example/expired-item.mp3'),
        metadata: { title: 'Cached Item Metadata', date: '1940', uid: '111' },
        error: null,
        itemUids: ['111'],
        itemRouteIds: ['route-item'],
      },
      {
        id: '111',
        routeId: 'route-item',
        uid: '111',
        playback: createPlayback('https://cdn.example/expired-item.mp3'),
        metadata: { title: 'Cached Item Metadata', date: '1940', uid: '111' },
      },
      {
        selectionTtl: 14 * 24 * 60 * 60 * 1000,
        metadataTtl: 7 * 24 * 60 * 60 * 1000,
        playbackTtl: 60 * 60 * 1000,
        freshness: {
          fetchedAt: now - (2 * 60 * 60 * 1000),
          expiresAt: now + (6 * 24 * 60 * 60 * 1000),
        },
        playbackFreshness: {
          playbackFetchedAt: now - (3 * 60 * 60 * 1000),
          playbackExpiresAt: now - (60 * 1000),
        },
        datasetVersion: CURRENT_DATASET_VERSION,
      }
    );

    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/data/')) {
        return notFoundResponse();
      }

      if (String(url).includes('/item/ihas.111/')) {
        return createJsonResponse(createItemPayload({ id: 'route-item', year: 1940, title: 'Freshly Resolved Item' }));
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchRecordingById('111');

    expect(result.metadata.title).toBe('Freshly Resolved Item');
    expect(result.playback.primaryUrl).toBe('https://cdn.example/route-item.mp3');
    expect(result.stalePlayback).toBe(false);
  });

  it('returns a ready playback result for direct MP3 URLs without rewriting them to fo=json', async () => {
    const directUrl = 'https://media.example.com/audio/sample.mp3';

    const result = await resolvePlaybackForDirectUrl(directUrl);

    expect(result.error).toBeNull();
    expect(result.playback.primaryUrl).toBe(directUrl);
    expect(result.resolution.source).toBe('direct-audio-link');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns a ready playback result for direct WAV URLs without rewriting them to fo=json', async () => {
    const directUrl = 'https://media.example.com/audio/sample.wav';

    const result = await resolvePlaybackForDirectUrl(directUrl);

    expect(result.error).toBeNull();
    expect(result.playback.primaryUrl).toBe(directUrl);
    expect(result.playback.mimeType).toBe('audio/wav');
    expect(result.resolution.source).toBe('direct-audio-link');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
