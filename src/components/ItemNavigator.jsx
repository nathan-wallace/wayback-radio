import React from 'react';
import { useRadio } from '../context/RadioContext';

export default function ItemNavigator() {
  const { nextItem, prevItem, itemUids, itemIndex } = useRadio();

  if (!itemUids || itemUids.length <= 1) return null;

  return (
    <div className="item-navigation">
      <button onClick={prevItem} disabled={itemIndex === 0}>◀</button>
      <span className="item-count">{itemIndex + 1} / {itemUids.length}</span>
      <button onClick={nextItem} disabled={itemIndex === itemUids.length - 1}>▶</button>
    </div>
  );
}
