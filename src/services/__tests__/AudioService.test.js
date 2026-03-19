import { __testing as audioServiceTesting, fetchAudioByYear, fetchAvailableYears } from '../AudioService';
import { __testing as offlineStoreTesting, saveYearSelection } from '../offlineStore';

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

describe('fetchAudioByYear', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    global.fetch = jest.fn();
    audioServiceTesting.resetCaches();
    await offlineStoreTesting.resetOfflineStore();
    localStorage.clear();
  });

  it('filters playable candidates to the requested year before selecting an item', async () => {
    global.fetch
      .mockResolvedValueOnce({
        json: async () => ({
          results: [
            createSearchItem({ id: 'mismatch-1981', year: 1981, title: 'Wrong year first' }),
            createSearchItem({ id: 'match-1980', year: 1980, title: 'Correct year second' })
          ]
        })
      })
      .mockResolvedValueOnce({
        json: async () => createItemPayload({ id: 'match-1980', year: 1980, title: 'Correct year second' })
      });

    const result = await fetchAudioByYear(1980);

    expect(result.error).toBeNull();
    expect(result.metadata.title).toBe('Correct year second');
    expect(result.metadata.date).toBe('1980');
    expect(global.fetch.mock.calls[1][0]).toContain('/item/match-1980/');
  });

  it('prefers an exact requested identity match within the requested year', async () => {
    global.fetch
      .mockResolvedValueOnce({
        json: async () => ({
          results: [
            createSearchItem({ id: 'default-1980', year: 1980, title: 'Default Choice' }),
            createSearchItem({ id: 'special-1980', year: 1980, title: 'Special Match Title' })
          ]
        })
      })
      .mockResolvedValueOnce({
        json: async () => createItemPayload({ id: 'special-1980', year: 1980, title: 'Special Match Title' })
      });

    const result = await fetchAudioByYear(1980, 'Special%20Match%20Title');

    expect(result.error).toBeNull();
    expect(result.metadata.title).toBe('Special Match Title');
    expect(result.itemId).toBe('special-1980');
    expect(global.fetch.mock.calls[1][0]).toContain('/item/special-1980/');
  });

  it('falls back deterministically to the first playable match for the year when no identity matches', async () => {
    global.fetch
      .mockResolvedValueOnce({
        json: async () => ({
          results: [
            createSearchItem({ id: 'first-1980', year: 1980, title: 'First playable' }),
            createSearchItem({ id: 'second-1980', year: 1980, title: 'Second playable' })
          ]
        })
      })
      .mockResolvedValueOnce({
        json: async () => createItemPayload({ id: 'first-1980', year: 1980, title: 'First playable' })
      });

    const result = await fetchAudioByYear(1980, 'Missing%20Identity');

    expect(result.error).toBeNull();
    expect(result.metadata.title).toBe('First playable');
    expect(global.fetch.mock.calls[1][0]).toContain('/item/first-1980/');
  });

  it('falls back to stale cached audio when the network request fails', async () => {
    await saveYearSelection(
      1980,
      null,
      {
        audioUrl: 'https://cdn.example/stale.mp3',
        metadata: { title: 'Cached Result', date: '1980', uid: '900' },
        error: null,
        itemUids: ['900']
      },
      {
        id: '900',
        routeId: 'cached-1980',
        uid: '900',
        audioUrl: 'https://cdn.example/stale.mp3',
        metadata: { title: 'Cached Result', date: '1980', uid: '900' },
      },
      {
        ttl: 7 * 24 * 60 * 60 * 1000,
        freshness: {
          fetchedAt: Date.parse('2026-02-01T00:00:00.000Z'),
          expiresAt: Date.parse('2026-02-02T00:00:00.000Z'),
        }
      }
    );

    global.fetch.mockRejectedValue(new Error('network down'));

    const result = await fetchAudioByYear(1980);

    expect(result.stale).toBe(true);
    expect(result.source).toBe('stale-year-cache');
    expect(result.audioUrl).toBe('https://cdn.example/stale.mp3');
    expect(result.metadata.title).toBe('Cached Result');
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

  it('coerces object-shaped resources when extracting an audio URL', () => {
    expect(audioServiceTesting.getAudioUrlFromResources({
      resources: {
        files: {
          url: 'https://cdn.example/object-shaped.mp3',
          mimetype: 'audio/mpeg'
        }
      }
    })).toBe('https://cdn.example/object-shaped.mp3');
  });
});

describe('bootstrap manifest behavior', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    global.fetch = jest.fn();
    audioServiceTesting.resetCaches();
    await offlineStoreTesting.resetOfflineStore();
    localStorage.clear();
  });

  it('returns the bootstrap catalog first and refreshes it in the background', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({
        results: [
          createSearchItem({ id: 'refreshed-1942', year: 1942, title: 'Refreshed 1942' }),
          createSearchItem({ id: 'refreshed-1970', year: 1970, title: 'Refreshed 1970' })
        ],
        pagination: { total: 2, per_page: 100 }
      })
    });

    const initial = await fetchAvailableYears();

    expect(initial.bootstrap).toBe(true);
    expect(initial.entries.length).toBeGreaterThan(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    await Promise.resolve();

    audioServiceTesting.resetCaches();
    const refreshed = await fetchAvailableYears();

    expect(refreshed.bootstrap).toBeUndefined();
    expect(refreshed.entries.map((entry) => entry.year)).toEqual([1942, 1970]);
  });

  it('uses bootstrap audio as a startup optimization and replaces it after the background refresh completes', async () => {
    global.fetch
      .mockResolvedValueOnce({
        json: async () => ({
          results: [
            createSearchItem({ id: 'refreshed-1942', year: 1942, title: 'Refreshed 1942' })
          ]
        })
      })
      .mockResolvedValueOnce({
        json: async () => createItemPayload({ id: 'refreshed-1942', year: 1942, title: 'Refreshed 1942' })
      });

    const initial = await fetchAudioByYear(1942);

    expect(initial.bootstrap).toBe(true);
    expect(initial.source).toBe('bootstrap-manifest');
    expect(initial.metadata.title).toBe('The night herding song');

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    audioServiceTesting.resetCaches();
    const refreshed = await fetchAudioByYear(1942);

    expect(refreshed.bootstrap).toBeUndefined();
    expect(refreshed.source).toBe('loc-item-search');
    expect(refreshed.metadata.title).toBe('Refreshed 1942');
  });
});
