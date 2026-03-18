import { parseRadioUrlState, serializeRadioUrlState } from '../radioUrlState';

describe('radioUrlState', () => {
  it('parses legacy item aliases into the canonical itemId field', () => {
    expect(parseRadioUrlState('?year=1942&audioId=12345&autoplay=true')).toEqual({
      year: 1942,
      itemId: '12345',
      autoplay: true
    });

    expect(parseRadioUrlState('?year=1942&audioTitle=Special%20Broadcast')).toEqual({
      year: 1942,
      itemId: 'Special Broadcast',
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
      autoplay: true
    });
  });
});
