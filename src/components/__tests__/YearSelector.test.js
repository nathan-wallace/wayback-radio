import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import YearSelector, { getNextEnabledYearIndex } from '../YearSelector';
import { RadioContext } from '../../context/RadioContext';

jest.mock('../../utils/gsapLoader', () => ({
  loadGsap: () => Promise.resolve({ Draggable: { create: () => [{ kill: jest.fn() }] } })
}));

describe('YearSelector', () => {
  it('finds the next enabled year during keyboard navigation', () => {
    const options = [
      { value: 1937, hasRecordings: true },
      { value: 1938, hasRecordings: false },
      { value: 1939, hasRecordings: true }
    ];

    expect(getNextEnabledYearIndex(options, 0, 1)).toBe(2);
    expect(getNextEnabledYearIndex(options, 2, -1)).toBe(0);
  });

  it('supports keyboard selection on the desktop year picker', () => {
    const setYear = jest.fn();

    render(
      <RadioContext.Provider value={{
        year: 1937,
        setYear,
        catalog: [
          { year: 1937, itemCount: 2 },
          { year: 1938, itemCount: 0 },
          { year: 1939, itemCount: 1 }
        ],
        availableYears: [1937, 1938, 1939],
        availableYearOptions: [
          { value: 1937, count: 2, hasRecordings: true, label: '1937 — 2 recordings' },
          { value: 1938, count: 0, hasRecordings: false, label: '1938 — No recordings' },
          { value: 1939, count: 1, hasRecordings: true, label: '1939 — 1 recording' }
        ],
        isCatalogLoading: false
      }}>
        <YearSelector />
      </RadioContext.Provider>
    );

    const currentYearButton = screen.getAllByRole('option', { name: /1937/i })[1];
    fireEvent.keyDown(currentYearButton, { key: 'ArrowRight' });

    expect(setYear).toHaveBeenCalledWith(1939);
  });
});
