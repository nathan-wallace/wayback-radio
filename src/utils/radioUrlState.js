const DEFAULT_ROUTE_STATE = {
  year: null,
  itemId: null,
  autoplay: false
};

function normalizeYear(value) {
  if (value == null || value === '') {
    return null;
  }

  const parsedYear = Number.parseInt(value, 10);
  return Number.isNaN(parsedYear) ? null : parsedYear;
}

function normalizeItemId(value) {
  if (!value) {
    return null;
  }

  return value.trim() || null;
}

export function parseRadioUrlState(search = window.location.search) {
  const params = new URLSearchParams(search);

  return {
    year: normalizeYear(params.get('year')),
    itemId: normalizeItemId(params.get('itemId') || params.get('audioId')),
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
  }

  if (normalizedState.autoplay) {
    params.set('autoplay', 'true');
  }

  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ''}${hash || ''}`;
}
