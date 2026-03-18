import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  fetchAvailableYears,
  fetchAudioByYear,
  fetchAudioById
} from '../services/AudioService';

const initialState = {
  year: 1940,
  audioUrl: null,
  volume: 0.5,
  isOn: false,
  metadata: null,
  availableYears: [],
  itemUids: [],
  itemIndex: 0,
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
    case 'SET_ITEM_UIDS':
      return { ...state, itemUids: action.payload };
    case 'SET_ITEM_INDEX':
      return { ...state, itemIndex: action.payload };
    case 'SET_SESSION_STATUS':
      return { ...state, sessionStatus: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'APPLY_AUDIO_RESULT': {
      const { audioUrl, metadata, error, itemUids, itemIndex, sessionStatus } = action.payload;
      return {
        ...state,
        audioUrl,
        metadata,
        error,
        itemUids: itemUids ?? state.itemUids,
        itemIndex: itemIndex ?? state.itemIndex,
        sessionStatus,
      };
    }
    default:
      return state;
  }
}

function parseInitialParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    year: params.get('year'),
    autoplay: params.get('autoplay'),
    audioId: params.get('audioId'),
    audioTitle: params.get('audioTitle'),
  };
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
    itemUids,
    itemIndex,
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

  const loadYearAudio = useCallback(async (targetYear, encodedTitle = null) => (
    withLatestSelection('loadingYear', () => fetchAudioByYear(targetYear, encodedTitle), (result) => {
      applyAudioResult(result, {
        itemUids: result.itemUids || [],
        itemIndex: 0
      });
      prefetchAdjacentYears(targetYear, availableYears);
    })
  ), [applyAudioResult, availableYears, prefetchAdjacentYears, withLatestSelection]);

  const loadAudioById = useCallback(async (audioId, targetYear) => (
    withLatestSelection('loadingItem', () => fetchAudioById(audioId), (result) => {
      applyAudioResult(result, {
        itemUids: [audioId],
        itemIndex: 0
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

    await withLatestSelection('loadingItem', () => fetchAudioById(itemUids[idx]), (result) => {
      applyAudioResult(result, {
        itemUids: [...itemUids],
        itemIndex: idx
      });
    });
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
      const { years, error: yearsError } = await fetchAvailableYears();
      if (requestId !== yearsRequestRef.current) {
        return;
      }

      if (yearsError) {
        setError(yearsError);
      }

      if (years?.length) {
        setAvailableYears(years);
      } else if (yearsError) {
        setSessionStatus('error');
      }
    }

    loadYears();
  }, [setAvailableYears, setError, setSessionStatus]);

  useEffect(() => {
    if (availableYears.length === 0 || initHandledRef.current) {
      return;
    }

    initHandledRef.current = true;

    async function initialize() {
      let initYear;
      if (initialParams.year) {
        const urlYear = Number.parseInt(initialParams.year, 10);
        if (Number.isFinite(urlYear)) {
          initYear = urlYear;
          if (!availableYears.includes(urlYear)) {
            setAvailableYears((prev) => [...prev, urlYear].sort((a, b) => a - b));
          }
        }
      }

      if (initYear == null) {
        initYear = availableYears[0];
      }

      if (initialParams.audioId) {
        setOverrideAudio(true);
        const result = await loadAudioById(initialParams.audioId, initYear);

        if (result?.metadata?.date) {
          const metadataYear = Number.parseInt(result.metadata.date, 10);
          if (Number.isFinite(metadataYear)) {
            if (!availableYears.includes(metadataYear)) {
              setAvailableYears((prev) => [...prev, metadataYear].sort((a, b) => a - b));
            }
            dispatch({ type: 'SET_YEAR', payload: metadataYear });
          }
        }
      } else {
        dispatch({ type: 'SET_YEAR', payload: initYear });
        skipNextYearLoadRef.current = true;
        await loadYearAudio(initYear, initialParams.audioTitle);
      }

      if (initialParams.autoplay?.toLowerCase() === 'true') {
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
    setIsOn
  ]);

  useEffect(() => {
    if (!initComplete || overrideAudio) {
      return;
    }

    if (skipNextYearLoadRef.current) {
      skipNextYearLoadRef.current = false;
      return;
    }

    loadYearAudio(year);
  }, [year, initComplete, loadYearAudio, overrideAudio]);

  useEffect(() => {
    if (!initComplete) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set('year', year);

    if (isOn) {
      params.set('autoplay', 'true');
    } else {
      params.delete('autoplay');
    }

    if (overrideAudio && initialParams.audioId) {
      params.set('audioId', initialParams.audioId);
    } else {
      params.delete('audioId');
    }

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [year, isOn, overrideAudio, initialParams, initComplete]);

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
    itemUids,
    setItemUids,
    itemIndex,
    setItemIndex,
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
