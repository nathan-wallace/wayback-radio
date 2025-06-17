import React, { useEffect, useRef } from 'react';
import { useRadio } from '../context/RadioContext';
import { animateScreen } from '../utils/audioUtils';

export default function ItemNavigator() {
  const { nextItem, prevItem, itemUids, itemIndex, isOn } = useRadio();
  const screenRef = useRef(null);

  // Always animate the item screen to an "on" state so the black
  // background remains visible even when the radio is off.
  useEffect(() => {
    if (screenRef.current) {
      animateScreen(screenRef, true);
    }
  }, []);

  const countText =
    isOn && itemUids && itemUids.length > 0
      ? `${itemIndex + 1} / ${itemUids.length}`
      : '';

  return (
    <div className="item-navigation">
      <button
        onClick={prevItem}
        disabled={!itemUids || itemIndex === 0}
        aria-label="Previous item"
      >
        ◀
      </button>
      <div className="item-screen">
        <div className="" ref={screenRef}>
          {countText}
        </div>
      </div>
      <button
        onClick={nextItem}
        disabled={!itemUids || itemIndex === (itemUids.length - 1)}
        aria-label="Next item"
      >
        ▶
      </button>
    </div>
  );
}
