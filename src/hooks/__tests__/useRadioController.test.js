import { act, renderHook, waitFor } from '@testing-library/react';
import { useRadioController } from '../useRadioController';
import { __testing as offlineStoreTesting, saveYearSelection } from '../../services/offlineStore';
import { addFavorite, saveActiveFilters, saveSyncState } from '../../services/offlineStateService';

jest.mock('../../services/AudioService', () => ({
  fetchAvailableYears: jest.fn(),
  fetchAudioByYear: jest.fn(),
  fetchAudioById: jest.fn(),
  mergeCatalogYearEntry: jest.fn((entries = [], year, patch = {}) => [...entries, { year, ...patch }])
}));

const {
  fetchAvailableYears,
  fetchAudioByYear,
  fetchAudioById
} = jest.requireMock('../../services/AudioService');

const originalNavigatorOnLine = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');

function setNavigatorOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('useRadioController', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    jest.spyOn(window.history, 'replaceState');
    await offlineStoreTesting.resetOfflineStore();
    await saveActiveFilters({ yearRange: { start: null, end: null }, hasAudioOnly: false, favoritesOnly: false });
    await saveSyncState({ online: true, lastSuccessfulSync: null, pendingRefresh: false });
    setNavigatorOnline(true);
  });

  afterEach(() => {
    window.history.replaceState.mockRestore();
    if (originalNavigatorOnLine) {
      Object.defineProperty(window.navigator, 'onLine', originalNavigatorOnLine);
    }
  });

  it('exits loading and exposes a stable empty state when the catalog is empty', async () => {
    fetchAvailableYears.mockResolvedValue({
      years: [],
      entries: [],
      source: 'empty-test',
      generatedAt: '2026-03-18T00:00:00.000Z',
      error: null
    });

    const { result } = renderHook(() => useRadioController());

    await waitFor(() => expect(result.current.initComplete).toBe(true));

    expect(result.current.sessionStatus).toBe('empty');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toMatch(/No Library of Congress recordings/i);
  });

  it('centralizes item-level URL state updates through the parsed and serialized route state', async () => {
    fetchAvailableYears.mockResolvedValue({
      years: [1940],
      entries: [{ year: 1940, itemCount: 2, sampleItemIds: ['111', '222'], status: 'ready' }],
      source: 'catalog-test',
      generatedAt: '2026-03-18T00:00:00.000Z',
      error: null
    });
    fetchAudioByYear.mockResolvedValue({
      audioUrl: 'https://cdn.example/one.mp3',
      metadata: { title: 'First Item', date: '1940', uid: '111' },
      error: null,
      itemUids: ['111', '222'],
      itemRouteIds: ['loc-1940-first', 'loc-1940-second'],
      itemId: 'loc-1940-first'
    });
    fetchAudioById.mockResolvedValue({
      audioUrl: 'https://cdn.example/two.mp3',
      metadata: { title: 'Second Item', date: '1940', uid: '222' },
      error: null,
      itemId: 'loc-1940-second'
    });

    const { result } = renderHook(() => useRadioController());

    await waitFor(() => expect(result.current.initComplete).toBe(true));
    expect(window.history.replaceState).toHaveBeenLastCalledWith({}, '', '/?year=1940&itemId=loc-1940-first');

    await act(async () => {
      await result.current.playItemByIndex(1);
    });

    await waitFor(() => {
      expect(window.history.replaceState).toHaveBeenLastCalledWith({}, '', '/?year=1940&itemId=loc-1940-second');
    });

    await act(async () => {
      result.current.setIsOn(true);
    });

    await waitFor(() => {
      expect(window.history.replaceState).toHaveBeenLastCalledWith({}, '', '/?year=1940&itemId=loc-1940-second&autoplay=true');
    });
  });

  it('defers item-detail fetches until playback is turned on for the selected route item', async () => {
    fetchAvailableYears.mockResolvedValue({
      years: [1940],
      entries: [{ year: 1940, itemCount: 1, sampleItemIds: ['111'], status: 'ready' }],
      source: 'catalog-test',
      generatedAt: '2026-03-18T00:00:00.000Z',
      error: null
    });
    fetchAudioByYear.mockResolvedValue({
      audioUrl: null,
      metadata: { title: 'Deferred Item', date: '1940', uid: '111' },
      error: null,
      itemUids: ['111'],
      itemRouteIds: ['loc-1940-first'],
      itemId: 'loc-1940-first'
    });
    fetchAudioById.mockResolvedValue({
      audioUrl: 'https://cdn.example/one.mp3',
      metadata: { title: 'Deferred Item', date: '1940', uid: '111' },
      error: null,
      itemId: 'loc-1940-first'
    });

    const { result } = renderHook(() => useRadioController());

    await waitFor(() => expect(result.current.initComplete).toBe(true));

    expect(fetchAudioById).not.toHaveBeenCalled();

    await act(async () => {
      result.current.setIsOn(true);
    });

    await waitFor(() => {
      expect(fetchAudioById).toHaveBeenCalledWith('loc-1940-first');
    });
  });

  it('persists favorites by stable id without leaking them into shareable route state', async () => {
    fetchAvailableYears.mockResolvedValue({
      years: [1940],
      entries: [{ year: 1940, itemCount: 1, sampleItemIds: ['111'], status: 'ready' }],
      source: 'catalog-test',
      generatedAt: '2026-03-18T00:00:00.000Z',
      error: null
    });
    fetchAudioByYear.mockResolvedValue({
      audioUrl: 'https://cdn.example/one.mp3',
      metadata: { title: 'Favorite Item', date: '1940', uid: '111' },
      error: null,
      itemUids: ['111'],
      itemId: 'loc-1940-favorite'
    });

    const { result, unmount } = renderHook(() => useRadioController());

    await waitFor(() => expect(result.current.initComplete).toBe(true));

    await act(async () => {
      await result.current.toggleFavorite();
    });

    expect(result.current.isCurrentFavorite).toBe(true);
    expect(result.current.favoriteIds).toContain('111');
    expect(window.history.replaceState).toHaveBeenLastCalledWith({}, '', '/?year=1940&itemId=loc-1940-favorite');

    unmount();

    const { result: remountedResult } = renderHook(() => useRadioController());
    await waitFor(() => expect(remountedResult.current.initComplete).toBe(true));

    expect(remountedResult.current.favoriteIds).toContain('111');
    expect(remountedResult.current.favoritesById['111']).toMatchObject({
      id: '111',
      routeId: 'loc-1940-favorite',
      title: 'Favorite Item'
    });
  });

  it('boots with persisted offline sync state and local-only filters available to the UI boundary', async () => {
    await addFavorite({ id: '111', routeId: 'loc-1940-first', title: 'First Item', year: 1940 });
    await saveYearSelection(
      1940,
      null,
      {
        audioUrl: 'https://cdn.example/one.mp3',
        metadata: { title: 'Offline First', date: '1940', uid: '111' },
        error: null,
        itemUids: ['111']
      },
      {
        id: '111',
        routeId: 'loc-1940-first',
        uid: '111',
        audioUrl: 'https://cdn.example/one.mp3',
        metadata: { title: 'Offline First', date: '1940', uid: '111' },
      },
      {
        ttl: 7 * 24 * 60 * 60 * 1000,
        freshness: { fetchedAt: Date.now(), expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) }
      }
    );
    await saveActiveFilters({
      yearRange: { start: 1939, end: 1941 },
      hasAudioOnly: true,
      favoritesOnly: true,
    });
    await saveSyncState({
      online: false,
      lastSuccessfulSync: Date.parse('2026-03-18T00:00:00.000Z'),
      pendingRefresh: true,
    });
    setNavigatorOnline(false);

    fetchAvailableYears.mockResolvedValue({
      years: [1940],
      entries: [{ year: 1940, itemCount: 1, sampleItemIds: ['111'], status: 'ready' }],
      source: 'offline-cache',
      generatedAt: '2026-03-18T00:00:00.000Z',
      error: null
    });
    fetchAudioByYear.mockResolvedValue({
      audioUrl: 'https://cdn.example/one.mp3',
      metadata: { title: 'Offline First', date: '1940', uid: '111' },
      error: null,
      itemUids: ['111'],
      itemId: 'loc-1940-first',
      stale: true,
    });

    const { result } = renderHook(() => useRadioController());

    await waitFor(() => expect(result.current.initComplete).toBe(true));

    expect(result.current.syncState).toMatchObject({
      online: false,
      pendingRefresh: true,
    });
    expect(result.current.filters).toMatchObject({
      yearRange: { start: 1939, end: 1941 },
      hasAudioOnly: true,
      favoritesOnly: true,
    });
    expect(result.current.favoriteIds).toContain('111');
    expect(result.current.filteredAvailableYears).toEqual([1940]);
  });
});
