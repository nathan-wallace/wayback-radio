import React from 'react';
import { render, screen } from '@testing-library/react';
import DisplayScreen from '../DisplayScreen';
import { RadioContext } from '../../context/RadioContext';

jest.mock('../../utils/audioUtils', () => ({
  animateScreen: jest.fn()
}));

describe('DisplayScreen', () => {
  it('renders normalized metadata through MetadataPanel', () => {
    render(
      <RadioContext.Provider value={{
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
        audioUrl: 'https://cdn.example/audio.mp3',
        error: null,
        isLoading: false,
        sessionStatus: 'ready',
        transportState: 'playing'
      }}>
        <DisplayScreen />
      </RadioContext.Provider>
    );

    expect(screen.getByText(/Now Playing:/)).toBeInTheDocument();
    expect(screen.getByText(/Now Playing: A Fireside Chat/)).toBeInTheDocument();
    expect(screen.getByText('Original lacquer disc')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Related Resource' })).toHaveAttribute('href', 'https://related.example/item');
    expect(screen.getByRole('link', { name: 'LOC Item' })).toHaveAttribute('href', 'https://www.loc.gov/item/example/');
  });
});
