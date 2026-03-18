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
  const {
    year,
    setYear,
    availableYears,
    availableYearOptions = []
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
  }, [yearOptions]);

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

  const focusYearAtIndex = (index, shouldSelect = true) => {
    const nextOption = yearOptions[index];
    const nextButton = buttonRefs.current[index];

    if (!nextOption || !nextButton) return;

    nextButton.focus();
    if (shouldSelect && nextOption.value !== yearRef.current) {
      setYear(nextOption.value);
    }
  };

  const handleKeyDown = (event, index) => {
    if (yearOptions.length === 0) return;

    let nextIndex = null;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = Math.min(index + 1, yearOptions.length - 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = Math.max(index - 1, 0);
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = yearOptions.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    focusYearAtIndex(nextIndex);
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
          {yearOptions.map((option, index) => {
            const description = getYearDescription(option);
            const isSelected = option.value === year;

            return (
              <button
                key={option.value}
                id={`year-option-${option.value}`}
                ref={(element) => {
                  buttonRefs.current[index] = element;
                }}
                type="button"
                role="option"
                className={`year ${isSelected ? 'active' : ''} ${!option.hasRecordings ? 'is-empty' : ''}`}
                tabIndex={isSelected ? 0 : -1}
                aria-selected={isSelected}
                aria-label={`${option.value}. ${description}.`}
                title={option.label}
                onClick={() => setYear(option.value)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                <span className="year-value">{option.value}</span>
                <span className="year-meta" aria-hidden="true">{description}</span>
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
