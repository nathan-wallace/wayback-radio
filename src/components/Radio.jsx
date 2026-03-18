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
import { radioLayout } from '../config/radioLayout';
import DisplayScreen from './DisplayScreen';
import ItemNavigator from './ItemNavigator';
import Button from './Button';
import YearSelector from './YearSelector';
import TuningKnob from './TuningKnob';
import VolumeKnob from './VolumeKnob';
import './Radio.css';

const componentRegistry = {
  Button,
  ItemNavigator,
  TuningKnob,
  VolumeKnob,
  YearSelector
};

const layoutSlots = ['timeline', 'controls'];

const groupedRadioLayout = layoutSlots.reduce((groups, slot) => {
  groups[slot] = radioLayout
    .filter((entry) => entry.enabled && entry.slot === slot)
    .sort((a, b) => a.order - b.order);

  return groups;
}, {});

const getResponsiveClasses = (responsive = {}) => [
  responsive.mobile ? `control--mobile-${responsive.mobile}` : null,
  responsive.desktop ? `control--desktop-${responsive.desktop}` : null
].filter(Boolean).join(' ');

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

function renderControl(entry) {
  const Component = componentRegistry[entry.component];

  if (!Component) {
    return null;
  }

  return (
    <div
      key={entry.id}
      className={[
        'radio-control',
        `radio-control--${entry.id}`,
        getResponsiveClasses(entry.responsive)
      ].filter(Boolean).join(' ')}
      data-control-id={entry.id}
    >
      <Component />
      {entry.label ? <div className="control-label">{entry.label}</div> : null}
    </div>
  );
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
    itemUids,
    itemIndex,
    isLoading,
    error
  } = state;
  const screenRef = useRef(null);

  const setYear = useCallback(
    (value) => dispatch({ type: 'SET_YEAR', payload: value }),
    []
  );
  const setAudioUrl = useCallback(
    (value) => dispatch({ type: 'SET_AUDIO_URL', payload: value }),
    []
  );
  const setVolume = useCallback(
    (value) => dispatch({ type: 'SET_VOLUME', payload: value }),
    []
  );
  const setIsOn = useCallback(
    (value) => dispatch({ type: 'SET_IS_ON', payload: value }),
    []
  );
  const setMetadata = useCallback(
    (value) => dispatch({ type: 'SET_METADATA', payload: value }),
    []
  );
  const setAvailableYears = useCallback(
    (value) => dispatch({ type: 'SET_AVAILABLE_YEARS', payload: value }),
    []
  );
  const setItemUids = useCallback(
    (value) => dispatch({ type: 'SET_ITEM_UIDS', payload: value }),
    []
  );
  const setItemIndex = useCallback(
    (value) => dispatch({ type: 'SET_ITEM_INDEX', payload: value }),
    []
  );
  const setIsLoading = useCallback(
    (value) => dispatch({ type: 'SET_IS_LOADING', payload: value }),
    []
  );
  const setError = useCallback(
    (value) => dispatch({ type: 'SET_ERROR', payload: value }),
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
  }, [itemIndex, itemUids.length, playItemByIndex]);

  const prevItem = useCallback(() => {
    if (itemIndex > 0) {
      playItemByIndex(itemIndex - 1);
    }
  }, [itemIndex, playItemByIndex]);

  useAudioManager(audioUrl, isOn, volume);

  useEffect(() => {
    const savedVolume = localStorage.getItem('clientVolume');
    if (savedVolume) {
      setVolume(Number.parseFloat(savedVolume));
    }
  }, [setVolume]);

  useEffect(() => {
    async function loadYears() {
      const { years, error: loadError } = await fetchAvailableYears();

      if (loadError) {
        setError(loadError);
      } else if (years) {
        setAvailableYears(years);
      }
    }

    loadYears();
  }, [setAvailableYears, setError]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInitialParams({
      year: params.get('year'),
      autoplay: params.get('autoplay'),
      audioId: params.get('audioId'),
      audioTitle: params.get('audioTitle')
    });
  }, []);

  useEffect(() => {
    if (!initialParams || availableYears.length === 0) {
      return;
    }

    let initYear;
    if (initialParams.year) {
      const urlYear = Number.parseInt(initialParams.year, 10);
      if (availableYears.includes(urlYear)) {
        initYear = urlYear;
      } else {
        initYear = urlYear;
        setAvailableYears((prev) => [...prev, urlYear].sort((a, b) => a - b));
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
          const metadataYear = Number.parseInt(result.metadata.date, 10);
          if (!availableYears.includes(metadataYear)) {
            setAvailableYears((prev) => [...prev, metadataYear].sort((a, b) => a - b));
          }
          initYear = metadataYear;
        }
      } else {
        const result = await fetchAudioByYear(initYear, initialParams.audioTitle);
        setAudioUrl(result.audioUrl);
        setMetadata(result.metadata);
        setItemUids(result.itemUids || []);
        setItemIndex(0);
        setError(result.error);
      }

      setYear(initYear);
      if (initialParams.autoplay?.toLowerCase() === 'true') {
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

  useEffect(() => {
    if (!initComplete || overrideAudio) {
      return;
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

      const currentIndex = availableYears.indexOf(year);
      const nextYear = availableYears[currentIndex + 1];
      const prevYear = availableYears[currentIndex - 1];

      if (nextYear) {
        fetchAudioByYear(nextYear);
      }
      if (prevYear) {
        fetchAudioByYear(prevYear);
      }
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
    setItemIndex
  ]);

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
      setError
    ]
  );

  if (!initComplete) {
    return <div className="radio-loading">Loading…</div>;
  }

  return (
    <RadioContext.Provider value={contextValue}>
      <div className="radio-frame">
        <DisplayScreen />
        {layoutSlots.map((slot) => (
          groupedRadioLayout[slot].length > 0 ? (
            <div key={slot} className={`radio-layout radio-layout--${slot}`}>
              {groupedRadioLayout[slot].map(renderControl)}
            </div>
          ) : null
        ))}
      </div>
    </RadioContext.Provider>
  );
}
