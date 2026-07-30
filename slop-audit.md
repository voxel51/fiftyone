# Multimodal package slop audit

## Baseline, boundary, and method

|                  |                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| Date             | 2026-07-29                                                                                      |
| Worktree         | `/Users/sashankaryal/fiftyone/code/voxel51/wt-mm-slop-cleanup`                                  |
| Branch           | `wt-mm-slop-cleanup`                                                                            |
| Fork base        | `7eb0ac43632302f199a9343d1584738cb34dd5f3`                                                      |
| Code cleanup tip | `1143ba92ec`                                                                                    |
| Scope            | The findings already documented in this file for `app/packages/multimodal`; no broader re-audit |
| Change rule      | Initial pass: behavior-neutral only; follow-up: only the explicitly approved §4.2–4.3 policy    |
| Excluded         | Any other runtime/product/UI/public-contract/timing/ordering/error/resource-policy change       |

This pass followed the `desloppify` audit workflow. Each existing finding was
rechecked against the fork, classified independently, and either handled with a
behavior-neutral change or retained below as report-only. Candidate findings
were never treated as permission to change behavior.

After that pass, product explicitly approved the §4.2–4.3 scene-interaction
policy: overlapping scene objects remain hovered together and render their
details as a tooltip-card stack; cursor ownership lasts until the final hover
leaves; only a primary-button, non-drag click selects; and the established
four-pixel drag tolerance remains unchanged. Commit `1143ba92ec` implements
only that approved follow-up.

The worktree was clean at the fork point except for this authorized,
source-worktree copy of `slop-audit.md`. No unrelated changes were copied in,
and all repository reads, writes, tests, and Git inspection were performed in
the worktree named above.

## Executive result

All findings that could be proved behavior-neutral within the audit boundary
were handled. The cleanup:

- removes verified zero-caller internals and legacy implementations;
- finishes internal vocabulary cleanup without changing serialized or
  performance-event strings;
- consolidates exact helper copies while preserving wrapper output, mutation,
  allocation, and call-site semantics;
- shares duplicated types without widening their shapes;
- moves the point-cloud canvas budget down to `visualization/webgpu` while
  retaining the old internal module as a compatibility re-export; and
- deliberately leaves policy, lifecycle, public-surface, error-semantic,
  resource-ordering, and candidate behavior changes report-only.

The approved follow-up also consolidates scene-object hover/click lifecycle
across annotation entities, batched cubes, and camera frustums. Hover
propagates to every ray hit so overlapping objects can stay emphasized and show
one tooltip card each; click propagation remains frontmost-only.

The package's required dependency, lint, and type check is green. Focused
Vitest coverage is green for the changed adapters, utilities, views, camera
math, persistence, measurement, and WebGPU budget code. One standalone
fake-timer assertion in `use-frame-transforms.test.tsx` still observes six
timer calls where it expects five; the changed source and test lines there are
identifier-only import/name updates, and the required package check remains
green. The test was not weakened or deleted.

## Change record

### Fixes already present at the fork base

These original audit findings were already resolved in
`7eb0ac43632302f199a9343d1584738cb34dd5f3` and were preserved:

| Fix                                                                          | Theme                |
| ---------------------------------------------------------------------------- | -------------------- |
| Deleted zero-importer `adapters/mcap/sample.ts`                              | dead code            |
| Deleted zero-importer `views/episode/stream-discovery/use-sample-streams.ts` | dead code            |
| Moved file-bottom imports in `decoded-cache-policy.ts`                       | idiom                |
| Collapsed the dead tail of `shouldPublishNetworkHealth`                      | dead differentiation |
| Reused `DEFAULT_TIMELINE_TICK_RATE_HZ` in `derivePlaybackPolicy`             | drifted constant     |
| Corrected the seek-debounce comment in `use-register-data-stream.ts`         | stale comment        |
| Corrected stale WebGPU snapshot symbol references                            | stale docs           |
| Removed foxglove barrel boilerplate and corrected the inventory comment      | comment noise        |
| Reused `safeNumber` in `query/bytes/cache.ts`                                | duplication          |

### 2. Mcap-to-Episode vocabulary

| Finding                                                                  | Resolution                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 View aliases that renamed neutral `Episode*` exports back to `Mcap*` | **Fixed.** Dropped the aliases in playback, status, prewarm, frame-transform, camera-tracking, and frame-selection code/tests.                                                                                                                                                                 |
| 2.2 Format-neutral `mcap-visual-observability` module and symbols        | **Fixed.** Renamed to `episode-visual-observability`, renamed its internal symbols, moved its test, and updated `PERFORMANCE_OBSERVABILITY.md`. Existing performance event strings remain unchanged.                                                                                           |
| 2.4 Two different exported `useSceneInventory` hooks                     | **Fixed.** Renamed the loader/deriver hook to `useSceneInventoryState`; the context hook keeps its established name.                                                                                                                                                                           |
| 2.5 Shadow `McapLaneTransportSnapshot` declaration                       | **Fixed.** The contract callback now uses the canonical `LaneTransportSnapshot` directly. The live meter remains in place.                                                                                                                                                                     |
| 2.3 Cost ledger bypasses the neutral observer seam                       | **Report-only.** Widening the observer changes diagnostic payload shape and can change publication ordering. Decide the supported neutral schema first; prove exact event order, correlation fields, and enabled/disabled behavior with observer parity tests before changing imports.         |
| 2.6 File-naming drift and duplicate basenames                            | **Report-only.** The audit does not specify canonical replacement names, and moving modules can affect deep imports, module evaluation, and tooling discovery. Choose the naming map explicitly, inventory all package/repo importers, and run build/subpath checks before a dedicated rename. |

### 3. Dead code

| Finding                                                           | Resolution                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Zero-caller bandwidth ingestion and private summarization helpers | **Fixed in the safe subset.** Removed the recorder and helpers with no callers. Retained the empty bandwidth state and `data-mcap-latency-bandwidth` publication because removing those is externally observable.                                                                    |
| Legacy full-resolution point-cloud extraction                     | **Fixed.** Removed `DecodedPointCloudData`, `extractPointCloudData`, and helpers used only by that path. The live render-data path and its shared helpers remain.                                                                                                                    |
| Seven dead `Mcap*` transform-resolution types and barrel exports  | **Fixed.** The shipped wire types remain.                                                                                                                                                                                                                                            |
| `useStreamPlaybackFrame` / `usePlaybackStreamValues`              | **Fixed.** Removed zero-caller hooks.                                                                                                                                                                                                                                                |
| Props-driven `Scene3dCameraRig`                                   | **Fixed.** Removed the zero-caller component; `Scene3dCameraRigFromStore` and its store/core remain.                                                                                                                                                                                 |
| Dead layout functions used only by their own tests                | **Fixed.** Removed `orderImageSourcesForManualSelection`, `buildAspectAwareImageLayout`, and their isolated assertions.                                                                                                                                                              |
| Zero-caller internal singles                                      | **Fixed where private:** removed `mcapCostSourceIdForTopic`, `isMcapGridPreviewRequestCancelled`, and `requiredFiniteNumber`.                                                                                                                                                        |
| Hydrate/dehydrate frame-transform shims                           | **Report-only; original finding corrected.** They normalize behaviorful Three.js values and participate in exported wire contracts, so they are not proved identity/dead. Removal needs contract tests for prototypes, normalization, and round trips plus an explicit API decision. |
| Source bootstrap subscription API                                 | **Report-only.** It is an advertised public store surface even though no in-repo React consumer exists. Removal requires a public-contract decision and downstream consumer search.                                                                                                  |
| `DecoderRegistry.list()` and `isValidNsRange`                     | **Report-only.** Test-only in this repository is not proof that an exported contract is unused. Remove only after downstream/API review and contract-test updates.                                                                                                                   |
| Export-by-reflex candidates                                       | **Report-only.** Sweeping exports changes TypeScript/public module contracts. Add `knip`/`ts-prune`, define allowed entrypoints, and review each symbol rather than deleting from grep evidence alone.                                                                               |

### 4. Policy and lifecycle duplication

The original audit correctly identified valuable consolidation targets, but
most encode behavior rather than presentation. They remain report-only unless
listed as fixed.

| Finding                                                                                                                                                                                                                               | Status, risk, and proof required                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 GPU pick-controller lifecycle ×3                                                                                                                                                                                                  | **Report-only.** Depth-function and try/finally drift may be intentional; a factory can alter disposal/readback timing. Specify the policy and prove byte/pick results, stale-generation handling, map failure, and disposal order for all three controllers.                 |
| 4.2 Scene hover/select lifecycle ×3                                                                                                                                                                                                   | **Fixed after product approval.** Shared lifecycle and the approved overlap policy are recorded below.                                                                                                                                                                        |
| 4.3 Missing right-button guard                                                                                                                                                                                                        | **Fixed after product approval.** Shared primary-button policy and proof are recorded below.                                                                                                                                                                                  |
| 4.4 GPU resource registries ×2                                                                                                                                                                                                        | **Report-only.** Lease retirement, deferred LRU, microtask timing, and disposal order are resource policy. A shared registry needs parity tests for growth, reuse, retirement, release, reset, exceptions, and use-after-release.                                             |
| 4.5 Stream sync-policy fork                                                                                                                                                                                                           | **Report-only.** Consolidation would choose between the live `UNSPECIFIED→LATEST` behaviors and can change playback selection. Decide canonical normalization, then add parity and end-to-end selection tests.                                                                |
| 4.6 Fetch-delivery pipeline ×2                                                                                                                                                                                                        | **Report-only.** Even a local closure changes call/stack boundaries around epoch checks, failure filtering, cache distribution, rebalance, and tick delivery. Characterize exact call order, thrown/rejected paths, and stale-epoch suppression first.                        |
| 4.7 Panel-visibility store/hook pipelines                                                                                                                                                                                             | **Report-only except list sanitization below.** Storage parsing, cache identity, eviction, write-back, and hook subscription timing are observable. Add local/session storage corruption, cap, remount, cross-scope, and update-normalization parity tests before extraction. |
| 4.8 Predecessor memo protocol ×2                                                                                                                                                                                                      | **Report-only.** It touches indexed predecessor hit/miss policy and reader ordering. Land/stabilize reader work, then test guard/probe identity, cache hits/misses, duplicate timestamps, cancellation, and in-flight fallback behavior.                                      |
| 4.9 Memoized reads, workers, duplicate tie-breaks, session lifecycles, decoder `numberField`, point-channel cache, extension registries, raw-image assembly, attribute rebinding, GPU growth, stream maps, and placement/runway fetch | **Report-only.** Each family contains documented semantic drift or observable capacity/order/error differences. Choose the intended policy per family and write parity/failure/resource tests before consolidation.                                                           |
| 4.9 Up-axis basis ×3                                                                                                                                                                                                                  | **Fixed.** Added one private `sceneUpVector` basis helper used by tracking, shortcuts, and viewpoint math. It returns a fresh clone on every call, preserving all mutation/allocation behavior.                                                                               |
| 4.9 Two-click ruler ×2                                                                                                                                                                                                                | **Fixed.** Shared only the character-identical state transition helper; domain distance math and wrappers remain local.                                                                                                                                                       |
| 4.9 Bounded stream-list sanitization ×2                                                                                                                                                                                               | **Fixed.** Shared the exact bounded string/dedupe primitive while preserving each caller's cap and return behavior.                                                                                                                                                           |
| 4.9 Dirty-tracking triads                                                                                                                                                                                                             | **Report-only.** Effect consolidation can alter React timing and persisted writes. Requires mount/update/unmount and fake-timer parity tests.                                                                                                                                 |

The approved §4.2–4.3 policy and proof:

- Annotation entities, batched cubes, and camera frustums share a
  hit-reference-counted hover lifecycle.
- Hover propagation remains open across ray hits. Overlapping objects retain
  independent emphasis and tooltip ownership, and their details render as an
  ordered tooltip-card stack.
- One shared cursor lease restores the prior body cursor only after the final
  hover leaves. Click propagation remains frontmost-only.
- Selection accepts only primary-button clicks at or below the existing
  four-pixel drag tolerance. Middle/right clicks neither select nor stop
  propagation, and a subsequent qualifying primary click still selects.
- Focused coverage exercises unmount, picking-disabled, record-reconciliation,
  compound-hit, cross-layer cursor, overlapping-tooltip, modifier, drag, and
  button behavior.

### 5. Utility duplication

| Finding                                                | Resolution                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `monotonicNowMs` copies                                | **Fixed.** Reused `utils/monotonic-time.ts` in render-cost, latency, worker, MCAP debug, decode meter, and network status code. Added focused fallback tests.                                                                                                                              |
| FNV-1a ×4                                              | **Fixed.** Added byte and string variants in `adapters/mcap/fnv1a.ts`; preserved seed, overflow, encoding, and caller-specific inputs. Added known-value tests.                                                                                                                            |
| Exact error-message normalization copies               | **Fixed in the proved subset.** Reused `errorMessage` in session hooks, WebGPU canvas, raw record/message, JSON, numeric-series, log, fixture, and temporal-tag sites where output was exact.                                                                                              |
| Relative-time formatting ×2                            | **Fixed.** Shared bigint splitting/formatting core; UI-specific prefixes and labels remain in local wrappers.                                                                                                                                                                              |
| Fresh empty `ReadWorkUsage` literals                   | **Fixed.** Added a factory that returns a new zero object per call; the existing bounded-read public wrapper remains.                                                                                                                                                                      |
| Duplicated type pairs                                  | **Fixed.** Shared `PointCloudSamplingSummary`, `ReferenceSelectionSource`, `ImagePixelTransform`, and `MutableVectorHandle` without widening. Compatibility re-exports are retained where consumers already import them.                                                                   |
| Rebuilt `payloadDescriptorKey`                         | **Fixed.** The decoded-output cache now uses the canonical helper.                                                                                                                                                                                                                         |
| Misnamed private `annotationStreamMatchScore`          | **Fixed.** Renamed to `streamMatchScore`.                                                                                                                                                                                                                                                  |
| Abort helpers/minting                                  | **Report-only.** Existing copies differ in optional-signal handling, constructor/message choice, and check cadence; `"AbortError"` is behaviorally load-bearing. Define one error contract and test name, message, identity, pre/post-work timing, and undefined signals before migration. |
| `lowerBoundBigInt` family                              | **Report-only.** Array shape, equality edge, and public ownership differ. Add empty/boundary/duplicate/reference parity tests and decide whether keyed upper/lower bounds share one API.                                                                                                   |
| ns-to-seconds family                                   | **Report-only.** The copies differ in sign handling, clamping, and precision loss. Choose numerical semantics and test large positive/negative deltas and rounding before replacement.                                                                                                     |
| Remaining error normalization, including video texture | **Report-only.** Although returned messages can match, moving `Error` construction changes stack/creation sites and some branches differ. Preserve until error object identity/stack is explicitly out of contract.                                                                        |
| Texture display-state copy                             | **No action; finding refuted.** Reinspection did not find an exact duplicated state transition safe to merge.                                                                                                                                                                              |

### 6. TSL typing facades

**Report-only.** The current count is 117 non-test `as unknown as` casts, 107
under `visualization`, with 33 TSL node bridges, ten production facades, and
one test facade. The four `Scene3dCameraRig` casts called out by the original
audit are not TSL casts.

A single broad `TslNode` would be runtime-neutral in emitted JavaScript, but it
can silently weaken compile-time member guarantees because the current private
node interfaces intentionally expose different method sets. This pass does not
claim that equivalence. Required proof: design domain-specific chainable
interfaces, compile-time positive/negative tests for each facade, and
emitted-JavaScript comparison for migrated modules. No casts were added.

### 7. Boundaries and placement

| Finding                                                                                                                                                                                                                                                       | Status                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebGPU foundation importing scene-3d canvas budget                                                                                                                                                                                                            | **Fixed.** Moved the dependency-free implementation and test to `visualization/webgpu`; updated internal consumers and retained the old scene-3d path as `export *` compatibility.                                                                                                                                                                               |
| `foxglove/point-cloud.ts` dead legacy half                                                                                                                                                                                                                    | **Fixed** as recorded in §3. Cross-family engine placement remains below.                                                                                                                                                                                                                                                                                        |
| `read-frame-transforms.ts`, `Scene3dTile.tsx`, camera tracking, `PointCloudSceneLayer.tsx`, health, `Base2dScene.tsx`, `PlaybackShellProps`, point-cloud/scan engine placement, headless playback placement, selection placement, and color-legend extraction | **Report-only.** File moves/extractions can change module evaluation, deep-import contracts, circularity, React hook timing, stack traces, or required/default prop behavior. For each, first freeze exports and characterize module initialization plus existing behavior; perform as a dedicated reviewed move with compatibility re-exports where applicable. |

The audit's suggestion that some of these are “S” does not prove observable
equivalence. Type-only extraction from `Base2dScene` is plausible, but the same
proposed move includes runtime rect helpers and an 18-importer contract; it
stays report-only until the split boundary is specified.

### 8. React and TypeScript idiom

| Finding                                     | Resolution                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Latest-ref pattern                          | **Fixed only for the exact render-write trios.** Added `useLatestRef` and migrated the three byte-identical `BitmapImageView` blocks. Effect-backed refs in stream registration remain because changing them to render writes changes when event handlers observe new values. |
| Duplicate settings number input             | **Fixed.** Promoted one shared `SettingsNumberInput` and removed the unused `mapping` prop.                                                                                                                                                                                   |
| Storage `PointCloudColorSettings` collision | **Fixed.** Renamed the internal persisted shape to `PersistedPointCloudColorSettings`; serialized field names and values are unchanged.                                                                                                                                       |
| `SourceReadBudgetReservation` collision     | **Report-only.** The port surface is public and the two commit arities reflect different contracts. Renaming changes exported types; decide the public vocabulary and run downstream type checks first.                                                                       |
| Tile settings registration architectures    | **Report-only candidate.** Moving state reads changes React subscription and sidebar update timing. Requires render-count, remount, stale-prop, and sidebar interaction tests.                                                                                                |

### 9. Tests

| Finding                                     | Status, risk, and required decision                                                                                                                                                                                                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production fallbacks carried for test fakes | **Report-only.** Deleting or promoting the branches changes supported inputs and read/tie-break policy. Decide whether unindexed MCAP is supported; then add a real integration test or upgrade every fake to indexed reads before branch removal.                                  |
| Split-brain decoder tests                   | **Report-only.** Relocation is product-neutral but a multi-thousand-line mechanical split can silently lose assertions or change discovery. Do it as a test-only change with before/after test and assertion counts, identical fixtures, and family registry/CDR coverage retained. |
| `query/query.test.ts` split                 | **Report-only** for the same coverage-preservation reason. First add direct client-wiring coverage, then move assertions with count and focused-suite parity.                                                                                                                       |
| Kept-for-tests surfaces                     | **Report-only.** Hydrate/dehydrate is behaviorful; the other exports may be downstream contracts. Confirm entrypoint ownership and downstream usage before removing tests, request types, or barrel exports.                                                                        |

No meaningful behavioral test was weakened or removed. Tests removed in this
pass asserted only the two deleted zero-caller layout functions.

### 10. Support directories

| Finding                                | Resolution                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate `ByteCacheReadResult` union  | **Fixed.** Named once and reused in both structures.                                                                                                                                                                                                                                        |
| Twin extension runtime subpath facades | **Report-only.** They are published package subpaths; removal is a public-contract change. The inaccurate “curated” comment was corrected. Remove only with package-export/downstream review and subpath resolution tests.                                                                  |
| Speculative extension surface          | **Report-only product decision.** Choose a supported plugin consumer or removal; test registration order, deduplication, settings, and host composition for the selected contract.                                                                                                          |
| Behavior in `ir/`                      | **Report-only candidate.** Moving builders or changing the README selects an architectural contract and may affect imports/evaluation. Decide ownership first, then move with compatibility and decoder/IR tests.                                                                           |
| Cached-byte fill critical sections     | **Report-only.** Lock duration, slot admission, in-flight registration, resolve-before-put, and failure cleanup are observable resource/ordering policy. Add concurrency traces for demand/readahead hit, miss, error, cancellation, and eviction before extraction.                        |
| Payload-identity formatting ×2         | **Report-only; exact equivalence not proved.** Registry keys retain an empty encoding while the query-side message filters falsy segments, so sharing the formatter can change error strings for invalid/empty encodings. Decide the error contract and add empty/missing/normal key tests. |

### 11. Recent sampling-cadence changes

| Finding                                                                     | Resolution                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| View-layer `timelineTickRateHz` vocabulary                                  | **Fixed.** View props now keep `timelineSamplingRateHz`; runtime `tickRateHz` remains where tick is the native concept.                                                                                                          |
| Predicate-like `validTimelineSamplingRateHz` name                           | **Fixed.** Renamed to `sanitizeTimelineSamplingRateHz`.                                                                                                                                                                          |
| Test-only singular preset map                                               | **Fixed.** Made private; tests use the public ordered preset surface.                                                                                                                                                            |
| Reset-effect comment omitted sampling changes                               | **Fixed.** Comment now describes source or sampling changes.                                                                                                                                                                     |
| Hand-rolled `stepNs` seconds conversions / proposed `TimelineIndex.stepSec` | **Report-only.** Adding a public/index field and centralizing conversion can change precision and downstream contract shape. Specify rounding/precision and test very large steps plus all construction/serialization consumers. |
| Twin throw guards                                                           | **Report-only.** Removing either changes which layer throws, error timing, and stack/message semantics for invalid direct callers. Decide the lowest-layer contract and add direct invalid-input tests before removal.           |
| Settings prop-drill via context                                             | **Report-only candidate.** Context routing changes render/subscription timing and required props. Requires sidebar update, provider absence, remount, and render-count tests.                                                    |
| `TimelinePlaybackSettings` mirrored selection state                         | **Report-only candidate.** Deriving selection changes render/effect timing and custom-draft behavior. Add preset/custom transition tests before changing state ownership.                                                        |

## Additional exact-equivalence cleanup completed

These edits implement documented sub-findings without selecting new policy:

- shared a fresh-clone up-axis basis across camera tracking, presets, and
  viewpoint math;
- shared exact two-click transition and bounded-string-list primitives;
- shared settings-number, relative-time, monotonic-time, FNV, empty-usage,
  latest-ref, reference-selection, pixel-transform, and mutable-vector types;
- replaced exact `errorMessage` copies only where string output is unchanged;
- renamed the internal persisted point-cloud settings type and stream-match
  score;
- removed zero-caller MCAP transform, stream-hook, camera-rig, layout,
  point-cloud, cost-source, cancellation, and numeric helper code; and
- retained observable empty diagnostic state, compatibility re-exports, public
  contracts, domain wrappers, and all behavior-bearing policy.

## Validation record

Validation ran from
`/Users/sashankaryal/fiftyone/code/voxel51/wt-mm-slop-cleanup/app` unless
noted.

| Validation                                                | Result                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Baseline `yarn workspace @fiftyone/multimodal check`      | **Pass** before cleanup                                                                                      |
| Incremental `check:deps`                                  | **Pass**                                                                                                     |
| Incremental `check:types`                                 | **Pass** after removing newly exposed unused imports                                                         |
| Incremental `check:lint`                                  | **Pass**; latest-ref dependency warnings were resolved without suppressions                                  |
| Focused adapter/runtime Vitest batch                      | **15 files, 196 tests passed**                                                                               |
| Focused view/visualization Vitest batch                   | **17 files, 221 tests passed**                                                                               |
| Final camera/persistence/measurement/WebGPU Vitest batch  | **8 files, 102 tests passed**                                                                                |
| Additional focused layout persistence                     | **53 tests passed**                                                                                          |
| Additional focused SourcePlayback                         | **4 tests passed**                                                                                           |
| Standalone frame-transform focused file                   | **One unchanged fake-timer mismatch:** expected 5 calls, observed 6; identifier-only diff, no test weakening |
| Final `yarn workspace @fiftyone/multimodal check`         | **Pass**: dependency architecture, lint, package-local TypeScript                                            |
| `git diff --check` before this audit update               | **Pass**                                                                                                     |
| Approved interaction focused Vitest batch                 | **8 files, 87 tests passed**: shared lifecycle, entities, cubes, frustums, tooltip stack, picking, panel     |
| Post-approval `yarn workspace @fiftyone/multimodal check` | **Pass**: dependency architecture, lint, package-local TypeScript                                            |

Focused test runs used a temporary Node local-storage file because Node 22's
ambient `localStorage` otherwise throws before the persistence tests execute.
This changes only the test process environment.

## What remains and suggested order

There is no remaining change in this audit that is proved behavior-neutral
under the task's strict boundary. Remaining work needs decisions/tests, in this
order:

1. Decide public-contract removals/renames (extension subpaths, source
   bootstrap, registry/range helpers, reservation naming).
2. Choose and characterize the remaining user-visible policies (sync
   normalization, point-cache capacity, decoder coercion, raw-image hints).
3. Add ordering/resource parity tests before pick-controller, resource
   registry, cached-fill, fetch-delivery, predecessor, worker, or memo
   consolidation.
4. Design compile-time TSL interfaces and negative type tests before replacing
   facades.
5. Perform large file and test moves as isolated, assertion-counted,
   compatibility-preserving changes.

## Tooling to hold the line

- Add `knip` or `ts-prune` only after defining the package's supported
  entrypoints; use it to review, not automatically delete, exports.
- Enable ESLint `import/first`.
- Once the cost observer seam has an approved schema, forbid `adapters/*`
  imports outside adapters.
- Keep the existing `check:deps` package-cycle gate.
