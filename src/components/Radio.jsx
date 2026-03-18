// Radio.jsx
import React, {
  useReducer,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useState
} from 'react';
import { RadioContext } from '../context/RadioContext';
import {
  fetchAvailableYears,
  fetchAudioByYear,
  fetchAudioById
} from '../services/AudioService';
import { useAudioManager } from '../hooks/useAudioManager';
import {
  parseRadioUrlState,
  serializeRadioUrlState
} from '../utils/radioUrlState';
import DisplayScreen from './DisplayScreen';
import ItemNavigator from './ItemNavigator';
import Button from './Button';
import YearSelector from './YearSelector';
import './Radio.css';

// Initial state for the radio.
const initialState = {
  year: 1940,
  audioUrl: null,
  volume: 0.5,
  isOn: false,
  metadata: null,
  availableYears: [],
  itemUids: [],
  itemIndex: 0,
  isLoading: false,
  error: null,
};

function resolveValidYear(requestedYear, availableYears) {
  if (requestedYear == null) {
    return availableYears[0];
  }

  if (availableYears.includes(requestedYear)) {
    return requestedYear;
  }

  return requestedYear;
}

function ensureYearPresent(year, availableYears, setAvailableYears) {
  if (year == null || availableYears.includes(year)) {
    return;
  }

  setAvailableYears((prev) => {
    if (prev.includes(year)) {
      return prev;
    }

    return [...prev, year].sort((a, b) => a - b);
  });
}

// Reducer to centralize state updates.
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
    case 'SET_IS_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

export default function Radio() {
  // Centralize radio state.
  const [state, dispatch] = useReducer(radioReducer, initialState);
  const [initialRouteState] = useState(() => parseRadioUrlState());
  // Flag to indicate that initialization has finished.
  const [initComplete, setInitComplete] = useState(false);
  const initStartedRef = useRef(false);
  const skipNextYearFetchRef = useRef(false);

  const {
    year,
    audioUrl,
    volume,
    isOn,
    metadata,
    availableYears,
    itemUids,
    itemIndex,
    isLoading,
    error
  } = state;
  const screenRef = useRef(null);

  const selectedItemId = metadata?.uid || null;
  const hasExplicitInitialItem = Boolean(initialRouteState.itemId);

  // Updater functions wrapped in useCallback.
  const setYear = useCallback(
    (year) => dispatch({ type: 'SET_YEAR', payload: year }),
    []
  );
  const setAudioUrl = useCallback(
    (audioUrl) => dispatch({ type: 'SET_AUDIO_URL', payload: audioUrl }),
    []
  );
  const setVolume = useCallback(
    (volume) => dispatch({ type: 'SET_VOLUME', payload: volume }),
    []
  );
  const setIsOn = useCallback(
    (isOn) => dispatch({ type: 'SET_IS_ON', payload: isOn }),
    []
  );
  const setMetadata = useCallback(
    (metadata) => dispatch({ type: 'SET_METADATA', payload: metadata }),
    []
  );
  const setAvailableYears = useCallback(
    (yearsOrUpdater) => dispatch({
      type: 'SET_AVAILABLE_YEARS',
      payload: yearsOrUpdater
    }),
    []
  );
  const setItemUids = useCallback(
    (uids) => dispatch({ type: 'SET_ITEM_UIDS', payload: uids }),
    []
  );
  const setItemIndex = useCallback(
    (index) => dispatch({ type: 'SET_ITEM_INDEX', payload: index }),
    []
  );
  const setIsLoading = useCallback(
    (isLoading) => dispatch({ type: 'SET_IS_LOADING', payload: isLoading }),
    []
  );
  const setError = useCallback(
    (error) => dispatch({ type: 'SET_ERROR', payload: error }),
    []
  );

  const playItemByIndex = useCallback(async (idx) => {
    if (idx < 0 || idx >= itemUids.length) return;
    setIsLoading(true);
    const result = await fetchAudioById(itemUids[idx]);
    setAudioUrl(result.audioUrl);
    setMetadata(result.metadata);
    setError(result.error);
    setIsLoading(false);
    setItemIndex(idx);
  }, [itemUids, setIsLoading, setAudioUrl, setMetadata, setError, setItemIndex]);

  const nextItem = useCallback(() => {
    if (itemIndex < itemUids.length - 1) {
      playItemByIndex(itemIndex + 1);
    }
  }, [itemIndex, itemUids, playItemByIndex]);

  const prevItem = useCallback(() => {
    if (itemIndex > 0) {
      playItemByIndex(itemIndex - 1);
    }
  }, [itemIndex, playItemByIndex]);

  // Use custom audio manager hook.
  useAudioManager(audioUrl, isOn, volume);

  // Load saved volume from localStorage.
  useEffect(() => {
    const savedVolume = localStorage.getItem('clientVolume');
    if (savedVolume) setVolume(parseFloat(savedVolume));
  }, [setVolume]);

  // Fetch available years on mount.
  useEffect(() => {
    async function loadYears() {
      const { years, error } = await fetchAvailableYears();
      if (error) {
        setError(error);
      } else if (years) {
        setAvailableYears(years);
      }
    }
    loadYears();
  }, [setAvailableYears, setError]);

  // Initialization: once available years are ready, process the normalized route state.
  useEffect(() => {
    if (availableYears.length === 0 || initComplete || initStartedRef.current) return;

    initStartedRef.current = true;

    async function initializeFromRoute() {
      let nextYear = resolveValidYear(initialRouteState.year, availableYears);
      let initialItemId = initialRouteState.itemId;

      ensureYearPresent(nextYear, availableYears, setAvailableYears);
      setIsLoading(true);

      if (initialItemId) {
        const result = await fetchAudioById(initialItemId);

        setAudioUrl(result.audioUrl);
        setMetadata(result.metadata);
        setError(result.error);

        if (result.metadata?.date) {
          const metadataYear = Number.parseInt(result.metadata.date, 10);
          if (!Number.isNaN(metadataYear)) {
            nextYear = metadataYear;
            ensureYearPresent(metadataYear, availableYears, setAvailableYears);
          }
        }

        const yearResult = await fetchAudioByYear(nextYear);
        const initialItemUids = yearResult.itemUids || [];
        const matchedIndex = initialItemUids.indexOf(initialItemId);

        setItemUids(initialItemUids);
        setItemIndex(matchedIndex >= 0 ? matchedIndex : 0);
      } else {
        const result = await fetchAudioByYear(nextYear);
        const initialItemUids = result.itemUids || [];

        setAudioUrl(result.audioUrl);
        setMetadata(result.metadata);
        setItemUids(initialItemUids);
        setError(result.error);

        const matchedIndex = initialItemId
          ? initialItemUids.indexOf(initialItemId)
          : 0;

        setItemIndex(matchedIndex >= 0 ? matchedIndex : 0);
      }

      skipNextYearFetchRef.current = true;
      setYear(nextYear);
      setIsLoading(false);

      if (initialRouteState.autoplay) {
        setIsOn(true);
      }

      setInitComplete(true);
    }

    initializeFromRoute();
  }, [
    availableYears,
    initComplete,
    initialRouteState,
    setAudioUrl,
    setAvailableYears,
    setError,
    setIsLoading,
    setIsOn,
    setItemIndex,
    setItemUids,
    setMetadata,
    setYear
  ]);

  // When a year is selected after initialization, load the default recording for that year.
  useEffect(() => {
    if (!initComplete) return;

    if (skipNextYearFetchRef.current) {
      skipNextYearFetchRef.current = false;
      return;
    }

    if (hasExplicitInitialItem && selectedItemId && metadata?.date) {
      const metadataYear = Number.parseInt(metadata.date, 10);
      if (!Number.isNaN(metadataYear) && metadataYear === year) {
        return;
      }
    }

    (async () => {
      setIsLoading(true);
      const result = await fetchAudioByYear(year);
      setAudioUrl(result.audioUrl);
      setMetadata(result.metadata);
      setItemUids(result.itemUids || []);
      setItemIndex(0);
      setError(result.error);
      setIsLoading(false);

      // Prefetch adjacent years to speed up tuning
      const currentIndex = availableYears.indexOf(year);
      const nextYear = availableYears[currentIndex + 1];
      if (nextYear) fetchAudioByYear(nextYear);
      const prevYear = availableYears[currentIndex - 1];
      if (prevYear) fetchAudioByYear(prevYear);
    })();
  }, [
    year,
    availableYears,
    hasExplicitInitialItem,
    initComplete,
    metadata,
    selectedItemId,
    setAudioUrl,
    setMetadata,
    setError,
    setIsLoading,
    setItemUids,
    setItemIndex
  ]);

  // Keep the browser URL in sync with the current state.
  useEffect(() => {
    if (!initComplete) return;

    const newUrl = serializeRadioUrlState({
      year,
      itemId: selectedItemId,
      autoplay: isOn
    });

    window.history.replaceState({}, '', newUrl);
  }, [year, isOn, selectedItemId, initComplete]);

  // Memoize the context value.
  const contextValue = useMemo(
    () => ({
      year,
      setYear,
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
      itemIndex,
      nextItem,
      prevItem,
      isLoading,
      setIsLoading,
      error,
      setError,
      screenRef
    }),
    [
      year,
      audioUrl,
      volume,
      isOn,
      metadata,
      availableYears,
      itemUids,
      itemIndex,
      isLoading,
      error,
      setYear,
      setAudioUrl,
      setVolume,
      setIsOn,
      setMetadata,
      setAvailableYears,
      nextItem,
      prevItem,
      setIsLoading,
      setError
    ]
  );

  // Instead of an early return (which causes hook order changes),
  // always call all hooks and then conditionally render the UI.
  return (
    !initComplete ? (
      <div className="radio-loading">Loading…</div>
    ) : (
      <RadioContext.Provider value={contextValue}>
        <div className="radio-frame">
          <DisplayScreen />
          <YearSelector />
          <div className="controls">
            <ItemNavigator />
            <Button />
          </div>
        </div>
      </RadioContext.Provider>
    )
  );
}
