import React, { useState, useEffect, useRef } from 'react';
import { RadioContext } from "../context/RadioContext";
import { fetchAvailableYears, fetchAudioByYear } from '../services/AudioService';
import { useAudioManager } from '../hooks/useAudioManager';
import DisplayScreen from './DisplayScreen';
import VolumeKnob from './VolumeKnob';
import TuningKnob from './TuningKnob';
import PowerButton from './PowerButton';
import YearSelector from './YearSelector';
import MetadataPanel from './MetadataPanel';
import './Radio.css';

export default function Radio() {
  const [year, setYear] = useState(1940);
  const [audioUrl, setAudioUrl] = useState(null);
  const [volume, setVolume] = useState(0.5);
  const [isOn, setIsOn] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [availableYears, setAvailableYears] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const screenRef = useRef(null);

  const { sound } = useAudioManager(audioUrl, isOn, volume);

  useEffect(() => {
    const savedVolume = localStorage.getItem("clientVolume");
    if (savedVolume) setVolume(parseFloat(savedVolume));
  }, []);

  useEffect(() => {
    const loadYears = async () => {
      const { years } = await fetchAvailableYears();
      if (years) setAvailableYears(years);
    };
    loadYears();
  }, []);

  useEffect(() => {
    if (!isOn) return;
    const loadAudio = async () => {
      setIsLoading(true);
      const { audioUrl, metadata, error } = await fetchAudioByYear(year);
      setAudioUrl(audioUrl);
      setMetadata(metadata);
      setError(error);
      setIsLoading(false);
    };
    loadAudio();
  }, [year, isOn]);

  return (
    <RadioContext.Provider
      value={{ year, setYear,
        volume, setVolume,
        isOn, setIsOn,
        metadata, setMetadata,
        audioUrl, setAudioUrl,       
        screenRef,
        availableYears,
        isLoading, setIsLoading,
        error, setError }}>
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