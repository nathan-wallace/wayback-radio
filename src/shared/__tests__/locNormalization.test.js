import {
  buildMetadata,
  buildSelectionKeys,
  getAudioUrlFromResources,
  isPlayableSearchItem,
  normalizeMetadata,
} from '../../../shared/locNormalization.mjs';

describe('locNormalization helpers', () => {
  it('shapes raw LOC item payloads into the UI metadata contract', () => {
    const metadata = buildMetadata({
      id: 'https://www.loc.gov/item/ihas.123456789/',
      title: 'Raw Recording',
      url: 'https://www.loc.gov/item/ihas.123456789/',
      item: {
        contributor: ['Library of Congress', 'Performer'],
        summary: ['Summary text'],
        genre: ['Sound Recording'],
        notes: ['Field note'],
        related_resources: [{ link: 'https://related.example/item' }],
        other_formats: [{ link: 'https://formats.example/item' }],
        location: ['Washington, DC'],
        mime_type: ['audio/mpeg'],
      },
    }, { id: 'https://www.loc.gov/item/ihas.123456789/' }, 1940);

    expect(metadata).toMatchObject({
      title: 'Raw Recording',
      date: '1940',
      uid: '123456789',
      contributor: 'Library of Congress',
      summary: 'Summary text',
      genre: 'Sound Recording',
      relatedResources: [{ label: 'https://related.example/item', url: 'https://related.example/item' }],
      formats: [{ label: 'https://formats.example/item', url: 'https://formats.example/item' }],
      location: 'Washington, DC',
      mimeType: 'audio/mpeg',
      technicalDetails: [
        { label: 'UID', value: '123456789' },
        { label: 'Mime Type', value: 'audio/mpeg' },
      ],
    });
  });

  it('normalizes legacy metadata fields and selection keys consistently', () => {
    const metadata = normalizeMetadata({
      title: 'Legacy Recording',
      uid: '555',
      related_resources: ['https://related.example/legacy'],
      mime_type: 'audio/wav',
    });

    expect(metadata.relatedResources).toEqual([
      { label: 'https://related.example/legacy', url: 'https://related.example/legacy' }
    ]);
    expect(metadata.mimeType).toBe('audio/wav');
    expect(buildSelectionKeys('ihas.555', '555', 'Legacy Recording')).toEqual([
      '555',
      'legacy recording'
    ]);
  });

  it('detects playable resources and extracts audio URLs from object-shaped LOC resources', () => {
    const payload = {
      resources: {
        0: {
          files: {
            0: {
              url: 'https://cdn.example/object-shaped.mp3',
              mimetype: 'audio/mpeg',
            }
          }
        }
      }
    };

    expect(isPlayableSearchItem(payload)).toBe(true);
    expect(getAudioUrlFromResources(payload)).toBe('https://cdn.example/object-shaped.mp3');
  });
});
