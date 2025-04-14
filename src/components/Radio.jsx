// Radio.jsx
import React, { useEffect, useRef } from 'react';
import { RadioProvider, useRadio } from '../context/RadioContext';
import { fetchAvailableYears, fetchAudioByYear } from '../services/AudioService';
import { useAudioManager } from '../hooks/useAudioManager';
import DisplayScreen from './DisplayScreen';
import VolumeKnob from './VolumeKnob';
import TuningKnob from './TuningKnob';
import Button from './Button';
import YearSelector from './YearSelector';
import { useDebounce } from '../hooks/useDebounce';
import './Radio.css';

function RadioContent() {
  const { state, dispatch } = useRadio();
  const { year, audioUrl, volume } = state;
  const screenRef = useRef(null);

  // Create/manage the audio using the audio manager hook.
  const { sound } = useAudioManager(audioUrl, state.isOn, volume);

  // Debounce the year value (500ms delay) to wait until knob dragging/animation stops
  const debouncedYear = useDebounce(year, 500);

  // Fetch available years on mount.
  useEffect(() => {
    async function loadYears() {
      const { years } = await fetchAvailableYears();
      if (years) {
        dispatch({ type: 'SET_AVAILABLE_YEARS', payload: years });
      }
    }
    loadYears();
  }, [dispatch]);

  // Fetch audio whenever the debounced year changes.
  useEffect(() => {
    async function loadAudio() {
      dispatch({ type: 'SET_AUDIO_LOADING', payload: true });
      const urlParams = new URLSearchParams(window.location.search);
      const initialTitle = urlParams.get('title') || null;
      const { audioUrl, metadata, title, error } = await fetchAudioByYear(debouncedYear, initialTitle);
      dispatch({
        type: 'SET_AUDIO_DATA',
        payload: { audioUrl, metadata, error }
      });
      dispatch({ type: 'SET_AUDIO_LOADING', payload: false });

      // Update the URL with the current state.
      const newUrl = `?year=${debouncedYear}&title=${title}`;
      window.history.pushState({}, '', newUrl);
    }
    loadAudio();
  }, [debouncedYear, dispatch]);

  return (
    <div className="radio-frame">
      <DisplayScreen screenRef={screenRef} />
      <YearSelector />
      <div className="controls">
        <VolumeKnob />
        <TuningKnob />
        <Button />
      </div>
    </div>
  );
}

export default function Radio() {
  return (
    <RadioProvider>
      <RadioContent />
    </RadioProvider>
  );
}
