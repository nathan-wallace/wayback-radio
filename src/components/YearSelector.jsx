// YearSelector.jsx
import React, { useEffect, useRef } from 'react';
import { Draggable } from 'gsap/Draggable';
import { useRadio } from '../context/RadioContext';
import { gsap } from 'gsap';

gsap.registerPlugin(Draggable);

export default function YearSelector() {
  const { state, dispatch } = useRadio();
  const { year, availableYears } = state;
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
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
          dispatch({ type: 'SET_YEAR', payload: newYear });
        }
      }
    };

    container.addEventListener('scroll', handleScroll);
    const dragInstance = Draggable.create(container, {
      type: 'scrollLeft',
      edgeResistance: 0.8,
      inertia: true,
    })[0];

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (dragInstance) dragInstance.kill();
    };
  }, [year, availableYears, dispatch]);

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
            <span
              key={y}
              className={`year ${y === year ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'SET_YEAR', payload: y })}
            >
              {y}
            </span>
          ))}
        </div>
      </div>
      <div className="indicator"></div>
    </div>
  );
}
