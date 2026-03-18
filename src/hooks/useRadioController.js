import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  fetchAvailableYears,
  fetchAudioByYear,
  fetchAudioById,
  mergeCatalogYearEntry
} from '../services/AudioService';
import { parseRadioUrlState, serializeRadioUrlState } from '../utils/radioUrlState';

const initialState = {
  year: 1940,
  audioUrl: null,
  volume: 0.5,
  isOn: false,
  metadata: null,
  availableYears: [],
  catalogEntries: [],
  catalogSource: null,
  catalogGeneratedAt: null,
  itemUids: [],
  itemIndex: 0,
  currentItemId: null,
  sessionStatus: 'booting',
  error: null,
};

function radioReducer(state, action) {
  switch (action.type) {
    case 'SET_YEAR':
      return { ...state, year: action.payload };
    case 'SET_AUDIO_URL':
      return { ...state, audioUrl: action.payload };
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
    case 'SET_ITEM_INDEX':
      return { ...state, itemIndex: action.payload };
    case 'SET_CURRENT_ITEM_ID':
      return { ...state, currentItemId: action.payload };
    case 'SET_SESSION_STATUS':
      return { ...state, sessionStatus: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'APPLY_AUDIO_RESULT': {
      const { audioUrl, metadata, error, itemUids, itemIndex, itemId, sessionStatus } = action.payload;
      return {
        ...state,
        audioUrl,
        metadata,
        error,
        itemUids: itemUids ?? state.itemUids,
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

export function useRadioController() {
  const [state, dispatch] = useReducer(radioReducer, initialState);
  const [initialParams] = useState(parseInitialParams);
  const [overrideAudio, setOverrideAudio] = useState(false);
  const [initComplete, setInitComplete] = useState(false);
  const screenRef = useRef(null);
  const selectionRequestRef = useRef(0);
  const yearsRequestRef = useRef(0);
  const initHandledRef = useRef(false);
  const skipNextYearLoadRef = useRef(false);

  const {
    year,
    audioUrl,
    volume,
    isOn,
    metadata,
    availableYears,
    catalogEntries,
    catalogSource,
    catalogGeneratedAt,
    itemUids,
    itemIndex,
    currentItemId,
    sessionStatus,
    error
  } = state;

  const setYearValue = useCallback(
    (nextYear) => {
      setOverrideAudio(false);
      dispatch({ type: 'SET_YEAR', payload: nextYear });
    },
    []
  );
  const setAudioUrl = useCallback((nextAudioUrl) => dispatch({ type: 'SET_AUDIO_URL', payload: nextAudioUrl }), []);
  const setVolume = useCallback((nextVolume) => dispatch({ type: 'SET_VOLUME', payload: nextVolume }), []);
  const setIsOn = useCallback((nextIsOn) => dispatch({ type: 'SET_IS_ON', payload: nextIsOn }), []);
  const setMetadata = useCallback((nextMetadata) => dispatch({ type: 'SET_METADATA', payload: nextMetadata }), []);
  const setAvailableYears = useCallback((yearsOrUpdater) => dispatch({ type: 'SET_AVAILABLE_YEARS', payload: yearsOrUpdater }), []);
  const setCatalog = useCallback((payload) => dispatch({ type: 'SET_CATALOG', payload }), []);
  const setItemUids = useCallback((uids) => dispatch({ type: 'SET_ITEM_UIDS', payload: uids }), []);
  const setItemIndex = useCallback((index) => dispatch({ type: 'SET_ITEM_INDEX', payload: index }), []);
  const setSessionStatus = useCallback((nextStatus) => dispatch({ type: 'SET_SESSION_STATUS', payload: nextStatus }), []);
  const setError = useCallback((nextError) => dispatch({ type: 'SET_ERROR', payload: nextError }), []);

  const applyAudioResult = useCallback((result, updates = {}) => {
    dispatch({
      type: 'APPLY_AUDIO_RESULT',
      payload: {
        audioUrl: result.audioUrl,
        metadata: result.metadata,
        error: result.error,
        itemUids: updates.itemUids,
        itemIndex: updates.itemIndex,
        itemId: updates.itemId ?? result.itemId ?? result.metadata?.uid ?? null,
        sessionStatus: result.error ? 'error' : 'ready'
      }
    });
  }, []);

  const withLatestSelection = useCallback(async (status, fetcher, onSuccess) => {
    const requestId = ++selectionRequestRef.current;
    setSessionStatus(status);
    setError(null);

    const result = await fetcher();
    if (requestId !== selectionRequestRef.current) {
      return null;
    }

    onSuccess(result);
    return result;
  }, [setError, setSessionStatus]);

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
    withLatestSelection('loadingYear', () => fetchAudioByYear(targetYear, itemId), (result) => {
      const selectedItemId = result.itemId || itemId || result.metadata?.uid || null;
      const itemUidIndex = selectedItemId ? result.itemUids?.indexOf(selectedItemId) : -1;

      applyAudioResult(result, {
        itemUids: result.itemUids || [],
        itemIndex: itemUidIndex >= 0 ? itemUidIndex : 0,
        itemId: selectedItemId
      });
      prefetchAdjacentYears(targetYear, availableYears);
    })
  ), [applyAudioResult, availableYears, prefetchAdjacentYears, withLatestSelection]);

  const loadAudioById = useCallback(async (audioId, targetYear) => (
    withLatestSelection('loadingItem', () => fetchAudioById(audioId), (result) => {
      applyAudioResult(result, {
        itemUids: [audioId],
        itemIndex: 0,
        itemId: result.itemId || audioId
      });
      if (targetYear != null) {
        dispatch({ type: 'SET_YEAR', payload: targetYear });
      }
    })
  ), [applyAudioResult, withLatestSelection]);

  const playItemByIndex = useCallback(async (idx) => {
    if (idx < 0 || idx >= itemUids.length) {
      return;
    }

    const targetItemId = itemUids[idx];
    await withLatestSelection('loadingItem', () => fetchAudioById(targetItemId), (result) => {
      applyAudioResult(result, {
        itemUids: [...itemUids],
        itemIndex: idx,
        itemId: result.itemId || targetItemId
      });
    });
    setOverrideAudio(true);
  }, [applyAudioResult, itemUids, withLatestSelection]);

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

  useEffect(() => {
    const savedVolume = localStorage.getItem('clientVolume');
    if (savedVolume) {
      setVolume(Number.parseFloat(savedVolume));
    }
  }, [setVolume]);

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

      if (yearsError) {
        setError(yearsError);
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
  }, [setAvailableYears, setCatalog, setError, setSessionStatus]);

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

      if (initialParams.itemId) {
        setOverrideAudio(true);
        const numericItemId = Number.parseInt(initialParams.itemId, 10);
        const isUidOnly = Number.isFinite(numericItemId) && String(numericItemId) === String(initialParams.itemId);

        if (isUidOnly) {
          const result = await loadAudioById(initialParams.itemId, initYear);

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
          }
        } else {
          dispatch({ type: 'SET_YEAR', payload: initYear });
          skipNextYearLoadRef.current = true;
          await loadYearAudio(initYear, initialParams.itemId);
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
  }, [year, initComplete, loadYearAudio, overrideAudio, sessionStatus]);

  useEffect(() => {
    if (!initComplete) {
      return;
    }

    const nextUrl = serializeRadioUrlState({
      year,
      autoplay: isOn,
      itemId: currentItemId || null
    });

    window.history.replaceState({}, '', nextUrl);
  }, [currentItemId, initComplete, isOn, year]);

  const controller = useMemo(() => ({
    year,
    setYear: setYearValue,
    audioUrl,
    setAudioUrl,
    volume,
    setVolume,
    isOn,
    setIsOn,
    metadata,
    setMetadata,
    availableYears,
    setAvailableYears,
    catalogEntries,
    catalogSource,
    catalogGeneratedAt,
    itemUids,
    setItemUids,
    itemIndex,
    setItemIndex,
    currentItemId,
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
  }), [
    audioUrl,
    availableYears,
    catalogEntries,
    catalogGeneratedAt,
    catalogSource,
    currentItemId,
    error,
    initComplete,
    isOn,
    itemIndex,
    itemUids,
    metadata,
    nextItem,
    overrideAudio,
    playItemByIndex,
    prevItem,
    screenRef,
    sessionStatus,
    setAudioUrl,
    setAvailableYears,
    setError,
    setIsOn,
    setItemIndex,
    setItemUids,
    setMetadata,
    setSessionStatus,
    setVolume,
    setYearValue,
    volume,
    year,
  ]);

  return controller;
}
