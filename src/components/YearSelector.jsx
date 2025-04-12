import React, { useEffect, useRef } from 'react';
import { Draggable } from 'gsap/Draggable';
import gsap from 'gsap';
import { useRadio } from '../context/RadioContext';

gsap.registerPlugin(Draggable);

export default function YearSelector() {
  const { year, setYear, availableYears } = useRadio();
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let scrollTimeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const center = container.scrollLeft + container.clientWidth / 2;
        const years = container.querySelectorAll('.year');
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
          const newYear = parseInt(closest.textContent);
          if (newYear !== year) {
            setYear(newYear);
          }
        }
      }, 50); // Reduced debounce delay for tighter sync
    };

    container.addEventListener('scroll', handleScroll);
    const dragInstance = Draggable.create(container, {
      type: 'scrollLeft',
      inertia: true,
      edgeResistance: 0.85,
      onDrag: handleScroll
    })[0];

    return () => {
      container.removeEventListener('scroll', handleScroll);
      dragInstance.kill();
    };
  }, [year, availableYears]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollToActive = () => {
      const activeEl = container.querySelector('.year.active');
      if (activeEl) {
        const scrollLeft =
          activeEl.offsetLeft - container.clientWidth / 2 + activeEl.offsetWidth / 2;
        container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    };

    scrollToActive();
  }, [year]);

  return (
    <div className="year-indicator-wrapper" style={{ position: 'relative' }}>
      <div className="year-indicator" ref={containerRef}>
        <div className="years">
          {availableYears.map((y) => (
            <span key={y} className={`year ${y === year ? 'active' : ''}`} onClick={() => setYear(y)}>
              {y}
            </span>
          ))}
        </div>
      </div>
      <div className="indicator"></div>
    </div>
  );
}