import React, { useEffect } from 'react';
import { useRadio } from '../context/RadioContext';
import { animateScreen } from '../utils/audioUtils';
import MetadataPanel from './MetadataPanel';

function renderPlaybackMessage({
  isOn,
  playbackResolutionState,
  playbackResolutionError,
  transportState,
  transportError,
  playback,
}) {
  if (playbackResolutionState === 'resolving') {
    return (
      <p className="loading metadata-status">
        {isOn ? 'Resolving playback…' : 'Turn the radio on to resolve playback for this recording.'}
      </p>
    );
  }

  if (playbackResolutionState === 'blocked') {
    return <p className="error metadata-status">{playbackResolutionError || 'Playback is blocked for this recording.'}</p>;
  }

  if (playbackResolutionState === 'resolutionError') {
    return <p className="error metadata-status">{playbackResolutionError || 'Playback could not be resolved for this recording.'}</p>;
  }

  if (transportState === 'blocked') {
    return <p className="error metadata-status">{transportError || 'Playback was blocked by the browser.'}</p>;
  }

  if (transportState === 'error') {
    return <p className="error metadata-status">{transportError || 'Playback failed while starting the audio stream.'}</p>;
  }

  if (playback?.primaryUrl) {
    return (
      <p className="metadata-transport metadata-status">
        <small>Playback: {transportState}</small>
      </p>
    );
  }

  return null;
}

export default function DisplayScreen() {
  const {
    screenRef,
    isOn,
    metadata,
    playback,
    error,
    isLoading,
    sessionStatus,
    transportState,
    transportError,
    selectionState,
    playbackResolutionState,
    playbackResolutionError,
  } = useRadio();

  useEffect(() => {
    if (screenRef.current) {
      animateScreen(screenRef, isOn);
    }
  }, [
    error,
    isLoading,
    isOn,
    metadata,
    playback?.primaryUrl,
    playbackResolutionState,
    screenRef,
    transportState,
  ]);

  const isEmpty = sessionStatus === 'empty';
  const hasSelection = selectionState === 'selected';

  return (
    <div className="glass">
      <img
        src="./svgs/logo.svg"
        alt="Radio Logo"
        className={`radio-logo ${isOn ? 'logo-off' : 'logo-on'}`}
      />
      <div className={`screen ${isOn ? 'on' : ''}`} ref={screenRef}>
        {isLoading && !hasSelection && <p className="loading">{sessionStatus === 'loadingItem' ? 'Loading recording...' : 'Loading station...'}</p>}
        {!isLoading && isEmpty && <p className="empty-state">{error || 'No recordings available.'}</p>}
        {!isLoading && !isEmpty && !hasSelection && error && <p className="error">{error}</p>}
        {hasSelection && (
          <>
            <MetadataPanel metadata={metadata} />
            {renderPlaybackMessage({
              isOn,
              playbackResolutionState,
              playbackResolutionError,
              transportState,
              transportError,
              playback,
            })}
            {!playback?.primaryUrl && !playbackResolutionError && playbackResolutionState === 'ready' && (
              <p className="metadata-transport metadata-status">
                <small>Playback: {isOn ? 'waiting' : 'standby'}</small>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
