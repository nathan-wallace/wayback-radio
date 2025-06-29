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
      return { ...state, availableYears: action.payload };
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
  // Hold parsed URL parameters.
  const [initialParams, setInitialParams] = useState(null);
  // Flag to indicate an audio override (for audioId).
  const [overrideAudio, setOverrideAudio] = useState(false);
  // Flag to indicate that initialization has finished.
  const [initComplete, setInitComplete] = useState(false);

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
    (years) => dispatch({ type: 'SET_AVAILABLE_YEARS', payload: years }),
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
  const { sound } = useAudioManager(audioUrl, isOn, volume);

  // Load saved volume from localStorage.
  useEffect(() => {
    const savedVolume = localStorage.getItem("clientVolume");
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

  // Parse URL parameters on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const yearParam = params.get("year");
    const autoplayParam = params.get("autoplay");
    const audioIdParam = params.get("audioId");
    setInitialParams({
      year: yearParam,
      autoplay: autoplayParam,
      audioId: audioIdParam,
    });
  }, []);

  // Initialization: Once initialParams and availableYears are ready, process URL parameters.
  useEffect(() => {
    if (!initialParams || availableYears.length === 0) return;
    
    let initYear;
    if (initialParams.year) {
      const urlYear = parseInt(initialParams.year, 10);
      if (availableYears.includes(urlYear)) {
        initYear = urlYear;
      } else {
        // Add the URL-specified year if it's not in availableYears.
        initYear = urlYear;
        setAvailableYears(prev => {
          const newYears = [...prev, urlYear];
          return newYears.sort((a, b) => a - b);
        });
      }
    } else {
      initYear = availableYears[0];
    }

    // Assume initialParams may contain a parameter for audioTitle (or similar)
  async function initAudio() {
    if (initialParams.audioId) {
      // If a unique audio identifier is provided, call fetchAudioById.
      setOverrideAudio(true);
      setIsLoading(true);
      const result = await fetchAudioById(initialParams.audioId);
      setAudioUrl(result.audioUrl);
      setMetadata(result.metadata);
      setError(result.error);
      setItemUids([initialParams.audioId]);
      setItemIndex(0);
      setIsLoading(false);
      if (result.metadata && result.metadata.date) {
        const metadataYear = parseInt(result.metadata.date, 10);
        if (!availableYears.includes(metadataYear)) {
          setAvailableYears(prev => {
            const newYears = [...prev, metadataYear];
            return newYears.sort((a, b) => a - b);
          });
        }
        initYear = metadataYear;
      }
    } else {
      // If no unique identifier is specified, use an optional 'audioTitle' parameter if provided.
      const uniqueParam = initialParams.audioTitle; // You might need to add this parameter.
      const result = await fetchAudioByYear(initYear, uniqueParam);
      setAudioUrl(result.audioUrl);
      setMetadata(result.metadata);
      setItemUids(result.itemUids || []);
      setItemIndex(0);
      setError(result.error);
    }
    // Then update the year state and autoplay as needed.
    setYear(initYear);
    if (initialParams.autoplay && initialParams.autoplay.toLowerCase() === "true") {
      setIsOn(true);
    }
    setInitComplete(true);
  }

    initAudio();
  }, [
    initialParams,
    availableYears,
    setYear,
    setIsOn,
    setAudioUrl,
    setMetadata,
    setError,
    setIsLoading,
    setAvailableYears,
    setItemUids,
    setItemIndex
  ]);

  // If no override is active and initialization is complete, fetch audio by year when year changes.
  useEffect(() => {
    if (!initComplete || overrideAudio) return;
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
  }, [year, availableYears, overrideAudio, initComplete, setAudioUrl, setMetadata, setError, setIsLoading, setItemUids, setItemIndex]);

  // Keep the browser URL in sync with the current state.
  useEffect(() => {
    if (!initComplete) return;
    const params = new URLSearchParams(window.location.search);
    params.set("year", year);
    if (isOn) {
      params.set("autoplay", "true");
    } else {
      params.delete("autoplay");
    }
    if (overrideAudio && initialParams && initialParams.audioId) {
      params.set("audioId", initialParams.audioId);
    } else {
      params.delete("audioId");
    }
    const newUrl = window.location.pathname + "?" + params.toString();
    window.history.replaceState({}, '', newUrl);
  }, [year, isOn, overrideAudio, initialParams, initComplete]);

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
      screenRef,
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
