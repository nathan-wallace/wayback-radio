# Playwright integration plan

## Goals
- Cover the core functional flows that Jest unit tests cannot validate today.
- Keep browser tests deterministic by leaning on the existing archive bootstrap data for smoke coverage.
- Add a path for richer end-to-end tests by mocking Library of Congress API responses when needed.

## Recommended rollout
1. **Smoke coverage first**
   - Verify the radio shell renders.
   - Verify deep-link query parameters (for example `?year=1942`) keep the UI shareable.
   - Verify power, year-selection, and item-navigation controls stay enabled and visible.
2. **Deterministic API-backed flows**
   - Add Playwright route mocks for `https://www.loc.gov/search/*` and item detail requests.
   - Reuse fixture payloads checked into `tests/fixtures/` so tests do not depend on the live LOC API.
3. **Regression coverage for playback states**
   - Stub audio responses or mock `howler` in-browser to assert `buffering`, `playing`, and `paused` UI states.
   - Add functional assertions for empty years and error states.
4. **CI hardening**
   - Install Chromium in CI with `npm run test:functional:install`.
   - Run `npm run build`, Jest, and Playwright in sequence.
   - Publish Playwright traces/screenshots as artifacts on failures.

## Added in this change
- `playwright.config.js` sets up a local Vite server on port `4173`.
- `tests/functional/radio.spec.js` provides two starter smoke tests.
- `package.json` now includes Playwright scripts for running tests locally and installing browsers.

## Next implementation tasks
- Create `tests/fixtures/loc/` JSON payloads for year listings and item details.
- Add helper utilities for stubbing audio playback and LOC API responses.
- Extend coverage for year navigation, power toggling, empty states, and metadata rendering.
