import React, { useEffect } from 'react';
import { useRadio } from '../context/RadioContext';
import { animateScreen } from '../utils/audioUtils';
import MetadataPanel from './MetadataPanel';

export default function DisplayScreen() {
  const {
    screenRef,
    isOn,
    metadata,
    audioUrl,
    error,
    isLoading,
    sessionStatus,
    transportState
  } = useRadio();

  useEffect(() => {
    if (screenRef.current) {
      animateScreen(screenRef, isOn);
    }
  }, [isOn, audioUrl, metadata, error, isLoading, screenRef, transportState]);

  const isEmpty = sessionStatus === 'empty';
  const hasMetadata = Boolean(metadata);
  const showMetadata = !isLoading && !isEmpty && hasMetadata;
  const showTransport = showMetadata && Boolean(audioUrl) && isOn && !error;

  return (
    <div className="glass">
      <img
        src="./svgs/logo.svg"
        alt="Radio Logo"
        className={`radio-logo ${isOn ? 'logo-off' : 'logo-on'}`}
      />
      <div className={`screen ${isOn ? 'on' : ''}`} ref={screenRef}>
        {isLoading && <p className="loading">{sessionStatus === 'loadingItem' ? 'Loading recording...' : 'Loading station...'}</p>}
        {!isLoading && isEmpty && <p className="empty-state">{error || 'No recordings available.'}</p>}
        {!isLoading && !isEmpty && error && <p className="error">{error}</p>}
        {showMetadata && (
          <>
            <MetadataPanel metadata={metadata} />
            {showTransport && (
              <p className="metadata-transport">
                <small>Playback: {transportState}</small>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
