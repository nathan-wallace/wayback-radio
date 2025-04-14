// DisplayScreen.jsx
import React, { useEffect } from 'react';
import { useRadio } from '../context/RadioContext';
import { animateScreen } from '../utils/audioUtils';

export default function DisplayScreen({ screenRef }) {
  const { state } = useRadio();
  const { metadata, isLoading, error, isOn } = state;

  useEffect(() => {
    // Animate the screen when the isOn state changes.
    animateScreen(screenRef, isOn);
  }, [isOn, screenRef]);

  if (isLoading) {
    return <div className="screen" ref={screenRef}>Loading audio...</div>;
  }
  
  if (error) {
    return <div className="screen" ref={screenRef}>Error: {error}</div>;
  }

  return (
    <div className="glass">
      <img
        src="./svgs/logo.svg"
        alt="Radio Logo"
        className={`radio-logo ${isOn ? 'logo-off' : 'logo-on'}`}
      />
      <div className="screen" ref={screenRef}>
        {metadata ? (
          <div>
            <h3>{metadata.title}</h3>
            <p>{metadata.date}</p>
            <p>{metadata.summary}</p>
            <a href={metadata.url} target="_blank" rel="noopener noreferrer">
              More Info
            </a>
          </div>
        ) : (
          <div>No Audio Available</div>
        )}
      </div>
    </div>
  );
}