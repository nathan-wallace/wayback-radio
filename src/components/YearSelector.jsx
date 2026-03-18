import React, { useEffect, useMemo, useRef } from 'react';
import { useRadio } from '../context/RadioContext';
import { loadGsap } from '../utils/gsapLoader';

function getYearDescription(option) {
  if (!option) return '';
  if (!option.hasRecordings) return 'No recordings';
  if (typeof option.count === 'number') {
    return `${option.count} recording${option.count === 1 ? '' : 's'}`;
  }
  return 'Recordings available';
}

export default function YearSelector() {
  const { year, setYear, catalog, availableYears, isCatalogLoading } = useRadio();
  const containerRef = useRef(null);
  const buttonRefs = useRef([]);
  const yearRef = useRef(year);

  const yearOptions = useMemo(
    () => (availableYearOptions.length
      ? availableYearOptions
      : availableYears.map((value) => ({
        value,
        count: null,
        hasRecordings: true,
        label: `${value} — Recordings available`
      }))),
    [availableYearOptions, availableYears]
  );

  useEffect(() => {
    yearRef.current = year;
  }, [year]);

  useEffect(() => {
    buttonRefs.current = buttonRefs.current.slice(0, yearOptions.length);
  }, [yearOptions]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || yearOptions.length === 0) return undefined;

    let dragInstance;

    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const center = container.scrollLeft + container.clientWidth / 2;
        const years = container.querySelectorAll('.year:not(.year-disabled)');
        let closest = null;
        let minDiff = Infinity;

        years.forEach((el) => {
          const elCenter = el.offsetLeft + el.offsetWidth / 2;
          const diff = Math.abs(elCenter - center);
          if (diff < minDiff) {
            minDiff = diff;
            closest = el;
          }
        });

        if (closest) {
          const newYear = Number.parseInt(closest.textContent, 10);
          if (newYear !== yearRef.current) {
            setYear(newYear);
          }
        }
      }, 50);
    };

    container.addEventListener('scroll', handleScroll);
    loadGsap().then(({ Draggable }) => {
      dragInstance = Draggable.create(container, {
        type: 'scrollLeft',
        inertia: true,
        edgeResistance: 0.85
      })[0];
    });

    return () => {
      if (dragInstance) dragInstance.kill();
    };
  }, [catalog, setYear]);

  useEffect(() => {
    const selectedIndex = yearOptions.findIndex((option) => option.value === year);
    if (selectedIndex === -1) return;

    const selectedButton = buttonRefs.current[selectedIndex];
    if (selectedButton) {
      selectedButton.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [year, catalog]);

  return (
    <div className="year-indicator-wrapper" style={{ position: 'relative' }}>
      <label className="sr-only" htmlFor="year-selector-mobile">Choose a recording year</label>
      <select
        id="year-selector-mobile"
        className="year-select-mobile"
        value={year}
        onChange={(event) => setYear(Number.parseInt(event.target.value, 10))}
        aria-label="Choose a recording year"
      >
        {yearOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <div
        className="year-indicator"
        ref={containerRef}
        role="listbox"
        aria-label="Recording years"
        aria-orientation="horizontal"
        aria-activedescendant={`year-option-${year}`}
      >
        <div className="years">
          {catalog.map((entry) => {
            const isDisabled = entry.itemCount === 0;
            const isLoadingEntry = entry.itemCount == null || isCatalogLoading;
            const title = isDisabled
              ? `${entry.year}: no playable recordings cataloged`
              : `${entry.year}: ${entry.itemCount ?? '…'} playable recordings`;

            return (
              <span
                key={entry.year}
                className={`year ${entry.year === year ? 'active' : ''} ${isDisabled ? 'year-disabled' : ''} ${isLoadingEntry ? 'year-loading' : ''}`}
                onClick={() => {
                  if (!isDisabled) {
                    setYear(entry.year);
                  }
                }}
                style={{
                  opacity: isDisabled ? 0.45 : 1,
                  cursor: isDisabled ? 'not-allowed' : 'pointer'
                }}
                title={title}
                aria-disabled={isDisabled}
              >
                {entry.year}
              </span>
            );
          })}
          {!catalog.length && availableYears.map((availableYear) => (
            <span key={availableYear} className={`year ${availableYear === year ? 'active' : ''}`}>
              {availableYear}
            </span>
          ))}
        </div>
      </div>
      <div className="indicator" aria-hidden="true"></div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {(() => {
          const selectedOption = yearOptions.find((option) => option.value === year);
          return selectedOption ? `Selected year ${selectedOption.label}.` : '';
        })()}
      </div>
    </div>
  );
}
