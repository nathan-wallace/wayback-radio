import { debounce } from '../DebounceService.jsx';

jest.useFakeTimers();

describe('debounce', () => {
  test('calls the wrapped function only once within delay', () => {
    const fn = jest.fn();
    const debouncedFn = debounce(fn, 500);

    // call multiple times quickly
    debouncedFn();
    debouncedFn();
    debouncedFn();

    // Fast-forward time
    jest.runAllTimers();

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
