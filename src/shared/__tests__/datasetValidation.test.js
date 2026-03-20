import {
  validateArchiveCacheDataset,
} from '../../../shared/datasetValidation.mjs';

function buildAudioRecord({ itemId, uid, date }) {
  return {
    itemId,
    metadata: {
      uid,
      date,
      title: itemId,
    },
  };
}

describe('validateArchiveCacheDataset', () => {
  it('returns no errors for unique route ids with matching years', () => {
    const errors = validateArchiveCacheDataset({
      audioByYear: {
        1942: buildAudioRecord({ itemId: 'ihas.200197221', uid: '200197221', date: '1942' }),
        1970: buildAudioRecord({ itemId: 'ihas.200196384', uid: '200196384', date: '1970' }),
      },
    });

    expect(errors).toEqual([]);
  });

  it('reports duplicate route ids across year manifests and duplicate global item writes', () => {
    const errors = validateArchiveCacheDataset({
      audioByYear: {
        1942: buildAudioRecord({ itemId: 'ihas.200197221', uid: '200197221', date: '1942' }),
        1952: buildAudioRecord({ itemId: 'ihas.200197221', uid: '200197221', date: '1952' }),
      },
    });

    expect(errors.map((error) => error.message)).toEqual(expect.arrayContaining([
      'Duplicate routeId across year manifests for "ihas.200197221": 1942, 1952.',
      'Duplicate global item write detected for "items/ihas.200197221.json": 1942, 1952 would overwrite the same payload.',
    ]));
  });

  it('reports mismatched year manifest dates', () => {
    const errors = validateArchiveCacheDataset({
      audioByYear: {
        1952: buildAudioRecord({ itemId: 'ihas.200197221', uid: '200197221', date: '1942' }),
      },
    });

    expect(errors.map((error) => error.message)).toContain(
      'Mismatched year manifest date vs item payload date for year 1952: manifest year 1952 does not match item date "1942".'
    );
  });
});
