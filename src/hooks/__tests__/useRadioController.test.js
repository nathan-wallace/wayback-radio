import { act, renderHook, waitFor } from '@testing-library/react';
import { useRadioController } from '../useRadioController';

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

describe('useRadioController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    jest.spyOn(window.history, 'replaceState');
  });

  afterEach(() => {
    window.history.replaceState.mockRestore();
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
      metadata: { title: 'First Item', date: '1940' },
      error: null,
      itemUids: ['111', '222'],
      itemId: 'loc-1940-first'
    });
    fetchAudioById.mockResolvedValue({
      audioUrl: 'https://cdn.example/two.mp3',
      metadata: { title: 'Second Item', date: '1940' },
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
});
