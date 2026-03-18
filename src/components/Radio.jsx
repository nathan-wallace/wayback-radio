// Radio.jsx
import React, {
  useReducer,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useState
} from 'react';
import { RadioContext } from '../context/RadioContext';
import {
  fetchAvailableYears,
  fetchAudioByYear,
  fetchAudioById,
  mergeCatalogYearEntry
} from '../services/AudioService';
import { useAudioManager } from '../hooks/useAudioManager';
import DisplayScreen from './DisplayScreen';
import ItemNavigator from './ItemNavigator';
import Button from './Button';
import YearSelector from './YearSelector';
import './Radio.css';

const initialState = {
  year: 1940,
  audioUrl: null,
  volume: 0.5,
  isOn: false,
  metadata: null,
  catalog: [],
  catalogSource: null,
  itemUids: [],
  itemIndex: 0,
  isLoading: false,
  isCatalogLoading: true,
  error: null,
};

function radioReducer(state, action) {
  switch (action.type) {
    case 'SET_YEAR':
      return { ...state, year: action.payload };
    case 'SET_AUDIO_URL':
      return { ...state, audioUrl: action.payload };
    case 'SET_VOLUME':
      return { ...state, volume: action.payload };
    case 'SET_IS_ON':
      return { ...state, isOn: action.payload };
    case 'SET_METADATA':
      return { ...state, metadata: action.payload };
    case 'SET_CATALOG': {
      const nextCatalog = typeof action.payload === 'function'
        ? action.payload(state.catalog)
        : action.payload;
      return { ...state, catalog: nextCatalog };
    }
    case 'SET_CATALOG_SOURCE':
      return { ...state, catalogSource: action.payload };
    case 'SET_ITEM_UIDS':
      return { ...state, itemUids: action.payload };
    case 'SET_ITEM_INDEX':
      return { ...state, itemIndex: action.payload };
    case 'SET_IS_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_IS_CATALOG_LOADING':
      return { ...state, isCatalogLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

export default function Radio() {
  const [state, dispatch] = useReducer(radioReducer, initialState);
  const [initialParams, setInitialParams] = useState(null);
  const [overrideAudio, setOverrideAudio] = useState(false);
  const [initComplete, setInitComplete] = useState(false);
  const initStartedRef = useRef(false);

  const {
    year,
    audioUrl,
    volume,
    isOn,
    metadata,
    catalog,
    catalogSource,
    itemUids,
    itemIndex,
    isLoading,
    isCatalogLoading,
    error
  } = state;
  const screenRef = useRef(null);

  const availableYears = useMemo(
    () => catalog
      .filter((entry) => entry.itemCount !== 0)
      .map((entry) => entry.year),
    [catalog]
  );

  const catalogByYear = useMemo(
    () => new Map(catalog.map((entry) => [entry.year, entry])),
    [catalog]
  );

  const setYear = useCallback(
    (nextYear) => dispatch({ type: 'SET_YEAR', payload: nextYear }),
    []
  );
  const setAudioUrl = useCallback(
    (nextAudioUrl) => dispatch({ type: 'SET_AUDIO_URL', payload: nextAudioUrl }),
    []
  );
  const setVolume = useCallback(
    (nextVolume) => dispatch({ type: 'SET_VOLUME', payload: nextVolume }),
    []
  );
  const setIsOn = useCallback(
    (nextIsOn) => dispatch({ type: 'SET_IS_ON', payload: nextIsOn }),
    []
  );
  const setMetadata = useCallback(
    (nextMetadata) => dispatch({ type: 'SET_METADATA', payload: nextMetadata }),
    []
  );
  const setCatalog = useCallback(
    (entriesOrUpdater) => dispatch({ type: 'SET_CATALOG', payload: entriesOrUpdater }),
    []
  );
  const setCatalogSource = useCallback(
    (nextCatalogSource) => dispatch({ type: 'SET_CATALOG_SOURCE', payload: nextCatalogSource }),
    []
  );
  const setItemUids = useCallback(
    (uids) => dispatch({ type: 'SET_ITEM_UIDS', payload: uids }),
    []
  );
  const setItemIndex = useCallback(
    (index) => dispatch({ type: 'SET_ITEM_INDEX', payload: index }),
    []
  );
  const setIsLoading = useCallback(
    (nextIsLoading) => dispatch({ type: 'SET_IS_LOADING', payload: nextIsLoading }),
    []
  );
  const setIsCatalogLoading = useCallback(
    (nextValue) => dispatch({ type: 'SET_IS_CATALOG_LOADING', payload: nextValue }),
    []
  );
  const setError = useCallback(
    (nextError) => dispatch({ type: 'SET_ERROR', payload: nextError }),
    []
  );

  const ensureCatalogYear = useCallback((targetYear, entryPatch = {}) => {
    setCatalog((currentCatalog) => mergeCatalogYearEntry(currentCatalog, targetYear, entryPatch));
  }, [setCatalog]);

  const playItemByIndex = useCallback(async (idx) => {
    if (idx < 0 || idx >= itemUids.length) return;
    setIsLoading(true);
    const result = await fetchAudioById(itemUids[idx]);
    setAudioUrl(result.audioUrl);
    setMetadata(result.metadata);
    setError(result.error);
    setIsLoading(false);
    setItemIndex(idx);
  }, [itemUids, setIsLoading, setAudioUrl, setMetadata, setError, setItemIndex]);

  const nextItem = useCallback(() => {
    if (itemIndex < itemUids.length - 1) {
      playItemByIndex(itemIndex + 1);
    }
  }, [itemIndex, itemUids.length, playItemByIndex]);

  const prevItem = useCallback(() => {
    if (itemIndex > 0) {
      playItemByIndex(itemIndex - 1);
    }
  }, [itemIndex, playItemByIndex]);

  useAudioManager(audioUrl, isOn, volume);

  useEffect(() => {
    const savedVolume = localStorage.getItem('clientVolume');
    if (savedVolume) setVolume(parseFloat(savedVolume));
  }, [setVolume]);

  useEffect(() => {
    async function loadCatalog() {
      setIsCatalogLoading(true);
      const catalogResult = await fetchAvailableYears();
      setCatalog(catalogResult.entries || []);
      setCatalogSource(catalogResult.source || null);
      if (catalogResult.error) {
        setError(catalogResult.error);
      }
      setIsCatalogLoading(false);
    }

    loadCatalog();
  }, [setCatalog, setCatalogSource, setError, setIsCatalogLoading]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const yearParam = params.get('year');
    const autoplayParam = params.get('autoplay');
    const audioIdParam = params.get('audioId');
    const audioTitleParam = params.get('audioTitle');
    setInitialParams({
      year: yearParam,
      autoplay: autoplayParam,
      audioId: audioIdParam,
      audioTitle: audioTitleParam,
    });
  }, []);

  useEffect(() => {
    if (!initialParams || isCatalogLoading || initComplete || initStartedRef.current) return;
    initStartedRef.current = true;

    let initYear = availableYears[0] ?? year;

    if (initialParams.year) {
      const urlYear = parseInt(initialParams.year, 10);
      if (!Number.isNaN(urlYear)) {
        initYear = urlYear;

        if (!catalogByYear.has(urlYear)) {
          ensureCatalogYear(urlYear, {
            itemCount: 0,
            sampleItemIds: [],
            status: 'uncatalogued'
          });
        }
      }
    }

    async function initAudio() {
      if (initialParams.audioId) {
        setOverrideAudio(true);
        setIsLoading(true);
        const result = await fetchAudioById(initialParams.audioId);
        setAudioUrl(result.audioUrl);
        setMetadata(result.metadata);
        setError(result.error);
        setItemUids([initialParams.audioId]);
        setItemIndex(0);
        setIsLoading(false);

        if (result.metadata && result.metadata.date) {
          const metadataYear = parseInt(result.metadata.date, 10);
          if (!Number.isNaN(metadataYear)) {
            const existingEntry = catalogByYear.get(metadataYear);
            ensureCatalogYear(metadataYear, {
              itemCount: existingEntry?.itemCount ?? Math.max(result.audioUrl ? 1 : 0, 0),
              sampleItemIds: existingEntry?.sampleItemIds || [initialParams.audioId],
              status: result.audioUrl ? 'ready' : 'empty'
            });
            initYear = metadataYear;
          }
        }
      } else {
        const result = await fetchAudioByYear(initYear, initialParams.audioTitle);
        setAudioUrl(result.audioUrl);
        setMetadata(result.metadata);
        setItemUids(result.itemUids || []);
        setItemIndex(0);
        setError(result.error);

        const existingEntry = catalogByYear.get(initYear);
        ensureCatalogYear(initYear, {
          itemCount: existingEntry?.itemCount ?? (result.itemUids?.length || (result.audioUrl ? 1 : 0)),
          sampleItemIds: existingEntry?.sampleItemIds?.length
            ? existingEntry.sampleItemIds
            : (result.itemUids || []).slice(0, 3),
          status: result.audioUrl ? 'ready' : 'empty'
        });
      }

      setYear(initYear);
      if (initialParams.autoplay && initialParams.autoplay.toLowerCase() === 'true') {
        setIsOn(true);
      }
      setInitComplete(true);
    }

    initAudio();
  }, [
    initialParams,
    isCatalogLoading,
    initComplete,
    availableYears,
    year,
    catalogByYear,
    ensureCatalogYear,
    setYear,
    setIsOn,
    setAudioUrl,
    setMetadata,
    setError,
    setIsLoading,
    setItemUids,
    setItemIndex
  ]);

  useEffect(() => {
    if (!initComplete || overrideAudio) return;

    const selectedCatalogEntry = catalogByYear.get(year);
    if (selectedCatalogEntry && selectedCatalogEntry.itemCount === 0) {
      setAudioUrl(null);
      setMetadata(null);
      setItemUids(selectedCatalogEntry.sampleItemIds || []);
      setItemIndex(0);
      setError(`No playable recordings cataloged for ${year}.`);
      return;
    }

    (async () => {
      setIsLoading(true);
      const result = await fetchAudioByYear(year);
      setAudioUrl(result.audioUrl);
      setMetadata(result.metadata);
      setItemUids(result.itemUids || []);
      setItemIndex(0);
      setError(result.error);
      setIsLoading(false);

      ensureCatalogYear(year, {
        itemCount: selectedCatalogEntry?.itemCount ?? (result.itemUids?.length || (result.audioUrl ? 1 : 0)),
        sampleItemIds: selectedCatalogEntry?.sampleItemIds?.length
          ? selectedCatalogEntry.sampleItemIds
          : (result.itemUids || []).slice(0, 3),
        status: result.audioUrl ? 'ready' : 'empty'
      });

      const currentIndex = availableYears.indexOf(year);
      const nextYear = availableYears[currentIndex + 1];
      if (nextYear) fetchAudioByYear(nextYear);
      const prevYear = availableYears[currentIndex - 1];
      if (prevYear) fetchAudioByYear(prevYear);
    })();
  }, [
    year,
    availableYears,
    catalogByYear,
    overrideAudio,
    initComplete,
    ensureCatalogYear,
    setAudioUrl,
    setMetadata,
    setError,
    setIsLoading,
    setItemUids,
    setItemIndex
  ]);

  useEffect(() => {
    if (!initComplete) return;
    const params = new URLSearchParams(window.location.search);
    params.set('year', year);
    if (isOn) {
      params.set('autoplay', 'true');
    } else {
      params.delete('autoplay');
    }
    if (overrideAudio && initialParams && initialParams.audioId) {
      params.set('audioId', initialParams.audioId);
    } else {
      params.delete('audioId');
    }
    const newUrl = window.location.pathname + '?' + params.toString();
    window.history.replaceState({}, '', newUrl);
  }, [year, isOn, overrideAudio, initialParams, initComplete]);

  const contextValue = useMemo(
    () => ({
      year,
      setYear,
      audioUrl,
      setAudioUrl,
      volume,
      setVolume,
      isOn,
      setIsOn,
      metadata,
      setMetadata,
      catalog,
      catalogSource,
      availableYears,
      setCatalog,
      itemUids,
      itemIndex,
      nextItem,
      prevItem,
      isLoading,
      isCatalogLoading,
      setIsLoading,
      error,
      setError,
      screenRef,
    }),
    [
      year,
      audioUrl,
      volume,
      isOn,
      metadata,
      catalog,
      catalogSource,
      availableYears,
      itemUids,
      itemIndex,
      isLoading,
      isCatalogLoading,
      error,
      setYear,
      setAudioUrl,
      setVolume,
      setIsOn,
      setMetadata,
      setCatalog,
      nextItem,
      prevItem,
      setIsLoading,
      setError
    ]
  );

  return (
    !initComplete ? (
      <div className="radio-loading">Loading…</div>
    ) : (
      <RadioContext.Provider value={contextValue}>
        <div className="radio-frame">
          <DisplayScreen />
          <YearSelector />
          <div className="controls">
            <ItemNavigator />
            <Button />
          </div>
        </div>
      </RadioContext.Provider>
    )
  );
}
