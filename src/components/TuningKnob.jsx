// components/TuningKnob.jsx
import React, { useEffect, useRef, useMemo } from 'react';
import { useRadio } from '../context/RadioContext';
import { debounce } from '../services/DebounceService';
import { loadGsap } from '../utils/gsapLoader';

export default function TuningKnob() {
  const { year, setYear, availableYears } = useRadio();
  const knobRef = useRef(null);
  const dragRef = useRef(null);

  // Create a debounced version of setYear (adjust delay as needed, currently 100ms).
  const debouncedSetYear = useMemo(() => debounce(setYear, 100), [setYear]);

  useEffect(() => {
    if (!availableYears.length) return;

    let cleanup;
    loadGsap().then(({ gsap, Draggable }) => {
      dragRef.current = Draggable.create(knobRef.current, {
        type: 'rotation',
        bounds: { minRotation: 0, maxRotation: 300 },
        inertia: true,
        onDrag: function () {
          const rawIndex = (this.rotation / 300) * (availableYears.length - 1);
          const boundedIndex = Math.max(0, Math.min(availableYears.length - 1, rawIndex));
          const interpolatedYear = availableYears[Math.round(boundedIndex)];
          debouncedSetYear(interpolatedYear);
        },
      })[0];
      cleanup = () => dragRef.current && dragRef.current.kill();
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [availableYears, debouncedSetYear]);

  // When the year changes externally, update the knob's rotation.
  useEffect(() => {
    if (!dragRef.current || dragRef.current.isDragging) return;
    loadGsap().then(({ gsap }) => {
      const index = availableYears.indexOf(year);
      if (index !== -1) {
        const targetRotation = (index / (availableYears.length - 1)) * 300;
        gsap.to(knobRef.current, {
          rotation: targetRotation,
          duration: 0.3,
          ease: 'power2.out',
        });
      }
    });
  }, [year, availableYears]);

  return (
    <div className="knob-container">
      <div className="knob-wrapper">
        <div className="knob tuning-knob" ref={knobRef}></div>
      </div>
      <div className="knob-label">Tuning</div>
    </div>
  );
}
