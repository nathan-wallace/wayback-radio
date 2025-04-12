import { createContext, useContext } from 'react';
export const RadioContext = createContext();
export const useRadio = () => useContext(RadioContext);