import React from 'react';
import { render, screen } from '@testing-library/react';
import DisplayScreen from '../DisplayScreen';
import { RadioContext } from '../../context/RadioContext';

jest.mock('../../utils/audioUtils', () => ({
  animateScreen: jest.fn()
}));

const baseContext = {
  screenRef: { current: null },
  isOn: true,
  metadata: {
    title: 'A Fireside Chat',
    contributor: 'Franklin D. Roosevelt',
    recordingInfo: '1933 · Speech',
    summary: 'A presidential address.',
    notes: ['Original lacquer disc'],
    repository: 'Library of Congress',
    formats: [{ label: 'XML Format', url: 'https://formats.example/item.xml' }],
    relatedResources: [{ label: 'Related Resource', url: 'https://related.example/item' }],
    aka: [{ label: 'Alt Link', url: 'https://aka.example/item' }],
    location: 'Washington, DC',
    image: { src: 'https://images.example/item.jpg', alt: 'A Fireside Chat' },
    technicalDetails: [{ label: 'UID', value: '12345' }],
    source: [{ label: 'LOC Item', url: 'https://www.loc.gov/item/example/' }]
  },
  playback: {
    primaryUrl: 'https://cdn.example/audio.mp3',
    mimeType: 'audio/mpeg',
    streams: [{ url: 'https://cdn.example/audio.mp3', mimeType: 'audio/mpeg' }]
  },
  error: null,
  isLoading: false,
  sessionStatus: 'ready',
  selectionState: 'selected',
  playbackResolutionState: 'ready',
  playbackResolutionError: null,
  transportState: 'playing',
  transportError: null,
};

function renderScreen(overrides = {}) {
  return render(
    <RadioContext.Provider value={{ ...baseContext, ...overrides }}>
      <DisplayScreen />
    </RadioContext.Provider>
  );
}

describe('DisplayScreen', () => {
  it('renders normalized metadata through MetadataPanel', () => {
    renderScreen();

    expect(screen.getByText(/Now Playing:/)).toBeInTheDocument();
    expect(screen.getByText(/Now Playing: A Fireside Chat/)).toBeInTheDocument();
    expect(screen.getByText('Original lacquer disc')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Related Resource' })).toHaveAttribute('href', 'https://related.example/item');
    expect(screen.getByRole('link', { name: 'LOC Item' })).toHaveAttribute('href', 'https://www.loc.gov/item/example/');
    expect(screen.getByText(/Playback: playing/i)).toBeInTheDocument();
  });

  it('keeps metadata visible while playback resolution is deferred', () => {
    renderScreen({
      isOn: false,
      playback: { primaryUrl: null, mimeType: null, streams: [] },
      playbackResolutionState: 'resolving',
      transportState: 'paused'
    });

    expect(screen.getByText(/Now Playing: A Fireside Chat/)).toBeInTheDocument();
    expect(screen.getByText(/Turn the radio on to resolve playback for this recording\./i)).toBeInTheDocument();
    expect(screen.queryByText(/Playback: paused/i)).not.toBeInTheDocument();
  });

  it('keeps metadata visible when playback resolution fails', () => {
    renderScreen({
      playback: { primaryUrl: null, mimeType: null, streams: [] },
      playbackResolutionState: 'resolutionError',
      playbackResolutionError: 'Unable to resolve audio for this recording.',
      transportState: 'paused'
    });

    expect(screen.getByText(/Now Playing: A Fireside Chat/)).toBeInTheDocument();
    expect(screen.getByText('Unable to resolve audio for this recording.')).toBeInTheDocument();
  });

  it('shows transport-level failures beneath visible metadata', () => {
    renderScreen({
      transportState: 'error',
      transportError: 'The audio stream failed to start.'
    });

    expect(screen.getByText(/Now Playing: A Fireside Chat/)).toBeInTheDocument();
    expect(screen.getByText('The audio stream failed to start.')).toBeInTheDocument();
  });
});
