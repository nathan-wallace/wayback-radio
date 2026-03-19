import { parseRadioUrlState, serializeRadioUrlState } from '../radioUrlState';

describe('radioUrlState', () => {
  it('parses legacy item aliases into the canonical itemId field', () => {
    expect(parseRadioUrlState('?year=1942&audioId=12345&autoplay=true')).toEqual({
      year: 1942,
      itemId: '12345',
      source: null,
      uid: null,
      audioUrl: null,
      autoplay: true
    });

    expect(parseRadioUrlState('?year=1942&audioTitle=Special%20Broadcast')).toEqual({
      year: 1942,
      itemId: 'Special Broadcast',
      source: null,
      uid: null,
      audioUrl: null,
      autoplay: false
    });
  });

  it('parses uid imports only when explicitly marked with the uid source', () => {
    expect(parseRadioUrlState('?year=1942&uid=12345&source=uid')).toEqual({
      year: 1942,
      itemId: null,
      source: 'uid',
      uid: '12345',
      audioUrl: null,
      autoplay: false
    });
  });

  it('parses audio-url imports only when explicitly marked with the audio-url source', () => {
    expect(parseRadioUrlState('?year=1942&audioUrl=https%3A%2F%2Fmedia.example%2Fimported.wav&source=audio-url')).toEqual({
      year: 1942,
      itemId: null,
      source: 'audio-url',
      uid: null,
      audioUrl: 'https://media.example/imported.wav',
      autoplay: false
    });
  });

  it('prefers canonical item links over advanced sources when both are present', () => {
    expect(parseRadioUrlState('?year=1942&itemId=loc-1942-item&uid=12345&source=uid&audioUrl=https%3A%2F%2Fmedia.example%2Fimported.wav')).toEqual({
      year: 1942,
      itemId: 'loc-1942-item',
      source: null,
      uid: null,
      audioUrl: null,
      autoplay: false
    });
  });

  it('serializes and round-trips item-level share links', () => {
    const url = serializeRadioUrlState(
      { year: 1938, itemId: 'afc1938001_sr01', autoplay: true },
      { pathname: '/radio', hash: '#listen' }
    );

    expect(url).toBe('/radio?year=1938&itemId=afc1938001_sr01&autoplay=true#listen');
    expect(parseRadioUrlState(url.split('?')[1].replace('#listen', ''))).toEqual({
      year: 1938,
      itemId: 'afc1938001_sr01',
      source: null,
      uid: null,
      audioUrl: null,
      autoplay: true
    });
  });

  it('serializes direct-link imports through the explicit audio-url route state', () => {
    const url = serializeRadioUrlState(
      {
        year: 1938,
        source: 'audio-url',
        audioUrl: 'https://media.example/imported.wav',
        autoplay: true
      },
      { pathname: '/radio' }
    );

    expect(url).toBe('/radio?year=1938&source=audio-url&audioUrl=https%3A%2F%2Fmedia.example%2Fimported.wav&autoplay=true');
  });
});
