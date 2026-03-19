# Year manifest contract

`public/data/catalog/years/<year>.json` is the canonical, year-scoped source for ordered item selection. Each file must contain enough data for the controller to rebuild `itemUids`, `itemRouteIds`, the selected item identity, and the per-item display state without loading full item payloads first.

## JSON shape

```json
{
  "year": 1980,
  "generatedAt": "2026-03-19T00:00:00.000Z",
  "source": "loc-search-manifest",
  "items": [
    {
      "uid": "123456789",
      "normalizedUid": "123456789",
      "routeId": "special-1980",
      "title": "Special Match Title",
      "date": "1980",
      "contributor": "Library of Congress",
      "hasPlayableAudio": true,
      "selectionKeys": [
        "special 1980",
        "123456789",
        "special match title"
      ],
      "order": 0
    }
  ]
}
```

## Required fields

- `year`: numeric year for the file.
- `items`: ordered array in the exact next/previous playback order for that year.
- `items[].uid`: original UID when available.
- `items[].normalizedUid`: stable UID string used to rebuild `itemUids`.
- `items[].routeId`: stable route segment used for URL `itemId` lookups and deferred playback.
- `items[].title`, `items[].date`, `items[].contributor`: minimal display metadata needed before full item hydration.
- `items[].hasPlayableAudio`: whether the item participates in playback selection.
- `items[].selectionKeys`: pre-normalized identity keys, in deterministic priority order, used to resolve `requestedIdentity`.
- `items[].order`: explicit sort order so the manifest remains deterministic even if the producer reorders object keys.

## Runtime guarantees

`fetchYearManifest(year, requestedIdentity)` must return the runtime equivalent of the current selection arrays and chosen item:

- `itemUids`: all playable `normalizedUid` values in order.
- `itemRouteIds`: all playable `routeId` values in order.
- `selectedItemIdentity`: `routeId ?? normalizedUid` for the chosen item.
- `selectedItem`: the manifest row used for deferred playback metadata.
- `selectedIndex`: index of the selected playable item.

## Selection rules

1. Preserve file order for `nextItem`, `prevItem`, and `playItemByIndex`.
2. Filter to `hasPlayableAudio === true` before building `itemUids` and `itemRouteIds`.
3. Match `requestedIdentity` against each item's `selectionKeys` in array order.
4. If nothing matches, select the first playable item.
5. If no playable items exist, expose empty `itemUids` and `itemRouteIds` and no selected item.

This contract keeps URL `itemId`, deferred playback, and item stepping behavior stable while allowing `AudioService.jsx` to split around a year-manifest loader later.
