import {
  clearVersionedRecords,
  getCachedLibrarySnapshot,
  getCatalogSnapshot,
  getYearSelection,
  saveCatalogSnapshot,
  saveYearSelection,
  __testing as offlineStoreTesting,
} from '../offlineStore';
import {
  getOfflineStateSnapshot,
  recordSuccessfulSync,
  saveEntityFreshness,
  __testing as offlineStateTesting,
} from '../offlineStateService';

const TTL = 60 * 60 * 1000;

function createFreshness(datasetVersion, fetchedAt = Date.now()) {
  return {
    fetchedAt,
    expiresAt: fetchedAt + TTL,
    datasetVersion,
  };
}

function createPlayback(url, mimeType = 'audio/mpeg') {
  return {
    primaryUrl: url,
    mimeType,
    streams: [{ url, mimeType }],
  };
}

describe('offline versioned persistence', () => {
  beforeEach(async () => {
    await offlineStoreTesting.resetOfflineStore();
  });

  it('reuses only records that match the requested dataset version', async () => {
    await saveCatalogSnapshot({
      entries: [{ year: 1980, itemCount: 1, sampleItemIds: ['900'], status: 'ready' }],
      source: 'test-catalog',
      generatedAt: '2026-03-19T00:00:00.000Z',
      freshness: createFreshness('manifest-v1'),
      datasetVersion: 'manifest-v1',
    });

    await saveYearSelection(
      1980,
      null,
      {
        playback: createPlayback('https://cdn.example/audio.mp3'),
        metadata: { title: 'Dataset V1 Item', date: '1980', uid: '900' },
        error: null,
        itemUids: ['900'],
        itemRouteIds: ['item-900'],
      },
      {
        id: '900',
        routeId: 'item-900',
        uid: '900',
        playback: createPlayback('https://cdn.example/audio.mp3'),
        metadata: { title: 'Dataset V1 Item', date: '1980', uid: '900' },
      },
      {
        ttl: TTL,
        freshness: createFreshness('manifest-v1'),
        datasetVersion: 'manifest-v1',
      }
    );

    const matchingCatalog = await getCatalogSnapshot({ ttl: TTL, datasetVersion: 'manifest-v1' });
    const mismatchedCatalog = await getCatalogSnapshot({ ttl: TTL, datasetVersion: 'manifest-v2' });
    const matchingYear = await getYearSelection(1980, null, { ttl: TTL, datasetVersion: 'manifest-v1' });
    const mismatchedYear = await getYearSelection(1980, null, { ttl: TTL, datasetVersion: 'manifest-v2' });

    expect(matchingCatalog?.entries).toHaveLength(1);
    expect(matchingCatalog?.datasetVersion).toBe('manifest-v1');
    expect(mismatchedCatalog).toBeNull();
    expect(matchingYear?.metadata?.title).toBe('Dataset V1 Item');
    expect(matchingYear?.playback?.primaryUrl).toBe('https://cdn.example/audio.mp3');
    expect(matchingYear?.freshness?.datasetVersion).toBe('manifest-v1');
    expect(mismatchedYear).toBeNull();
  });

  it('clears stale versioned records deterministically when a new dataset version is applied', async () => {
    await saveYearSelection(
      1980,
      null,
      {
        playback: createPlayback('https://cdn.example/audio.mp3'),
        metadata: { title: 'Old Item', date: '1980', uid: '900' },
        error: null,
        itemUids: ['900'],
      },
      {
        id: '900',
        routeId: 'item-900',
        uid: '900',
        playback: createPlayback('https://cdn.example/audio.mp3'),
        metadata: { title: 'Old Item', date: '1980', uid: '900' },
      },
      {
        ttl: TTL,
        freshness: createFreshness('manifest-v1'),
        datasetVersion: 'manifest-v1',
      }
    );

    await saveCatalogSnapshot({
      entries: [{ year: 1981, itemCount: 1, sampleItemIds: ['901'], status: 'ready' }],
      source: 'test-catalog',
      generatedAt: '2026-03-20T00:00:00.000Z',
      freshness: createFreshness('manifest-v2'),
      datasetVersion: 'manifest-v2',
    });

    const oldSnapshot = await getCachedLibrarySnapshot({ datasetVersion: 'manifest-v1' });
    const newSnapshot = await getCachedLibrarySnapshot({ datasetVersion: 'manifest-v2' });

    expect(oldSnapshot.catalogEntries).toEqual([]);
    expect(oldSnapshot.items).toEqual([]);
    expect(oldSnapshot.yearSelections).toEqual([]);
    expect(newSnapshot.catalogEntries.map((entry) => entry.year)).toEqual([1981]);
  });

  it('can explicitly clear all versioned records for the active dataset refresh flow', async () => {
    await saveCatalogSnapshot({
      entries: [{ year: 1980, itemCount: 1, sampleItemIds: ['900'], status: 'ready' }],
      freshness: createFreshness('manifest-v1'),
      datasetVersion: 'manifest-v1',
    });

    await clearVersionedRecords();

    const snapshot = await getCachedLibrarySnapshot();
    expect(snapshot.catalogEntries).toEqual([]);
    expect(snapshot.items).toEqual([]);
    expect(snapshot.yearSelections).toEqual([]);
  });
});

describe('offline state dataset version bookkeeping', () => {
  beforeEach(async () => {
    await offlineStoreTesting.resetOfflineStore();
  });

  it('records dataset version metadata alongside successful syncs and entity freshness', async () => {
    expect(offlineStateTesting.normalizeDatasetVersion('  manifest-v3  ')).toBe('manifest-v3');

    await saveEntityFreshness('catalog', createFreshness('manifest-v3'));
    await recordSuccessfulSync(Date.parse('2026-03-21T00:00:00.000Z'), 'manifest-v3');

    const snapshot = await getOfflineStateSnapshot();

    expect(snapshot.sync.lastSuccessfulSync).toBe(Date.parse('2026-03-21T00:00:00.000Z'));
    expect(snapshot.sync.datasetVersion).toBe('manifest-v3');
    expect(snapshot.datasetVersion).toMatchObject({
      version: 'manifest-v3',
      lastSuccessfulSync: Date.parse('2026-03-21T00:00:00.000Z'),
    });
    expect(snapshot.freshnessByEntity.catalog).toMatchObject({
      datasetVersion: 'manifest-v3',
    });
  });
});
