# Floodlight performance contracts

Deterministic jsdom suites that run the real engine (`@fiftyone/floodlight`)
and the real host utilities (`../host`) against fake pages, and assert exact
**counts**, never timings.

- `countingRenderer.ts` — per item and per instance: looker creates,
  reattaches, refreshes, resizes, hides, detaches, and cross-instance
  violations (`show-elsewhere`, `foreign-hide`, `foreign-detach`).
- `cacheRenderer.ts` — the grid's renderer over the real looker cache:
  creates, reattaches, resizes, `isShown` skips, and blank tiles.
- `mountHost.ts` — the real host wired like `Grid.tsx`: shimmer-only interim
  builds, content builds that freeze the cache and render scoped.
- `fakePages.ts` — fixed-aspect-ratio pages and a per-key call counter.
- `environment.ts` — element sizes, `ResizeObserver`, a manual
  `requestAnimationFrame` queue, scroll positions and fake `setTimeout`.
- `mutations.ts` — row mounts and unmounts under a container.

Known violations are `test.fails`: when one starts passing, the contract is met
and the marker comes off.

```sh
cd app && yarn vitest run --no-coverage packages/floodlight-panel/src/perf
```

## Phase 2: real-browser metrics (not built)

Playwright specs against a fixture dataset, reading Chrome DevTools Protocol
tracing (paint, layout and GC events), `Performance.getMetrics` (`LayoutCount`,
`RecalcStyleCount`, `JSHeapUsedSize`) and `PerformanceObserver("layout-shift")`
in the page. Gate on counts per scenario (layouts per scroll step, layout
shifts per rebuild, frames over budget per resize drag), not milliseconds.
