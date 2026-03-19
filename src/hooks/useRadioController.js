import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  fetchAvailableYears,
  fetchAudioByYear,
  fetchRecordingById,
  isDirectAudioUrl,
  resolvePlaybackForDirectUrl,
  mergeCatalogYearEntry,
  CURRENT_DATASET_VERSION,
} from '../services/AudioService';
import {
  addFavorite,
  DEFAULT_FILTERS,
  DEFAULT_SYNC_STATE,
  deriveFilteredCatalogEntries,
  deriveFilteredItemUids,
  getOfflineStateSnapshot,
  recordSuccessfulSync,
  removeFavorite,
  saveActiveFilters,
  setOnlineStatus,
  setPendingRefresh,
  touchLastPlayed,
} from '../services/offlineStateService';
import { getCachedLibrarySnapshot } from '../services/offlineStore';
import { parseRadioUrlState, serializeRadioUrlState } from '../utils/radioUrlState';

const initialState = {
  year: 1940,
  playback: null,
  volume: 0.5,
  isOn: false,
  metadata: null,
  availableYears: [],
  catalogEntries: [],
  catalogSource: null,
  catalogGeneratedAt: null,
  itemUids: [],
  itemRouteIds: [],
  itemIndex: 0,
  currentItemId: null,
  sessionStatus: 'booting',
  error: null,
};

const initialOfflineState = {
  favorites: [],
  favoriteIds: [],
  favoritesById: {},
  filters: DEFAULT_FILTERS,
  sync: DEFAULT_SYNC_STATE,
  freshnessByEntity: {},
};

const initialOfflineLibrary = {
  catalogEntries: [],
  items: [],
  yearSelections: [],
};

function radioReducer(state, action) {
  switch (action.type) {
    case 'SET_YEAR':
      return { ...state, year: action.payload };
    case 'SET_PLAYBACK':
      return { ...state, playback: action.payload };
    case 'SET_VOLUME':
      return { ...state, volume: action.payload };
    case 'SET_IS_ON':
      return { ...state, isOn: action.payload };
    case 'SET_METADATA':
      return { ...state, metadata: action.payload };
    case 'SET_AVAILABLE_YEARS':
      return {
        ...state,
        availableYears: typeof action.payload === 'function'
          ? action.payload(state.availableYears)
          : action.payload
      };
    case 'SET_CATALOG': {
      const nextCatalog = typeof action.payload === 'function'
        ? action.payload({
          entries: state.catalogEntries,
          source: state.catalogSource,
          generatedAt: state.catalogGeneratedAt
        })
        : action.payload;
      return {
        ...state,
        catalogEntries: nextCatalog?.entries || [],
        catalogSource: nextCatalog?.source || null,
        catalogGeneratedAt: nextCatalog?.generatedAt || null
      };
    }
    case 'SET_ITEM_UIDS':
      return { ...state, itemUids: action.payload };
    case 'SET_ITEM_ROUTE_IDS':
      return { ...state, itemRouteIds: action.payload };
    case 'SET_ITEM_INDEX':
      return { ...state, itemIndex: action.payload };
    case 'SET_CURRENT_ITEM_ID':
      return { ...state, currentItemId: action.payload };
    case 'SET_SESSION_STATUS':
      return { ...state, sessionStatus: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'APPLY_AUDIO_RESULT': {
      const { playback, metadata, error, itemUids, itemRouteIds, itemIndex, itemId, sessionStatus } = action.payload;
      return {
        ...state,
        playback,
        metadata,
        error,
        itemUids: itemUids ?? state.itemUids,
        itemRouteIds: itemRouteIds ?? state.itemRouteIds,
        itemIndex: itemIndex ?? state.itemIndex,
        currentItemId: itemId ?? state.currentItemId,
        sessionStatus,
      };
    }
    default:
      return state;
  }
}

function parseInitialParams() {
  return parseRadioUrlState(window.location.search);
}

function buildEmptyMessage(error) {
  return error || 'No Library of Congress recordings are currently available.';
}

function getStableItemId(itemId, metadata) {
  return metadata?.uid || itemId || null;
}

function getFavoriteRecord(itemId, metadata, fallbackYear) {
  const stableId = getStableItemId(itemId, metadata);
  if (!stableId) return null;

  const parsedYear = Number.parseInt(metadata?.date || fallbackYear, 10);
  return {
    id: stableId,
    uid: metadata?.uid || stableId,
    routeId: itemId || null,
    title: metadata?.title || null,
    year: Number.isNaN(parsedYear) ? null : parsedYear,
  };
}

function buildItemRecordIndex(items = []) {
  return items.reduce((acc, itemRecord) => {
    const candidates = [itemRecord?.id, itemRecord?.uid, itemRecord?.routeId].filter(Boolean);
    candidates.forEach((candidate) => {
      acc[candidate] = itemRecord;
    });
    return acc;
  }, {});
}

export function useRadioController() {
  const [state, dispatch] = useReducer(radioReducer, initialState);
  const [initialParams] = useState(parseInitialParams);
  const [overrideAudio, setOverrideAudio] = useState(false);
  const [selectionRouteState, setSelectionRouteState] = useState({
    source: initialParams.source,
    uid: initialParams.uid,
    audioUrl: initialParams.audioUrl
  });
  const [initComplete, setInitComplete] = useState(false);
  const [offlineState, setOfflineState] = useState(initialOfflineState);
  const [offlineLibrary, setOfflineLibrary] = useState(initialOfflineLibrary);
  const screenRef = useRef(null);
  const selectionRequestRef = useRef(0);
  const yearsRequestRef = useRef(0);
  const initHandledRef = useRef(false);
  const skipNextYearLoadRef = useRef(false);

  const {
    year,
    playback,
    volume,
    isOn,
    metadata,
    availableYears,
    catalogEntries,
    catalogSource,
    catalogGeneratedAt,
    itemUids,
    itemRouteIds,
    itemIndex,
    currentItemId,
    sessionStatus,
    error
  } = state;

  const refreshOfflineState = useCallback(async () => {
    const snapshot = await getOfflineStateSnapshot();
    setOfflineState(snapshot);
    return snapshot;
  }, []);

  const refreshOfflineLibrary = useCallback(async () => {
    const snapshot = await getCachedLibrarySnapshot({ datasetVersion: CURRENT_DATASET_VERSION });
    setOfflineLibrary(snapshot);
    return snapshot;
  }, []);

  const setYearValue = useCallback(
    (nextYear) => {
      setOverrideAudio(false);
      dispatch({ type: 'SET_YEAR', payload: nextYear });
    },
    []
  );
  const setPlayback = useCallback((nextPlayback) => dispatch({ type: 'SET_PLAYBACK', payload: nextPlayback }), []);
  const setVolume = useCallback((nextVolume) => dispatch({ type: 'SET_VOLUME', payload: nextVolume }), []);
  const setIsOn = useCallback((nextIsOn) => dispatch({ type: 'SET_IS_ON', payload: nextIsOn }), []);
  const setMetadata = useCallback((nextMetadata) => dispatch({ type: 'SET_METADATA', payload: nextMetadata }), []);
  const setAvailableYears = useCallback((yearsOrUpdater) => dispatch({ type: 'SET_AVAILABLE_YEARS', payload: yearsOrUpdater }), []);
  const setCatalog = useCallback((payload) => dispatch({ type: 'SET_CATALOG', payload }), []);
  const setItemUids = useCallback((uids) => dispatch({ type: 'SET_ITEM_UIDS', payload: uids }), []);
  const setItemRouteIds = useCallback((routeIds) => dispatch({ type: 'SET_ITEM_ROUTE_IDS', payload: routeIds }), []);
  const setItemIndex = useCallback((index) => dispatch({ type: 'SET_ITEM_INDEX', payload: index }), []);
  const setSessionStatus = useCallback((nextStatus) => dispatch({ type: 'SET_SESSION_STATUS', payload: nextStatus }), []);
  const setError = useCallback((nextError) => dispatch({ type: 'SET_ERROR', payload: nextError }), []);

  const syncStateForResult = useCallback(async (result) => {
    if (result?.stale || result?.error) {
      await setPendingRefresh(true);
    } else {
      await recordSuccessfulSync(Date.now(), CURRENT_DATASET_VERSION);
    }
    await refreshOfflineState();
  }, [refreshOfflineState]);

  const applyAudioResult = useCallback(async (result, updates = {}) => {
    dispatch({
        type: 'APPLY_AUDIO_RESULT',
        payload: {
        playback: result.playback,
        metadata: result.metadata,
        error: result.error,
        itemUids: updates.itemUids,
        itemRouteIds: updates.itemRouteIds,
        itemIndex: updates.itemIndex,
        itemId: updates.itemId ?? result.itemId ?? result.metadata?.uid ?? null,
        sessionStatus: result.error ? 'error' : 'ready'
      }
    });

    const stableItemId = getStableItemId(updates.itemId ?? result.itemId ?? null, result.metadata);
    if (stableItemId) {
      await touchLastPlayed(`uid:${stableItemId}`);
      await refreshOfflineState();
    }
    await refreshOfflineLibrary();
  }, [refreshOfflineLibrary, refreshOfflineState]);

  const withLatestSelection = useCallback(async (status, fetcher, onSuccess) => {
    const requestId = ++selectionRequestRef.current;
    setSessionStatus(status);
    setError(null);

    const result = await fetcher();
    if (requestId !== selectionRequestRef.current) {
      return null;
    }

    await onSuccess(result);
    await syncStateForResult(result);
    return result;
  }, [setError, setSessionStatus, syncStateForResult]);

  const prefetchAdjacentYears = useCallback((targetYear, years) => {
    const currentIndex = years.indexOf(targetYear);
    const nextYear = years[currentIndex + 1];
    const prevYear = years[currentIndex - 1];

    if (nextYear) {
      fetchAudioByYear(nextYear);
    }
    if (prevYear) {
      fetchAudioByYear(prevYear);
    }
  }, []);

  const loadYearAudio = useCallback(async (targetYear, itemId = null) => (
    withLatestSelection('loadingYear', () => fetchAudioByYear(targetYear, itemId, { deferAudio: true }), async (result) => {
      setSelectionRouteState({ source: null, uid: null, audioUrl: null });
      const selectedItemId = result.itemId || itemId || result.metadata?.uid || null;
      const itemIndexByRoute = selectedItemId ? result.itemRouteIds?.indexOf(selectedItemId) : -1;
      const itemIndexByUid = selectedItemId ? result.itemUids?.indexOf(selectedItemId) : -1;
      const resolvedItemIndex = itemIndexByRoute >= 0 ? itemIndexByRoute : itemIndexByUid;

      await applyAudioResult(result, {
        itemUids: result.itemUids || [],
        itemRouteIds: result.itemRouteIds || [],
        itemIndex: resolvedItemIndex >= 0 ? resolvedItemIndex : 0,
        itemId: selectedItemId
      });
      prefetchAdjacentYears(targetYear, availableYears);
    })
  ), [applyAudioResult, availableYears, prefetchAdjacentYears, withLatestSelection]);

  const loadAudioById = useCallback(async (audioId, targetYear, updates = {}) => {
    const nextRouteState = updates.routeState || { source: null, uid: null, audioUrl: null };
    const fetcher = isDirectAudioUrl(audioId)
      ? () => resolvePlaybackForDirectUrl(audioId)
      : () => fetchRecordingById(audioId);

    return withLatestSelection('loadingItem', fetcher, async (result) => {
      setSelectionRouteState(nextRouteState);
      await applyAudioResult(result, {
        itemUids: updates.itemUids,
        itemRouteIds: updates.itemRouteIds,
        itemIndex: updates.itemIndex,
        itemId: updates.itemId ?? result.itemId ?? audioId
      });
      if (targetYear != null) {
        dispatch({ type: 'SET_YEAR', payload: targetYear });
      }
    });
  }, [applyAudioResult, withLatestSelection]);

  const playItemByIndex = useCallback(async (idx) => {
    if (idx < 0 || idx >= itemUids.length) {
      return;
    }

    const targetItemId = itemRouteIds[idx] || itemUids[idx];
    const selectionUpdates = {
      itemUids: [...itemUids],
      itemRouteIds: [...itemRouteIds],
      itemIndex: idx,
      itemId: targetItemId
    };

    setOverrideAudio(true);
    setSelectionRouteState({ source: null, uid: null, audioUrl: null });

    if (!isOn) {
      dispatch({ type: 'SET_PLAYBACK', payload: null });
      dispatch({ type: 'SET_METADATA', payload: null });
      dispatch({ type: 'SET_ERROR', payload: null });
      dispatch({ type: 'SET_ITEM_INDEX', payload: idx });
      dispatch({ type: 'SET_CURRENT_ITEM_ID', payload: targetItemId });
      dispatch({ type: 'SET_SESSION_STATUS', payload: 'ready' });
      return;
    }

    await loadAudioById(targetItemId, year, selectionUpdates);
  }, [isOn, itemRouteIds, itemUids, loadAudioById, year]);

  const nextItem = useCallback(() => {
    if (itemIndex < itemUids.length - 1) {
      playItemByIndex(itemIndex + 1);
    }
  }, [itemIndex, itemUids.length, playItemByIndex]);

  const prevItem = useCallback(() => {
    if (itemIndex > 0) {
      playItemByIndex(itemIndex - 1);
    }
  }, [itemIndex, playItemByIndex]);

  const updateFilters = useCallback(async (nextFilters) => {
    const merged = {
      ...offlineState.filters,
      ...nextFilters,
      yearRange: {
        ...offlineState.filters.yearRange,
        ...nextFilters?.yearRange,
      },
    };
    const savedFilters = await saveActiveFilters(merged);
    setOfflineState((prev) => ({
      ...prev,
      filters: savedFilters,
    }));
    return savedFilters;
  }, [offlineState.filters]);

  const resetFilters = useCallback(async () => {
    const savedFilters = await saveActiveFilters(DEFAULT_FILTERS);
    setOfflineState((prev) => ({
      ...prev,
      filters: savedFilters,
    }));
    return savedFilters;
  }, []);

  const toggleFavorite = useCallback(async (favoriteRecord = null) => {
    const nextRecord = favoriteRecord || getFavoriteRecord(currentItemId, metadata, year);
    if (!nextRecord?.id) {
      return false;
    }

    const isCurrentlyFavorite = Boolean(offlineState.favoritesById[nextRecord.id]);
    if (isCurrentlyFavorite) {
      await removeFavorite(nextRecord.id);
    } else {
      await addFavorite(nextRecord);
    }

    await refreshOfflineState();
    return !isCurrentlyFavorite;
  }, [currentItemId, metadata, offlineState.favoritesById, refreshOfflineState, year]);

  useEffect(() => {
    refreshOfflineState();
    refreshOfflineLibrary();
  }, [refreshOfflineLibrary, refreshOfflineState]);

  useEffect(() => {
    const savedVolume = localStorage.getItem('clientVolume');
    if (savedVolume) {
      setVolume(Number.parseFloat(savedVolume));
    }
  }, [setVolume]);

  useEffect(() => {
    async function syncNavigatorStatus() {
      await setOnlineStatus(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
      await refreshOfflineState();
    }

    syncNavigatorStatus();

    const handleOnline = async () => {
      await setOnlineStatus(true);
      await refreshOfflineState();
    };

    const handleOffline = async () => {
      await setOnlineStatus(false);
      await setPendingRefresh(true);
      await refreshOfflineState();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshOfflineState]);

  useEffect(() => {
    const requestId = ++yearsRequestRef.current;

    async function loadYears() {
      const {
        years,
        entries = [],
        source = null,
        generatedAt = null,
        error: yearsError
      } = await fetchAvailableYears();
      if (requestId !== yearsRequestRef.current) {
        return;
      }

      setCatalog({ entries, source, generatedAt });
      await refreshOfflineLibrary();

      if (yearsError) {
        setError(yearsError);
        await setPendingRefresh(true);
        await refreshOfflineState();
      } else {
        await recordSuccessfulSync(Date.now(), CURRENT_DATASET_VERSION);
        await refreshOfflineState();
      }

      if (years?.length) {
        setAvailableYears(years);
        return;
      }

      setError(buildEmptyMessage(yearsError));
      dispatch({ type: 'SET_YEAR', payload: null });
      dispatch({ type: 'SET_CURRENT_ITEM_ID', payload: null });
      setSessionStatus(yearsError ? 'error' : 'empty');
      setInitComplete(true);
      initHandledRef.current = true;
    }

    loadYears();
  }, [refreshOfflineLibrary, refreshOfflineState, setAvailableYears, setCatalog, setError, setSessionStatus]);

  useEffect(() => {
    if (availableYears.length === 0 || initHandledRef.current) {
      return;
    }

    initHandledRef.current = true;

    async function initialize() {
      let initYear = initialParams.year;
      if (initYear != null && !availableYears.includes(initYear)) {
        setAvailableYears((prev) => [...prev, initYear].sort((a, b) => a - b));
        setCatalog((prev) => ({
          entries: mergeCatalogYearEntry(prev?.entries, initYear, { itemCount: null, status: 'manifest' }),
          source: prev?.source || null,
          generatedAt: prev?.generatedAt || null
        }));
      }

      if (initYear == null) {
        initYear = availableYears[0];
      }

      if (initialParams.itemId || initialParams.uid || initialParams.audioUrl) {
        if (initialParams.source === 'uid' && initialParams.uid) {
          setOverrideAudio(true);
          const result = await loadAudioById(initialParams.uid, initYear);

          if (result?.metadata?.date) {
            const metadataYear = Number.parseInt(result.metadata.date, 10);
            if (Number.isFinite(metadataYear)) {
              if (!availableYears.includes(metadataYear)) {
                setAvailableYears((prev) => [...prev, metadataYear].sort((a, b) => a - b));
                setCatalog((prev) => ({
                  entries: mergeCatalogYearEntry(prev?.entries, metadataYear, { itemCount: null, status: 'manifest' }),
                  source: prev?.source || null,
                  generatedAt: prev?.generatedAt || null
                }));
              }
              dispatch({ type: 'SET_YEAR', payload: metadataYear });
            }
          } else {
            dispatch({ type: 'SET_YEAR', payload: initYear });
          }
        } else if (initialParams.source === 'audio-url' && initialParams.audioUrl) {
          setOverrideAudio(true);
          const result = await loadAudioById(initialParams.audioUrl, initYear, {
            routeState: { source: 'audio-url', uid: null, audioUrl: initialParams.audioUrl }
          });

          if (result?.metadata?.date) {
            const metadataYear = Number.parseInt(result.metadata.date, 10);
            if (Number.isFinite(metadataYear)) {
              if (!availableYears.includes(metadataYear)) {
                setAvailableYears((prev) => [...prev, metadataYear].sort((a, b) => a - b));
                setCatalog((prev) => ({
                  entries: mergeCatalogYearEntry(prev?.entries, metadataYear, { itemCount: null, status: 'manifest' }),
                  source: prev?.source || null,
                  generatedAt: prev?.generatedAt || null
                }));
              }
              dispatch({ type: 'SET_YEAR', payload: metadataYear });
            }
          } else {
            dispatch({ type: 'SET_YEAR', payload: initYear });
          }
        } else if (initialParams.itemId) {
          setSelectionRouteState({ source: null, uid: null, audioUrl: null });
          dispatch({ type: 'SET_YEAR', payload: initYear });
          skipNextYearLoadRef.current = true;
          await loadYearAudio(initYear, initialParams.itemId);
        } else {
          dispatch({ type: 'SET_YEAR', payload: initYear });
          skipNextYearLoadRef.current = true;
          await loadYearAudio(initYear);
        }
      } else {
        dispatch({ type: 'SET_YEAR', payload: initYear });
        skipNextYearLoadRef.current = true;
        await loadYearAudio(initYear);
      }

      if (initialParams.autoplay) {
        setIsOn(true);
      }
      setInitComplete(true);
    }

    initialize();
  }, [
    availableYears,
    initialParams,
    loadAudioById,
    loadYearAudio,
    setAvailableYears,
    setCatalog,
    setIsOn
  ]);

  useEffect(() => {
    if (!initComplete || overrideAudio || sessionStatus === 'empty') {
      return;
    }

    if (skipNextYearLoadRef.current) {
      skipNextYearLoadRef.current = false;
      return;
    }

    loadYearAudio(year);
  }, [year, initComplete, loadYearAudio, overrideAudio]);


  useEffect(() => {
    if (!initComplete || !isOn || !currentItemId || playback?.primaryUrl || error || sessionStatus === 'loadingItem' || sessionStatus === 'booting') {
      return;
    }

    loadAudioById(currentItemId, year, {
      itemUids,
      itemRouteIds,
      itemIndex,
      itemId: currentItemId,
      routeState: selectionRouteState
    });
  }, [currentItemId, error, initComplete, isOn, itemIndex, itemRouteIds, itemUids, loadAudioById, playback?.primaryUrl, selectionRouteState, sessionStatus, year]);

  useEffect(() => {
    if (!initComplete) {
      return;
    }

    const nextUrl = serializeRadioUrlState({
      year,
      autoplay: isOn,
      itemId: selectionRouteState.source === 'audio-url' ? null : (currentItemId || null),
      source: selectionRouteState.source,
      uid: selectionRouteState.uid,
      audioUrl: selectionRouteState.audioUrl
    });

    window.history.replaceState({}, '', nextUrl);
  }, [currentItemId, initComplete, isOn, selectionRouteState, year]);

  const currentStableItemId = useMemo(
    () => getStableItemId(currentItemId, metadata),
    [currentItemId, metadata]
  );

  const isCurrentFavorite = useMemo(
    () => Boolean(currentStableItemId && offlineState.favoritesById[currentStableItemId]),
    [currentStableItemId, offlineState.favoritesById]
  );

  const itemRecordsById = useMemo(
    () => buildItemRecordIndex(offlineLibrary.items),
    [offlineLibrary.items]
  );

  const filteredCatalogEntries = useMemo(
    () => deriveFilteredCatalogEntries(catalogEntries, {
      filters: offlineState.filters,
      favoritesById: offlineState.favoritesById,
      itemRecords: offlineLibrary.items,
      yearSelections: offlineLibrary.yearSelections,
    }),
    [catalogEntries, offlineLibrary.items, offlineLibrary.yearSelections, offlineState.favoritesById, offlineState.filters]
  );

  const filteredAvailableYears = useMemo(
    () => filteredCatalogEntries
      .filter((entry) => entry.itemCount !== 0)
      .map((entry) => entry.year),
    [filteredCatalogEntries]
  );

  const filteredItemUids = useMemo(
    () => deriveFilteredItemUids(itemUids, {
      filters: offlineState.filters,
      favoritesById: offlineState.favoritesById,
      itemRecordsById,
    }),
    [itemRecordsById, itemUids, offlineState.favoritesById, offlineState.filters]
  );

  const controller = useMemo(() => ({
    year,
    setYear: setYearValue,
    playback,
    setPlayback,
    volume,
    setVolume,
    isOn,
    setIsOn,
    metadata,
    setMetadata,
    availableYears,
    filteredAvailableYears,
    setAvailableYears,
    catalogEntries,
    filteredCatalogEntries,
    catalogSource,
    catalogGeneratedAt,
    itemUids,
    itemRouteIds,
    filteredItemUids,
    setItemUids,
    setItemRouteIds,
    itemIndex,
    setItemIndex,
    currentItemId,
    currentStableItemId,
    nextItem,
    prevItem,
    playItemByIndex,
    error,
    setError,
    sessionStatus,
    setSessionStatus,
    isLoading: sessionStatus === 'booting' || sessionStatus === 'loadingYear' || sessionStatus === 'loadingItem',
    initComplete,
    overrideAudio,
    screenRef,
    offlineState,
    offlineLibrary,
    favorites: offlineState.favorites,
    favoriteIds: offlineState.favoriteIds,
    favoritesById: offlineState.favoritesById,
    filters: offlineState.filters,
    syncState: offlineState.sync,
    freshnessByEntity: offlineState.freshnessByEntity,
    isCurrentFavorite,
    toggleFavorite,
    setFilters: updateFilters,
    resetFilters,
    refreshOfflineState,
  }), [
    availableYears,
    catalogEntries,
    catalogGeneratedAt,
    catalogSource,
    currentItemId,
    currentStableItemId,
    error,
    filteredAvailableYears,
    filteredCatalogEntries,
    filteredItemUids,
    initComplete,
    isCurrentFavorite,
    isOn,
    itemIndex,
    itemUids,
    itemRouteIds,
    metadata,
    nextItem,
    offlineLibrary,
    offlineState,
    overrideAudio,
    playItemByIndex,
    playback,
    prevItem,
    refreshOfflineState,
    resetFilters,
    screenRef,
    sessionStatus,
    setPlayback,
    setAvailableYears,
    setError,
    setIsOn,
    setItemIndex,
    setItemUids,
    setItemRouteIds,
    setMetadata,
    setSessionStatus,
    setVolume,
    setYearValue,
    toggleFavorite,
    updateFilters,
    volume,
    year,
  ]);

  return controller;
}
