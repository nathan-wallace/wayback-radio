import React, { useEffect, useRef } from 'react';
import { Draggable } from 'gsap/Draggable';
import gsap from 'gsap';
import { useRadio } from '../context/RadioContext';

// Real-time synced tuning knob and year selection

export default function TuningKnob() {
  const { year, setYear, availableYears } = useRadio();
  const knobRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    if (!availableYears.length) return;

    dragRef.current = Draggable.create(knobRef.current, {
      type: 'rotation',
      bounds: { minRotation: 0, maxRotation: 300 },
      inertia: true,
      onDrag: function () {
        const rawIndex = (this.rotation / 300) * (availableYears.length - 1);
        const boundedIndex = Math.max(0, Math.min(availableYears.length - 1, rawIndex));
        const interpolatedYear = availableYears[Math.round(boundedIndex)];
        setYear(interpolatedYear);
      },
    })[0];

    return () => dragRef.current.kill();
  }, [availableYears, setYear]);

  useEffect(() => {
    if (!dragRef.current || dragRef.current.isDragging) return;
    const index = availableYears.indexOf(year);
    if (index !== -1) {
      const targetRotation = (index / (availableYears.length - 1)) * 300;
      gsap.to(knobRef.current, {
        rotation: targetRotation,
        duration: 0.3,
        ease: 'power2.out',
      });
    }
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