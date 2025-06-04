import React, { useEffect, useRef } from 'react';
import { Draggable } from 'gsap/Draggable';
import { gsap } from 'gsap';
import { useRadio } from '../context/RadioContext';

gsap.registerPlugin(Draggable);

export default function VolumeKnob() {
  const { volume, setVolume } = useRadio();
  const knobRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    dragRef.current = Draggable.create(knobRef.current, {
      type: 'rotation',
      bounds: { minRotation: 0, maxRotation: 300 },
      onDrag: function () {
        const newVolume = this.rotation / 300;
        setVolume(newVolume);
        localStorage.setItem("clientVolume", newVolume);
      },
    })[0];

    // Initialize the knob position based on the current volume
    gsap.set(knobRef.current, { rotation: volume * 300 });

    return () => {
      if (dragRef.current) dragRef.current.kill();
    };
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
