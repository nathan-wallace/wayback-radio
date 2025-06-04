// DisplayScreen.jsx
import React, { useEffect } from 'react';
import { useRadio } from '../context/RadioContext';
import { animateScreen } from '../utils/audioUtils';

export default function DisplayScreen() {
  const { screenRef, isOn, metadata, audioUrl, error, isLoading } = useRadio();

  // When the radio turns on/off or when new audio is loaded,
  // animate the screen with a smooth transition.
  useEffect(() => {
    // Call animateScreen with the screen reference and isOn status.
    // It will animate "in" if isOn, or animate "out" if not.
    if (screenRef.current) {
      animateScreen(screenRef, isOn);
    }
  }, [isOn, audioUrl, metadata, error, isLoading, screenRef]);

  return (
    <div className="display">
      <div className={`screen ${isOn ? 'on' : ''}`} ref={screenRef}>
        {isLoading && <p className="loading">Loading...</p>}
        {error && <p className="error">{error}</p>}
        {!isLoading && audioUrl && isOn && !error && (
          <div className="now-playing">
            <strong>Now Playing: {metadata?.title || "Untitled Recording"}</strong><br />
            {metadata?.contributor && <em>{metadata.contributor}</em>}<br />
            {(metadata?.date || metadata?.genre) && (
              <small>
                {metadata.date}{metadata.date && metadata.genre ? " · " : ""}{metadata.genre}
              </small>
            )}<br />
            {metadata?.summary && <p>{metadata.summary}</p>}
            {metadata?.notes?.length > 0 && (
              <ul style={{ paddingLeft: '1.2em', fontSize: '0.85em' }}>
                {metadata.notes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            )}
            {metadata?.repository && (
              <p style={{ fontSize: '0.85em' }}>
                <strong>Repository:</strong><br />
                {metadata.repository}
              </p>
            )}
            {metadata?.formats?.length > 0 && (
              <p style={{ fontSize: '0.85em' }}>
                <strong>Format XML:</strong><br />
                <a href={metadata.formats[0]} target="_blank" rel="noopener noreferrer">{metadata.formats[0]}</a>
              </p>
            )}
            {metadata?.related_resources?.length > 0 && (
              <p style={{ fontSize: '0.85em' }}>
                <strong>Related Resource:</strong><br />
                <a href={metadata.related_resources[0]} target="_blank" rel="noopener noreferrer">{metadata.related_resources[0]}</a>
              </p>
            )}
            {metadata?.aka?.length > 0 && (
              <details style={{ fontSize: '0.85em', marginTop: '0.5rem' }}>
                <summary><strong>Also Known As (Links)</strong></summary>
                <ul style={{ paddingLeft: '1.2em' }}>
                  {metadata.aka.map((link, i) => (
                    <li key={i}><a href={link} target="_blank" rel="noopener noreferrer">{link}</a></li>
                  ))}
                </ul>
              </details>
            )}
            {metadata?.location && (
              <p style={{ fontSize: '0.85em' }}>
                <strong>Location:</strong> {metadata.location}
              </p>
            )}
            {metadata?.image && (
              <img
                src={metadata.image}
                alt="Recording cover"
                style={{ maxWidth: '100px', marginTop: '0.5rem', borderRadius: '4px' }}
              />
            )}
            <br />
            <strong>Source:</strong><br />
            <a href={metadata?.url} target="_blank" rel="noopener noreferrer">{metadata?.url}</a>
          </div>
        )}
      </div>
    </div>
  );
}
