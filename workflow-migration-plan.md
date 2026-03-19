# Workflow migration plan

## Scope

This migration needs to cover both GitHub Actions workflows that currently depend on the archive bootstrap generator:

- `.github/workflows/pages-build-deployment.yml`
- `.github/workflows/refresh-archive-cache.yml`

## Sequence

1. **Add static dataset entry points in `package.json`.**
   - Introduce `generate:static-dataset` as the generation entry point.
   - Introduce `materialize:static-dataset` as the materialization entry point that writes `public/data/**` before `vite build` runs.
   - Keep `generate:archive-cache` in place as a compatibility shim until both workflows have moved.
2. **Move the Pages deployment workflow first.**
   - Update `.github/workflows/pages-build-deployment.yml` to call `generate:static-dataset` and `materialize:static-dataset` before `npm run build`.
   - Keep the upload path pointed at `docs/`, because `vite.config.js` still sets `build.outDir = 'docs'`.
   - Verify the built artifact contains `docs/data/**`, relying on Vite's default behavior of copying `public/**` into the configured output directory.
3. **Migrate the cache refresh workflow next.**
   - Update `.github/workflows/refresh-archive-cache.yml` after the new dataset generation/materialization flow is stable.
   - At that point, decide whether the refresh workflow should continue committing `src/data/archive-cache.json`, begin materializing `public/data/**`, or do both during the transition.
4. **Remove `generate:archive-cache` last.**
   - Only delete the legacy script once both workflows run exclusively through the new static dataset entry points.

## Deployment path guardrails

- `vite.config.js` must continue publishing to `docs/` so the Pages workflow can keep using `actions/upload-pages-artifact` with `path: docs`.
- The static dataset pipeline should write files into `public/data/**`; Vite will copy those files into `docs/data/**` during the build without extra workflow-specific copy steps.
- `touch docs/.nojekyll` remains valid after the migration because the build output directory does not change.
