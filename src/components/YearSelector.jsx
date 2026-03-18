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

export function getNextEnabledYearIndex(options, currentIndex, direction) {
  if (!Array.isArray(options) || options.length === 0) {
    return -1;
  }

  let nextIndex = currentIndex;

  do {
    nextIndex += direction;
    if (nextIndex < 0 || nextIndex >= options.length) {
      return currentIndex;
    }
  } while (!options[nextIndex]?.hasRecordings);

  return nextIndex;
}

export default function YearSelector() {
  const {
    year,
    setYear,
    catalog,
    availableYears,
    availableYearOptions = [],
    isCatalogLoading
  } = useRadio();
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
    let scrollTimeout;

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
          const newYear = Number.parseInt(closest.getAttribute('data-year'), 10);
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
      clearTimeout(scrollTimeout);
      container.removeEventListener('scroll', handleScroll);
      if (dragInstance) dragInstance.kill();
    };
  }, [yearOptions, setYear]);

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
  }, [year, yearOptions]);

  const handleKeyDown = (event, index, option) => {
    if (!option.hasRecordings) {
      return;
    }

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown': {
        event.preventDefault();
        const nextIndex = getNextEnabledYearIndex(yearOptions, index, 1);
        buttonRefs.current[nextIndex]?.focus();
        if (nextIndex !== index) {
          setYear(yearOptions[nextIndex].value);
        }
        break;
      }
      case 'ArrowLeft':
      case 'ArrowUp': {
        event.preventDefault();
        const nextIndex = getNextEnabledYearIndex(yearOptions, index, -1);
        buttonRefs.current[nextIndex]?.focus();
        if (nextIndex !== index) {
          setYear(yearOptions[nextIndex].value);
        }
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        setYear(option.value);
        break;
      }
      default:
        break;
    }
  };

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
          <option key={option.value} value={option.value} disabled={!option.hasRecordings}>
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
          {yearOptions.map((option, index) => {
            const catalogEntry = catalog.find((entry) => entry.year === option.value);
            const isDisabled = !option.hasRecordings;
            const isLoadingEntry = catalogEntry?.itemCount == null || isCatalogLoading;
            const title = `${option.value}: ${getYearDescription(option)}`;

            return (
              <button
                key={option.value}
                id={`year-option-${option.value}`}
                type="button"
                ref={(node) => {
                  buttonRefs.current[index] = node;
                }}
                className={`year ${option.value === year ? 'active' : ''} ${isDisabled ? 'year-disabled' : ''} ${isLoadingEntry ? 'year-loading' : ''}`}
                data-year={option.value}
                onClick={() => {
                  if (!isDisabled) {
                    setYear(option.value);
                  }
                }}
                onKeyDown={(event) => handleKeyDown(event, index, option)}
                title={title}
                role="option"
                aria-selected={option.value === year}
                aria-disabled={isDisabled}
                disabled={isDisabled}
                tabIndex={option.value === year ? 0 : -1}
              >
                <span className="year-value">{option.value}</span>
                <span className="year-meta">{getYearDescription(option)}</span>
              </button>
            );
          })}
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
