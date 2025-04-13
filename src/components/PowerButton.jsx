import React, { useRef, useEffect } from 'react';
import { useRadio } from '../context/RadioContext';
import { animateScreen } from '../utils/audioUtils';
import { Howl } from 'howler';
import gsap from 'gsap';

const click = new Howl({ src: ['./sounds/click.webm'], volume: 0.3 });

export default function PowerButton() {
  const { isOn, setIsOn, screenRef } = useRadio();
  const buttonRef = useRef(null);
  const playRef = useRef(null);
  const pauseRef = useRef(null);
  const indicatorRef = useRef(null);

  useEffect(() => {
    const indicator = indicatorRef.current;

    if (isOn) {
      gsap.to(indicator, { backgroundColor: '#4CAF50', boxShadow: '0 0 8px #4CAF50', duration: 0.4 });
    } else {
      gsap.to(indicator, { backgroundColor: '#000', boxShadow: '0 0 0 #000', duration: 0 });
    }
  }, [isOn]);

  const handlePowerToggle = async () => {
    click.play();
    await animateScreen(screenRef, !isOn);
    setIsOn(prev => !prev);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <button
        ref={buttonRef}
        onClick={handlePowerToggle}
        title='Play/Pause'
      >
        <div
        ref={indicatorRef}
        style={{
          width: '.75rem',
          height: '.75rem',
          borderRadius: '0.75rem',
          backgroundColor: '#000',
        }}
      />
        <svg 
          width="100%" 
          height="100%" 
          viewBox="0 0 104 64" 
          fill="#e2e2e2" 
          xmlns="http://www.w3.org/2000/svg" 
          preserveAspectRatio="xMinYMid"
        >
          <g transform="translate(-20, 0)">
            <polygon points="24,18 24,46 46,32" fill="#e2e2e2"></polygon>
            <polygon points="60,18 66,18 60,46 54,46" fill="#e2e2e2"></polygon>
            <rect x="82" y="18" width="8" height="28" fill="#e2e2e2"></rect>
            <rect x="94" y="18" width="8" height="28" fill="#e2e2e2"></rect>
          </g>
        </svg>
      </button>
    </div>
  );
}