# Multimodal UI cleanup audit

## Baseline and method

|          |                                                                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date     | 2026-07-13                                                                                                                                                            |
| Branch   | `sash/mm-mcap-random-fixes-3`                                                                                                                                         |
| HEAD     | `0f28cb61bf5d19c756f3902814a701e83065ecd0`                                                                                                                            |
| Scope    | UI layer of `app/packages/multimodal`: 96 non-test `.tsx` files (~29.2k lines) and 19 CSS modules (~2.2k lines)                                                       |
| Worktree | Dirty. The current MCAP map/performance work is part of the inspected snapshot. `McapNetworkStatus.tsx` is changed on the branch, but is **not** an uncommitted file. |

The first pass used six parallel reviewers over coherent slices of the package.
This revision re-checked the priority findings against the source and removed
claims that did not survive that check. It also dropped a number of minor
polish items (repeated formatter helpers, small memoization nits, inline-style
one-offs) as not worth tracking; those were curation cuts, not disproven
claims.

Evidence labels used below:

- **Verified**: direct inspection establishes the behavior, duplication, or
  dead code.
- **Candidate**: the repetition is real, but the proposed boundary still needs
  tests or design work.
- **Note**: worthwhile only while touching the file for another reason.

This is a whole-package audit, not a diff review. The worktree is moving, so
symbol names are authoritative; line numbers would go stale too quickly to be
useful.

## Executive read

The package is healthy. Its hard code is mostly hard for legitimate reasons:
MapLibre lifecycle, playback ownership, stateful MCAP history, R3F/WebGPU
resource management, and cross-tile state. Purpose comments are common, silent
catches are generally deliberate, and the package already has useful shared
primitives.

The two focused behavior bugs identified by this audit are now fixed:
annotation unmount clears an active hover, and the log follow throttle survives
fetch-state transitions. Both have regression coverage. The rest of the
high-value work is drift prevention. In particular, CPU/GPU point-cloud color
selection and the three bulk-history bridges repeat policy that needs to stay
aligned.

The main rule for cleanup here should be: **share policy and lifecycle
invariants; do not abstract code merely because it has a similar shape.**

## 1. Correctness and focused tests

### 1.1 Clear annotation hover on unmount — Verified

**Status:** Implemented with regression coverage on
`sash/mm-mcap-low-hanging-fruits`.

Previously, `SceneAnnotationEntity` cleared hover when interactivity was
disabled, but not when the entity unmounted while hovered.
`CameraFrustumSceneLayer` already handled the equivalent case through an
unmount cleanup.

- **Where:** `point-cloud/SceneAnnotationLayer.tsx`, `SceneAnnotationEntity`
- **Risk:** the upstream selected/hovered entity can remain highlighted after
  the rendered entity disappears.
- **Implemented:** keep the latest hover callback in a ref and publish `null`
  during unmount when the entity is still hovered.
- **Coverage:** hover an entity, unmount it, and assert that the parent
  receives `null` exactly once.

### 1.2 Preserve the log follow throttle across fetch state changes — Verified

**Status:** Implemented with regression coverage on
`sash/mm-mcap-low-hanging-fruits`.

Previously, the follow-playhead effect in `McapLogConsoleTile` stored
`lastPublishMs` in an effect-local variable and depended on `state.status`.
Every `loading -> ready` transition recreated the subscription and reset the
timestamp, so the nominal 500 ms throttle did not survive a fetch cycle.

- **Where:** `McapLogConsoleTile.tsx`, follow-playhead effect
- **Implemented:** store the last publish time in a ref that survives the
  loading gate.
- **Coverage:** cross a `loading -> ready` transition inside the throttle
  window and assert that it does not publish a second center time early.

### 1.3 Derive the network-status pill from one state — Verified drift risk

`McapNetworkStatusPill` independently derives `bufferingLabel`, `label`, and
`title` from the same precedence chain: placement pending, gated start, limited
network, ordinary throughput. The startup branch was recently added to all
three copies, while the tests cover only the startup label and throughput
source.

- **Where:** `McapNetworkStatus.tsx`, `McapNetworkStatusPill`
- **Change:** derive one small view model such as
  `{ kind, label, detail, title }`, then render it.
- **Test matrix:** hidden, placement pending, gated start on healthy network,
  gated start on limited network, limited throughput, ordinary throughput.

### 1.4 Decide whether scene-history access is optional — Verified inconsistency

`useMcapSceneUpdateHistoryContext` returns `EMPTY_HISTORY` without a provider.
The structurally similar location-track, pose-trajectory, frame-transform, log,
and raw-message hooks fail loudly.

- **Where:** `mcap-scene-update-history-context.tsx`
- **Change:** either throw like the sibling hooks or document and test why this
  consumer is intentionally optional. Do not change it solely for naming
  consistency.

## 2. Low-risk cleanup

These are small, independently reviewable changes.

| Finding                                             | Evidence                                                                                                                                                                             | Recommended change                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dead scene-inventory mock — **Verified**            | `use-mcap-scene-inventory.tsx` exports a hardcoded nuScenes hook with no importers and collides with the real `use-mcap-scene-inventory.ts` module                                   | Delete the `.tsx` file and run the package typecheck/tests                                                                                            |
| Wrong effect comment — **Verified**                 | The comment above the `measureArmed` effect in `McapMapLibreSurface` says it handles fit-route requests; the effect actually updates the cursor and clears measurement hover/preview | Replace it with the behavior it owns                                                                                                                  |
| Unused annotation interior variable — **Verified**  | `primitiveStyle` writes `--ann-interior`, while `.fillInterior` always uses `fill: transparent`                                                                                      | Restore `fill: var(--ann-interior, transparent)` if the near-zero fill is needed for picking; otherwise delete `INTERIOR_FILL` and the variable write |
| Dead settings selector — **Verified**               | `.row` in `McapTile.settings.module.css` is unused by every importer                                                                                                                 | Delete it                                                                                                                                             |
| Redundant pending-invalidation state — **Verified** | `WebGpuViewStage.handleReady` invalidates unconditionally, so no behavior reads the pending flag                                                                                     | Remove the flag and let pre-ready invalidation be a no-op; keep the unconditional first invalidation                                                  |
| Single-child fragments — **Verified**               | Outer fragments in `McapMapTile`, `McapPlotTile`, and `McapRawMessageTile` wrap one element                                                                                          | Remove them on next touch                                                                                                                             |
| Hardcoded log-window label — **Verified**           | `"32s"` duplicates `LOG_WINDOW_BEFORE_NS + LOG_WINDOW_AFTER_NS`                                                                                                                      | Compute the display label from the window constants                                                                                                   |
| Long-frame threshold repeated — **Verified**        | `McapPerformanceStats` embeds 50 ms in both the predicate and label                                                                                                                  | Name the threshold once                                                                                                                               |
| Stale planning language — **Verified**              | `GridRenderer` says `Denied (Phase 3 budget policy)` without defining that phase                                                                                                     | Replace it with the actual runtime constraint                                                                                                         |

## 3. Bounded refactors

These are good changes only if their tests preserve the current behavior. They
should not be mixed into one large cleanup PR.

### 3.1 Share point-cloud color policy — Verified duplication, high value

The CPU and GPU implementations repeat the canonical scalar-field list, auto
fallback order, fixed-range validation, useful-range epsilon, normalization,
and neutral fallback. That is product behavior: the same cloud should not
change color when its render path changes.

Share the decision policy while keeping representation-specific work separate.
The CPU path scans source arrays; the GPU path consumes decoder-prepared ranges
and buffers. A common helper should choose the color mode and range, not force
both renderers through one data structure.

Add parity tests for RGB, each canonical scalar fallback, height fallback,
uniform color, fixed ranges, degenerate ranges, and non-finite values.

### 3.2 Extract the bulk-history lifecycle — Candidate, high value

The location-track, scene-update-history, and pose-trajectory bridges repeat
the same source-scoped lifecycle:

- delayed start;
- stand down on constrained playback/network conditions;
- retry scheduling;
- once-per-topic bookkeeping;
- cancellation and timeout cleanup;
- bulk-priority reads.

Extract only that lifecycle. Topic-specific accumulation, truncation,
decimation, color assignment, and published state should remain in the domain
bridge. The existing `mcap-demand-bridge.ts` is a useful precedent, not an API
to copy blindly.

Add dedicated tests for `mcap-scene-update-history-context.tsx` before
extracting; it is currently the only one of the three without its own bridge
test.

### 3.3 Share image-fit sizing — Verified duplication, medium value

`imageDisplayRect`, `bitmapDrawRect`, and `gpuProjectionImagePlaneSize` repeat
contain/cover aspect-ratio math. The GPU helper returns size only; the other
two also center the result.

Extract a dependency-free fitted-size primitive and let rect callers add
centering. Preserve the existing zero-dimension guards and add parity tests
before switching all three paths.

### 3.4 Bring `McapSettingsSidebar` onto the settings primitives — Verified

`McapSettingsSidebar` reimplements `McapSettingsLabel` as `ControlLabel`, along
with a second copy of the tooltip CSS. Its two-option playback-fidelity enum
also uses a raw `<select>` even though the local settings kit recommends
`RadioGroup` for fixed two- or three-option enums.

- Reuse `McapSettingsLabel`.
- Replace the hand-rolled `::after` tooltip with the Voodo portal tooltip so it
  is not clipped by the sidebar's overflow container.
- Use `RadioGroup` for playback fidelity.
- Reconcile the touched CSS onto the package's existing tokens; do not launch a
  package-wide token rename.

### 3.5 Consolidate bigint comparison onto the existing helper — Verified duplication

`compareBigInt` is defined nine times. The package already exports
`compareBigInt`, `minBigInt`, and `maxBigInt` from `adapters/mcap/sync.ts`; do
not create another `bigint-compare.ts` by default.

Reuse the existing comparator where dependency direction permits. Some local
min/max helpers are pairwise while the exported helpers accept arrays, so keep
direct comparisons when adapting the call would make the code less clear. If
reader-layer imports make `sync.ts` the wrong home, move the existing helpers
to a lower-level module instead of adding a second canonical module.

### 3.6 Small shared policies — Verified

- Extract the temporal-tag palette and `hashLabel` used by
  `TemporalTagGridOverlay.tsx` and `use-mcap-temporal-tags.ts`.
- Route `useAddMcapFieldToPlot` through `getMcapTileDefinition`, matching the
  other open-tile hooks.
- Share the case-insensitive topic filter used by plot and raw-message
  settings.
- Move the remaining log interval/range helpers into the already-tested
  `mcap-log-console-window.ts` module and test them there.

## 4. Structural seams — Note, not backlog by themselves

Large files are not automatically bad. These splits are reasonable when the
surrounding code is already being changed:

| File                          | Natural seam                                                     |
| ----------------------------- | ---------------------------------------------------------------- |
| `McapMapTile.tsx`             | `McapMapLibreSurface` and the pure GeoJSON/source-layer builders |
| `Mcap3dTileSettings.tsx`      | The colormap editor subtree                                      |
| `ImageAnnotationsOverlay.tsx` | Pure annotation geometry helpers                                 |
| `use-mcap-modal-layout.tsx`   | `McapModalLayoutPersistence` and its persistence hooks           |
| `bitmap-image-view.tsx`       | Encoded-image dimension sniffing                                 |
| `McapSourcePlayback.tsx`      | Poster/loading scaffold                                          |
| `GridRenderer.tsx`            | `PointCloudPreviewFrame`                                         |

Do these only with stable tests around the seam. Moving a provider pyramid or
renaming files without reducing coupling is not meaningful cleanup.

## 5. Findings intentionally removed from the first draft

The following claims were either wrong, unsupported, or likely to make the code
worse:

- **Render-time `activateSource` is not an ordinary stray side effect.** Both
  `McapSourcePlayback` and the worker client document the ordering requirement,
  and the client records that effect-timed activation raced child reads. Treat
  it as an explicit architecture exception. Strengthen its test if needed; do
  not move it to `useLayoutEffect` without redesigning ownership.
- **Effect-purpose comments are a new-code rule, not a backfill mandate.** The
  requirement lives in the repo `CLAUDE.md` ("if you're adding a useEffect, add
  a comment explaining why"), not in `app/CODING_STANDARDS.md`, which currently
  covers state management only. Fix misleading or missing comments where they
  protect non-obvious behavior; do not run a package-wide comment sweep.
- **`rawTopicsPatch` has no demonstrated compaction bug.** The sibling
  compactors remove defaults or empty collections. Raw topics have no stored
  default, and setting a topic to `null` already removes the entry. A
  stale-tile claim would need a reproduction and a compactor that knows the
  live tile set.
- **The three bounded caches should not share one generic helper.** They have
  different semantics: active-mount protection, memory-only LRU promotion, and
  persisted timestamp-based eviction with sanitization. Their similar size
  limits are not a shared abstraction.
- **The calibration guard chains should stay explicit.** They have different
  messages, ordering, and terminal checks; parameterizing those differences
  would hide the product behavior.
- **Do not standardize hook suffixes, handler prefixes, component declaration
  style, or GPU filenames in a sweep.** None has a demonstrated maintenance or
  runtime cost.
- **Do not split the panel-visibility storage schema merely because it contains
  3D and image settings.** Versioned migration is the real requirement if that
  schema changes.
- **The module-level color-stop ID counter is acceptable.** IDs are created
  outside render and stored in state; global uniqueness is harmless.
  `crypto.randomUUID()` would add complexity without fixing a bug.
- **Do not derive `expandedSourceId` without preserving its current reset
  semantics.** The effect intentionally forgets a source that leaves the
  selected set; a derived value could reopen it if the source returns.
- **`PLAYBACK_HOVER_INTENT_DELAY_MS = HOVER_INTENT_DELAY_MS` is not inherently
  wrong.** The alias documents the playback concept while intentionally sharing
  the current value.
- **The settings-sidebar tab logic reads refs during render by design.**
  `selectedTab` in `McapSettingsSidebar` pre-computes the tab the layout effect
  is about to commit so the first paint shows the right one; the refs are read,
  never written, during render. Not a bug, but the protocol is subtle and
  deserves a short comment when the file is next touched.

## Execution order

1. **Completed:** Fix annotation hover cleanup and the log throttle, with
   focused regression tests.
2. Delete the dead mock and land the low-risk cleanup table as one or two small
   commits.
3. Derive the network-status view model and add the full branch matrix.
4. Reconcile the settings sidebar with the existing primitives.
5. Share point-cloud color policy with CPU/GPU parity tests.
6. Add the missing scene-history bridge tests, then extract the common
   bulk-history lifecycle.
7. Take the remaining helpers and file splits only when nearby work makes them
   cheap.

The first four steps are small and reviewable. The color-policy and
bulk-history changes carry the most long-term value, but they also deserve
isolated PRs and behavior-preserving tests.
