const DEFAULT_ROUTE_STATE = {
  year: null,
  itemId: null,
  source: null,
  uid: null,
  audioUrl: null,
  autoplay: false
};

function normalizeYear(value) {
  if (value == null || value === '') {
    return null;
  }

  const parsedYear = Number.parseInt(value, 10);
  return Number.isNaN(parsedYear) ? null : parsedYear;
}

function normalizeParamValue(value) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return decodeURIComponent(trimmed);
  } catch (error) {
    return trimmed;
  }
}

function normalizeSource(value) {
  const normalized = normalizeParamValue(value)?.toLowerCase() || null;
  return normalized === 'uid' || normalized === 'audio-url' ? normalized : null;
}

function getParsedSelectionState(params) {
  const itemId = normalizeParamValue(
    params.get('itemId')
    || params.get('audioId')
    || params.get('audioTitle')
  );

  if (itemId) {
    return {
      itemId,
      source: null,
      uid: null,
      audioUrl: null
    };
  }

  const source = normalizeSource(params.get('source'));

  if (source === 'uid') {
    const uid = normalizeParamValue(params.get('uid'));
    if (uid) {
      return {
        itemId: null,
        source,
        uid,
        audioUrl: null
      };
    }
  }

  if (source === 'audio-url') {
    const audioUrl = normalizeParamValue(params.get('audioUrl'));
    if (audioUrl) {
      return {
        itemId: null,
        source,
        uid: null,
        audioUrl
      };
    }
  }

  return {
    itemId: null,
    source: null,
    uid: null,
    audioUrl: null
  };
}

export function parseRadioUrlState(search = window.location.search) {
  const params = new URLSearchParams(search);
  const selectionState = getParsedSelectionState(params);

  return {
    year: normalizeYear(params.get('year')),
    ...selectionState,
    autoplay: params.get('autoplay')?.toLowerCase() === 'true'
  };
}

export function serializeRadioUrlState(
  routeState,
  { pathname = window.location.pathname, hash = window.location.hash } = {}
) {
  const params = new URLSearchParams();
  const normalizedState = {
    ...DEFAULT_ROUTE_STATE,
    ...routeState
  };

  if (normalizedState.year != null) {
    params.set('year', normalizedState.year.toString());
  }

  if (normalizedState.itemId) {
    params.set('itemId', normalizedState.itemId);
  } else if (normalizedState.source === 'audio-url' && normalizedState.audioUrl) {
    params.set('source', 'audio-url');
    params.set('audioUrl', normalizedState.audioUrl);
  } else if (normalizedState.source === 'uid' && normalizedState.uid) {
    params.set('source', 'uid');
    params.set('uid', normalizedState.uid);
  }

  if (normalizedState.autoplay) {
    params.set('autoplay', 'true');
  }

  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ''}${hash || ''}`;
}
