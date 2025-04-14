// Button.jsx
import React from 'react';
import { useRadio } from '../context/RadioContext';

export default function Button() {
  const { state, dispatch } = useRadio();
  const { isOn } = state;

  const handleClick = () => {
    dispatch({ type: 'SET_IS_ON', payload: !isOn });
  };

  return (
    <button onClick={handleClick}>
      {isOn ? 'Turn Off' : 'Turn On'}
    </button>
  );
}