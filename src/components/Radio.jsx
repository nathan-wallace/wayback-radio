import React, { useMemo } from 'react';
import { RadioContext } from '../context/RadioContext';
import { useAudioManager } from '../hooks/useAudioManager';
import { useRadioController } from '../hooks/useRadioController';
import DisplayScreen from './DisplayScreen';
import ItemNavigator from './ItemNavigator';
import Button from './Button';
import YearSelector from './YearSelector';
import './Radio.css';

function buildCatalog(entries = []) {
  return entries.map((year) => ({
    year,
    itemCount: null,
    sampleItemIds: [],
    status: 'ready'
  }));
}

function buildAvailableYearOptions(catalogEntries = []) {
  return catalogEntries.map((entry) => ({
    value: entry.year,
    count: entry.itemCount,
    hasRecordings: entry.itemCount !== 0,
    label: entry.itemCount === 0
      ? `${entry.year} — No recordings`
      : entry.itemCount == null
        ? `${entry.year} — Recordings available`
        : `${entry.year} — ${entry.itemCount} recording${entry.itemCount === 1 ? '' : 's'}`
  }));
}

export default function Radio() {
  const controller = useRadioController();
  const {
    playback,
    isOn,
    volume,
    availableYears,
    filteredAvailableYears,
    filteredCatalogEntries,
    catalogSource,
    initComplete,
    sessionStatus
  } = controller;
  const { transportState, transportError } = useAudioManager(playback, isOn, volume);

  const catalog = useMemo(
    () => (filteredCatalogEntries.length ? filteredCatalogEntries : buildCatalog(filteredAvailableYears.length ? filteredAvailableYears : availableYears)),
    [availableYears, filteredAvailableYears, filteredCatalogEntries]
  );
  const availableYearOptions = useMemo(
    () => buildAvailableYearOptions(catalog),
    [catalog]
  );

  const contextValue = useMemo(() => ({
    ...controller,
    catalog,
    catalogSource: catalogSource || 'derived-from-available-years',
    availableYearOptions,
    isCatalogLoading: sessionStatus === 'booting' && catalog.length === 0,
    transportState,
    transportError,
  }), [availableYearOptions, catalog, catalogSource, controller, sessionStatus, transportError, transportState]);

  if (!initComplete) {
    return <div className="radio-loading">Loading…</div>;
  }

  return (
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
  );
}
