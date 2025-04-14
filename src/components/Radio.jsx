// Radio.jsx
import React, { useReducer, useEffect, useRef, useCallback, useMemo } from 'react';
import { RadioContext } from '../context/RadioContext';
import { fetchAvailableYears, fetchAudioByYear } from '../services/AudioService';
import { useAudioManager } from '../hooks/useAudioManager';
import DisplayScreen from './DisplayScreen';
import VolumeKnob from './VolumeKnob';
import TuningKnob from './TuningKnob';
import PowerButton from './PowerButton';
import YearSelector from './YearSelector';
import './Radio.css';

// Define the initial state for the radio.
const initialState = {
  year: 1940,
  audioUrl: null,
  volume: 0.5,
  isOn: false,
  metadata: null,
  availableYears: [],
  isLoading: false,
  error: null,
};

// Create a reducer that centralizes state updates.
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
    case 'SET_IS_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

export default function Radio() {
  // Replace multiple useState calls with a single useReducer.
  const [state, dispatch] = useReducer(radioReducer, initialState);

  // Destructure state values for clarity.
  const { year, audioUrl, volume, isOn, metadata, availableYears, isLoading, error } = state;

  // Create a ref for the display screen.
  const screenRef = useRef(null);

  // Wrap state updater functions in useCallback to preserve stable references.
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
  const setIsLoading = useCallback(
    (isLoading) => dispatch({ type: 'SET_IS_LOADING', payload: isLoading }),
    []
  );
  const setError = useCallback(
    (error) => dispatch({ type: 'SET_ERROR', payload: error }),
    []
  );

  // Use the custom hook for audio management.
  const { sound } = useAudioManager(audioUrl, isOn, volume);

  // Load saved volume from localStorage when the component mounts.
  useEffect(() => {
    const savedVolume = localStorage.getItem("clientVolume");
    if (savedVolume) setVolume(parseFloat(savedVolume));
  }, [setVolume]);

  // Fetch available years when the component mounts.
  useEffect(() => {
    const loadYears = async () => {
      const { years, error } = await fetchAvailableYears();
      if (error) {
        setError(error);
      } else if (years) {
        setAvailableYears(years);
      }
    };
    loadYears();
  }, [setAvailableYears, setError]);

  // Whenever the selected year changes, fetch new audio data.
  useEffect(() => {
    const loadAudio = async () => {
      setIsLoading(true);
      const { audioUrl, metadata, error } = await fetchAudioByYear(year);
      setAudioUrl(audioUrl);
      setMetadata(metadata);
      setError(error);
      setIsLoading(false);
    };
    loadAudio();
  }, [year, setAudioUrl, setMetadata, setError, setIsLoading]);

  // Memoize the context value to avoid unnecessary re-renders.
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
      isLoading,
      setIsLoading,
      error,
      setError,
      screenRef,
    }),
    [year, audioUrl, volume, isOn, metadata, availableYears, isLoading, error, setYear, setAudioUrl, setVolume, setIsOn, setMetadata, setAvailableYears, setIsLoading, setError]
  );

  return (
    <RadioContext.Provider value={contextValue}>
      <div className="radio-frame">
        <DisplayScreen />
        <YearSelector />
        <div className="controls">
          <VolumeKnob />
          <TuningKnob />
          <PowerButton />
        </div>
      </div>
    </RadioContext.Provider>
  );
}
