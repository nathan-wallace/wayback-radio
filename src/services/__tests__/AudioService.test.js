import { __testing as audioServiceTesting, fetchAudioByYear } from '../AudioService';
import { __testing as offlineStoreTesting } from '../offlineStore';

function createSearchItem({ id, year, title, audio = true }) {
  return {
    id: `https://www.loc.gov/item/${id}/`,
    title,
    date: String(year),
    url: `https://www.loc.gov/item/${id}/`,
    resources: audio ? [{ audio: `https://cdn.example/${id}.mp3` }] : []
  };
}

function createItemPayload({ id, year, title }) {
  return {
    id: `https://www.loc.gov/item/${id}/`,
    title,
    date: String(year),
    url: `https://www.loc.gov/item/${id}/`,
    item: {
      title,
      date: String(year),
      contributor: ['Library of Congress'],
      summary: ['Summary'],
      related_resources: [{ link: `https://related.example/${id}` }],
      other_formats: [{ link: `https://formats.example/${id}` }],
      location: ['Washington, DC'],
      mime_type: ['audio/mpeg']
    },
    resources: [{ audio: `https://cdn.example/${id}.mp3` }]
  };
}

describe('fetchAudioByYear', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    global.fetch = jest.fn();
    audioServiceTesting.resetCaches();
    await offlineStoreTesting.resetOfflineStore();
    localStorage.clear();
  });

  it('filters playable candidates to the requested year before selecting an item', async () => {
    global.fetch
      .mockResolvedValueOnce({
        json: async () => ({
          results: [
            createSearchItem({ id: 'mismatch-1981', year: 1981, title: 'Wrong year first' }),
            createSearchItem({ id: 'match-1980', year: 1980, title: 'Correct year second' })
          ]
        })
      })
      .mockResolvedValueOnce({
        json: async () => createItemPayload({ id: 'match-1980', year: 1980, title: 'Correct year second' })
      });

    const result = await fetchAudioByYear(1980);

    expect(result.error).toBeNull();
    expect(result.metadata.title).toBe('Correct year second');
    expect(result.metadata.date).toBe('1980');
    expect(global.fetch.mock.calls[1][0]).toContain('/item/match-1980/');
  });

  it('prefers an exact requested identity match within the requested year', async () => {
    global.fetch
      .mockResolvedValueOnce({
        json: async () => ({
          results: [
            createSearchItem({ id: 'default-1980', year: 1980, title: 'Default Choice' }),
            createSearchItem({ id: 'special-1980', year: 1980, title: 'Special Match Title' })
          ]
        })
      })
      .mockResolvedValueOnce({
        json: async () => createItemPayload({ id: 'special-1980', year: 1980, title: 'Special Match Title' })
      });

    const result = await fetchAudioByYear(1980, 'Special%20Match%20Title');

    expect(result.error).toBeNull();
    expect(result.metadata.title).toBe('Special Match Title');
    expect(result.itemId).toBe('special-1980');
    expect(global.fetch.mock.calls[1][0]).toContain('/item/special-1980/');
  });

  it('falls back deterministically to the first playable match for the year when no identity matches', async () => {
    global.fetch
      .mockResolvedValueOnce({
        json: async () => ({
          results: [
            createSearchItem({ id: 'first-1980', year: 1980, title: 'First playable' }),
            createSearchItem({ id: 'second-1980', year: 1980, title: 'Second playable' })
          ]
        })
      })
      .mockResolvedValueOnce({
        json: async () => createItemPayload({ id: 'first-1980', year: 1980, title: 'First playable' })
      });

    const result = await fetchAudioByYear(1980, 'Missing%20Identity');

    expect(result.error).toBeNull();
    expect(result.metadata.title).toBe('First playable');
    expect(global.fetch.mock.calls[1][0]).toContain('/item/first-1980/');
  });
});
