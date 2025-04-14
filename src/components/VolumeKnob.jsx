// VolumeKnob.jsx
import React, { useEffect, useRef } from 'react';
import { Draggable } from 'gsap/Draggable';
import { gsap } from 'gsap';
import { useRadio } from '../context/RadioContext';

gsap.registerPlugin(Draggable);

export default function VolumeKnob() {
  const { state, dispatch } = useRadio();
  const { volume } = state;
  const knobRef = useRef(null);

  useEffect(() => {
    Draggable.create(knobRef.current, {
      type: 'rotation',
      bounds: { minRotation: 0, maxRotation: 300 },
      onDrag: function () {
        const newVolume = this.rotation / 300;
        dispatch({ type: 'SET_VOLUME', payload: newVolume });
      },
    });
    gsap.set(knobRef.current, { rotation: volume * 300 });
  }, [dispatch, volume]);

  return (
    <div className="knob-container">
      <div className="knob-wrapper">
        <div className="knob volume-knob" ref={knobRef}></div>
      </div>
      <div className="knob-label">Volume</div>
    </div>
  );
}
