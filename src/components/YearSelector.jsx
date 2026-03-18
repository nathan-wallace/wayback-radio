import React, { useEffect, useRef } from 'react';
import { useRadio } from '../context/RadioContext';
import { loadGsap } from '../utils/gsapLoader';

export default function YearSelector() {
  const { year, setYear, catalog, availableYears, isCatalogLoading } = useRadio();
  const containerRef = useRef(null);
  const yearRef = useRef(year);

  useEffect(() => {
    yearRef.current = year;
  }, [year]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let scrollTimeout;
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
        edgeResistance: 0.85,
        onDrag: handleScroll
      })[0];
    });

    return () => {
      clearTimeout(scrollTimeout);
      container.removeEventListener('scroll', handleScroll);
      if (dragInstance) dragInstance.kill();
    };
  }, [catalog, setYear]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeEl = container.querySelector('.year.active');
    if (activeEl) {
      const scrollLeft =
        activeEl.offsetLeft - container.clientWidth / 2 + activeEl.offsetWidth / 2;
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, [year, catalog]);

  return (
    <div className="year-indicator-wrapper" style={{ position: 'relative' }}>
      <div className="year-indicator" ref={containerRef}>
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
      <div className="indicator"></div>
    </div>
  );
}
