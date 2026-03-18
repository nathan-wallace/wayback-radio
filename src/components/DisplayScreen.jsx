// DisplayScreen.jsx
import React, { useEffect } from 'react';
import { useRadio } from '../context/RadioContext';
import { animateScreen } from '../utils/audioUtils';
import MetadataPanel from './MetadataPanel';

export default function DisplayScreen() {
  const { screenRef, isOn, metadata, audioUrl, error, isLoading } = useRadio();

  useEffect(() => {
    if (screenRef.current) {
      animateScreen(screenRef, isOn);
    }
  }, [isOn, audioUrl, metadata, error, isLoading, screenRef]);

  return (
    <div className="glass">
      <img
        src="./svgs/logo.svg"
        alt="Radio Logo"
        className={`radio-logo ${isOn ? 'logo-off' : 'logo-on'}`}
      />
      <div className={`screen ${isOn ? 'on' : ''}`} ref={screenRef}>
        {isLoading && <p className="loading">Loading...</p>}
        {error && <p className="error">{error}</p>}
        {!isLoading && audioUrl && isOn && !error && <MetadataPanel metadata={metadata} />}
      </div>
    </div>
  );
}
