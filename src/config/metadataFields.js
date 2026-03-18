const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const hasListItems = (value) => Array.isArray(value) && value.length > 0;
const hasImage = (value) => Boolean(value?.src);

export function joinMetadataParts(...parts) {
  return parts.filter(hasText).join(' · ');
}

export function createLinkItems(items = []) {
  return items
    .map((item) => {
      if (!item?.url) return null;

      return {
        label: hasText(item.label) ? item.label : item.url,
        url: item.url,
      };
    })
    .filter(Boolean);
}

export const metadataFieldSchema = [
  {
    key: 'title',
    label: 'Now Playing',
    renderType: 'text',
    className: 'metadata-title',
    formatter: (value) => value || 'Untitled Recording',
    isVisible: () => true,
  },
  {
    key: 'contributor',
    label: 'Contributor',
    renderType: 'text',
    className: 'metadata-contributor',
    emphasize: true,
    isVisible: (metadata) => hasText(metadata.contributor),
  },
  {
    key: 'recordingInfo',
    label: 'Recording Details',
    renderType: 'text',
    className: 'metadata-context',
    compact: true,
    formatter: (value, metadata) => value || joinMetadataParts(metadata.date, metadata.genre),
    isVisible: (metadata) => hasText(joinMetadataParts(metadata.date, metadata.genre)),
  },
  {
    key: 'summary',
    label: 'Summary',
    renderType: 'text',
    isVisible: (metadata) => hasText(metadata.summary),
  },
  {
    key: 'notes',
    label: 'Notes',
    renderType: 'list',
    isVisible: (metadata) => hasListItems(metadata.notes),
  },
  {
    key: 'repository',
    label: 'Repository',
    renderType: 'text',
    isVisible: (metadata) => hasText(metadata.repository),
  },
  {
    key: 'formats',
    label: 'Format XML',
    renderType: 'link',
    isVisible: (metadata) => hasListItems(metadata.formats),
  },
  {
    key: 'relatedResources',
    label: 'Related Resource',
    renderType: 'link',
    isVisible: (metadata) => hasListItems(metadata.relatedResources),
  },
  {
    key: 'aka',
    label: 'Also Known As (Links)',
    renderType: 'details',
    itemRenderType: 'link',
    isVisible: (metadata) => hasListItems(metadata.aka),
  },
  {
    key: 'location',
    label: 'Location',
    renderType: 'text',
    inlineLabel: true,
    isVisible: (metadata) => hasText(metadata.location),
  },
  {
    key: 'image',
    label: 'Recording cover',
    renderType: 'image',
    isVisible: (metadata) => hasImage(metadata.image),
  },
  {
    key: 'technicalDetails',
    label: 'Technical Details',
    renderType: 'details',
    itemRenderType: 'text',
    isVisible: (metadata) => hasListItems(metadata.technicalDetails),
  },
  {
    key: 'source',
    label: 'Source',
    renderType: 'link',
    isVisible: (metadata) => hasListItems(metadata.source),
  },
];
