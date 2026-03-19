import { buildDatasetUrl, normalizeBaseUrl } from '../datasetUrl';

describe('datasetUrl helpers', () => {
  it('normalizes app base paths before prefixing dataset files', () => {
    expect(normalizeBaseUrl('/wayback-radio')).toBe('/wayback-radio/');
    expect(buildDatasetUrl('manifest.json', '/wayback-radio')).toBe('/wayback-radio/data/manifest.json');
  });

  it('avoids duplicating the data segment for dataset-relative paths', () => {
    expect(buildDatasetUrl('data/catalog.json', '/wayback-radio/')).toBe('/wayback-radio/data/catalog.json');
    expect(buildDatasetUrl('/data/items/example.json', '/')).toBe('/data/items/example.json');
  });
});
