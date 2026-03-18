// Radio.jsx
import React, { useMemo } from 'react';
import { RadioContext } from '../context/RadioContext';
import { useAudioManager } from '../hooks/useAudioManager';
import { useRadioController } from '../hooks/useRadioController';
import DisplayScreen from './DisplayScreen';
import ItemNavigator from './ItemNavigator';
import Button from './Button';
import YearSelector from './YearSelector';
import './Radio.css';

export default function Radio() {
  const controller = useRadioController();
  const { audioUrl, isOn, volume, initComplete } = controller;
  const { sound, transportState } = useAudioManager(audioUrl, isOn, volume);

  const contextValue = useMemo(
    () => ({
      ...controller,
      sound,
      transportState,
    }),
    [controller, sound, transportState]
  );

  return !initComplete ? (
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
  );
}
