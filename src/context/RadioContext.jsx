// RadioContext.jsx
import React, { createContext, useContext, useReducer } from 'react';

const RadioContext = createContext();

const initialState = {
  year: (() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('year') ? parseInt(urlParams.get('year'), 10) : 1940;
  })(),
  audioUrl: null,
  volume: (() => {
    const saved = localStorage.getItem("clientVolume");
    return saved ? parseFloat(saved) : 0.5;
  })(),
  isOn: false,
  metadata: null,
  availableYears: [],
  isLoading: false,
  error: null,
};

function radioReducer(state, action) {
  switch (action.type) {
    case 'SET_AVAILABLE_YEARS':
      return { ...state, availableYears: action.payload };
    case 'SET_YEAR':
      return { ...state, year: action.payload };
    case 'SET_AUDIO_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_AUDIO_DATA':
      return {
        ...state,
        audioUrl: action.payload.audioUrl,
        metadata: action.payload.metadata,
        error: action.payload.error,
      };
    case 'SET_VOLUME':
      localStorage.setItem("clientVolume", action.payload);
      return { ...state, volume: action.payload };
    case 'SET_IS_ON':
      return { ...state, isOn: action.payload };
    default:
      return state;
  }
}

export const RadioProvider = ({ children }) => {
  const [state, dispatch] = useReducer(radioReducer, initialState);

  return (
    <RadioContext.Provider value={{ state, dispatch }}>
      {children}
    </RadioContext.Provider>
  );
};

export const useRadio = () => useContext(RadioContext);
