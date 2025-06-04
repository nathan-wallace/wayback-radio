import React, { useEffect, useRef } from 'react';
import { Draggable } from 'gsap/Draggable';
import { gsap } from 'gsap';
import { useRadio } from '../context/RadioContext';

gsap.registerPlugin(Draggable);

export default function VolumeKnob() {
  const { volume, setVolume } = useRadio();
  const knobRef = useRef(null);

  useEffect(() => {
    Draggable.create(knobRef.current, {
      type: 'rotation',
      bounds: { minRotation: 0, maxRotation: 300 },
      onDrag: function () {
        const newVolume = this.rotation / 300;
        setVolume(newVolume);
        localStorage.setItem("clientVolume", newVolume);
      },
    });

    // Initialize the knob position based on the current volume
    gsap.set(knobRef.current, { rotation: volume * 300 });
  }, []);

  // Keep the knob position in sync if the volume changes externally
  useEffect(() => {
    if (!knobRef.current) return;
    gsap.to(knobRef.current, { rotation: volume * 300, duration: 0.2 });
  }, [volume]);

  return (
    <div className="knob-container">
      <div className="knob-wrapper">
        <div className="knob volume-knob" ref={knobRef}></div>
      </div>
      <div className="knob-label">Volume</div>
    </div>
  );
}
