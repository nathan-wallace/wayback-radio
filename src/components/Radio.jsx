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
  availableYearOptions: [],
  itemUids: [],
  itemIndex: 0,
  isLoading: false,
  error: null,
};

function buildYearLabel(yearValue, count) {
  return `${yearValue} — ${count > 0
    ? `${count} recording${count === 1 ? '' : 's'}`
    : 'No recordings'}`;
}

function mergeYearOption(options, yearValue, count = null, hasRecordings = count > 0) {
  const normalizedOption = {
    value: yearValue,
    year: yearValue,
    count,
    hasRecordings,
    label: buildYearLabel(yearValue, count ?? 0)
  };

  const withoutYear = options.filter((option) => option.value !== yearValue);
  return [...withoutYear, normalizedOption].sort((a, b) => a.value - b.value);
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
    case 'SET_AVAILABLE_YEAR_OPTIONS':
      return {
        ...state,
        availableYearOptions: typeof action.payload === 'function'
          ? action.payload(state.availableYearOptions)
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
  const [state, dispatch] = useReducer(radioReducer, initialState);
  const [initialParams, setInitialParams] = useState(null);
  const [overrideAudio, setOverrideAudio] = useState(false);
  const [initComplete, setInitComplete] = useState(false);

  const {
    year,
    audioUrl,
    volume,
    isOn,
    metadata,
    availableYears,
    availableYearOptions,
    itemUids,
    itemIndex,
    isLoading,
    error
  } = state;
  const screenRef = useRef(null);

  const setYear = useCallback(
    (nextYear) => dispatch({ type: 'SET_YEAR', payload: nextYear }),
    []
  );
  const setAudioUrl = useCallback(
    (nextAudioUrl) => dispatch({ type: 'SET_AUDIO_URL', payload: nextAudioUrl }),
    []
  );
  const setVolume = useCallback(
    (nextVolume) => dispatch({ type: 'SET_VOLUME', payload: nextVolume }),
    []
  );
  const setIsOn = useCallback(
    (nextIsOn) => dispatch({ type: 'SET_IS_ON', payload: nextIsOn }),
    []
  );
  const setMetadata = useCallback(
    (nextMetadata) => dispatch({ type: 'SET_METADATA', payload: nextMetadata }),
    []
  );
  const setAvailableYears = useCallback(
    (yearsOrUpdater) => dispatch({ type: 'SET_AVAILABLE_YEARS', payload: yearsOrUpdater }),
    []
  );
  const setAvailableYearOptions = useCallback(
    (optionsOrUpdater) => dispatch({ type: 'SET_AVAILABLE_YEAR_OPTIONS', payload: optionsOrUpdater }),
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
    (nextIsLoading) => dispatch({ type: 'SET_IS_LOADING', payload: nextIsLoading }),
    []
  );
  const setError = useCallback(
    (nextError) => dispatch({ type: 'SET_ERROR', payload: nextError }),
    []
  );

  const syncYearCatalogState = useCallback((yearValue, result) => {
    const count = result?.itemUids?.length ?? (result?.audioUrl ? 1 : 0);

    setAvailableYears((prevYears) => {
      if (prevYears.includes(yearValue)) return prevYears;
      return [...prevYears, yearValue].sort((a, b) => a - b);
    });
    setAvailableYearOptions((prevOptions) => mergeYearOption(prevOptions, yearValue, count, count > 0));
  }, [setAvailableYearOptions, setAvailableYears]);

  const playItemByIndex = useCallback(async (idx) => {
    if (idx < 0 || idx >= itemUids.length) return;
    setIsLoading(true);
    const result = await fetchAudioById(itemUids[idx]);
    setAudioUrl(result.audioUrl);
    setMetadata(result.metadata);
    setError(result.error);
    setIsLoading(false);
    setItemIndex(idx);
    syncYearCatalogState(year, result);
  }, [itemUids, setIsLoading, setAudioUrl, setMetadata, setError, setItemIndex, syncYearCatalogState, year]);

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

  useAudioManager(audioUrl, isOn, volume);

  useEffect(() => {
    const savedVolume = localStorage.getItem('clientVolume');
    if (savedVolume) setVolume(parseFloat(savedVolume));
  }, [setVolume]);

  useEffect(() => {
    async function loadYears() {
      const { years, error: yearsError } = await fetchAvailableYears();
      if (yearsError) {
        setError(yearsError);
      }
      if (years) {
        setAvailableYearOptions(years);
        setAvailableYears(years.map(({ value }) => value));
      }
    }

    loadYears();
  }, [setAvailableYearOptions, setAvailableYears, setError]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInitialParams({
      year: params.get('year'),
      autoplay: params.get('autoplay'),
      audioId: params.get('audioId')
    });
  }, []);

  useEffect(() => {
    if (!initialParams || availableYears.length === 0 || initComplete) return;

    let initYear;
    if (initialParams.year) {
      const urlYear = parseInt(initialParams.year, 10);
      if (availableYears.includes(urlYear)) {
        initYear = urlYear;
      } else {
        initYear = urlYear;
        setAvailableYears((prev) => [...prev, urlYear].sort((a, b) => a - b));
        setAvailableYearOptions((prev) => mergeYearOption(prev, urlYear, 0, false));
      }
    } else {
      initYear = availableYears[0];
    }

    async function initAudio() {
      if (initialParams.audioId) {
        setOverrideAudio(true);
        setIsLoading(true);
        const result = await fetchAudioById(initialParams.audioId);
        setAudioUrl(result.audioUrl);
        setMetadata(result.metadata);
        setError(result.error);
        setItemUids([initialParams.audioId]);
        setItemIndex(0);
        setIsLoading(false);

        if (result.metadata?.date) {
          const metadataYear = parseInt(result.metadata.date, 10);
          syncYearCatalogState(metadataYear, result);
          initYear = metadataYear;
        }
      } else {
        const result = await fetchAudioByYear(initYear, initialParams.audioTitle);
        setAudioUrl(result.audioUrl);
        setMetadata(result.metadata);
        setItemUids(result.itemUids || []);
        setItemIndex(0);
        setError(result.error);
        syncYearCatalogState(initYear, result);
      }

      setYear(initYear);
      if (initialParams.autoplay && initialParams.autoplay.toLowerCase() === 'true') {
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
    setAvailableYearOptions,
    setItemUids,
    setItemIndex,
    syncYearCatalogState,
    initComplete
  ]);

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
      syncYearCatalogState(year, result);
      setIsLoading(false);

      const currentIndex = availableYears.indexOf(year);
      const nextYear = availableYears[currentIndex + 1];
      if (nextYear) fetchAudioByYear(nextYear);
      const prevYear = availableYears[currentIndex - 1];
      if (prevYear) fetchAudioByYear(prevYear);
    })();
  }, [
    year,
    availableYears,
    overrideAudio,
    initComplete,
    setAudioUrl,
    setMetadata,
    setError,
    setIsLoading,
    setItemUids,
    setItemIndex,
    syncYearCatalogState
  ]);

  useEffect(() => {
    if (!initComplete) return;
    const params = new URLSearchParams(window.location.search);
    params.set('year', year);
    if (isOn) {
      params.set('autoplay', 'true');
    } else {
      params.delete('autoplay');
    }
    if (overrideAudio && initialParams?.audioId) {
      params.set('audioId', initialParams.audioId);
    } else {
      params.delete('audioId');
    }
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [year, isOn, overrideAudio, initialParams, initComplete]);

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
      availableYearOptions,
      setAvailableYears,
      setAvailableYearOptions,
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
      availableYearOptions,
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
      setAvailableYearOptions,
      nextItem,
      prevItem,
      setIsLoading,
      setError
    ]
  );

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
