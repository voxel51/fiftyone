# MCAP correctness E2E proposal

## Status

Implemented in the `wt-mm-mcap-e2e` fork as one coherent correctness suite. The
runtime fixture factory, fixtures A and B, unsupported fixture, one-hour mixed
fixture, shared episode and Explorer POMs, dataset/Explorer coverage,
source-boundary assertions, long-duration seek/scrub/boundary assertions, and
fixture/unit regressions are present. Before the review reconciliation, the
repository flaky-test checker passed all six browser tests across ten repeats.
After review-driven assertion, fixture, and isolation hardening, the full
six-test suite also passes a focused dev-build acceptance run.

The remaining proposal stages are deliberately still later work: remote URL
serving, long-fixture rear-camera range assertions, image/detection overlay
anchors, spatial stream switching, long-fixture diagnostic/log anchors, and
short-to-long-to-short navigation. Production-build execution also remains
separate from the completed dev-build acceptance run.

### Reconciliation with current source

Implementation established these source contracts and refined the proposal
accordingly:

- `@mcap/core` works directly in the CommonJS-oriented `e2e-pw` project.
  JSON-schema `CompressedImage`, `PointCloud2`, `LaserScan`, log,
  pose/odometry, diagnostics, detections, and generic records activate the
  intended end-to-end paths. `/tf` and `/tf_static` use deterministic Foxglove
  protobuf `FrameTransform` messages, matching the dynamic and static transform
  decoder contracts respectively.
- Epoch-valued message timestamps alone do not select the absolute timeline.
  Absolute fixtures must set MCAP channel metadata `timeline_mode=absolute`;
  relative fixture B intentionally omits it.
- The episode shell exposes channels through a **Topics** tab. “Stream
  inventory” remains the conceptual contract in this document, while the POM
  uses the current user-visible label.
- Step size is controlled by the user-visible episode data-sampling setting,
  not inferred from an MCAP channel's native message rate. Tests select 1 Hz
  for A and 2 Hz for B and the long fixture, then assert the resulting
  one-second and half-second steps. This remains UI-observable correctness
  coverage and does not use a product test hook.
- Exact end-of-timeline interaction is a playhead drag because the loop-end
  handle occupies the ruler's 100% click coordinate. A stable selector was
  added only to the existing playhead handle so Playwright can perform that
  real gesture.
- The long backward-seek scenario exposed a product correctness defect: the
  shared demand bridge's leading-only throttle could permanently discard the
  final rapid playhead change. The bridge now retains a trailing fill for the
  latest playhead, with focused unit regression coverage.
- The six cases share immutable runtime fixtures and one dataset inside a
  serial suite. This deliberately trades file-level parallelism for isolation:
  each worker otherwise regenerates the 8 MiB fixture and creates an extra
  server/database lifecycle, while the tests themselves do not share mutable
  playback state.

## Goal

Add a small Playwright suite under `e2e-pw` that proves the multimodal MCAP
experience works through the real FiftyOne app. The suite should catch failures
in source loading, stream discovery, decoding, playback synchronization,
rendering, and sample changes.

This is a correctness suite. It should not measure startup time, throughput,
memory, buffering efficiency, or any other performance behavior. It should also
avoid product instrumentation and private runtime state. Assertions should use
what a user can see or interact with in the app.

## Non-goals

- A matrix of every MCAP container, compression, and schema variant
- Large or customer-derived recordings
- Network shaping or transport benchmarks
- Exact timing assertions while playback is running
- Broad visual snapshots of the entire modal
- Map coverage that depends on a live basemap

Decoder and container variants already have lower-level test coverage. E2E
should spend its budget on the wiring between the dataset, MCAP adapter,
episode shell, playback controls, and rendered UI.

## Product surfaces

There are two MCAP entry points, and they should remain separate test families.

### Dataset-backed episodes

A dataset containing `.mcap` samples has the `multimodal` media type. The
multimodal package supplies a custom grid renderer and a modal sample renderer.
These tests exercise the main FiftyOne workflow:

1. Create a dataset containing local MCAP files.
2. Load its grid or deep-link to a stable sample ID.
3. Open the episode modal.
4. Interact with streams, tiles, and playback controls.
5. Navigate between samples.

This should carry most of the correctness coverage.

### MCAP Explorer

MCAP Explorer opens a browser-local file or an HTTP(S) URL and feeds it into
the same episode shell. Its tests should focus on the ingress lifecycle:
validation, mount, unmount, and opening a different source.

The panel is only active while a multimodal dataset is open. Explorer-only
tests therefore still need a small multimodal host dataset.

The shared episode behavior should be asserted through one reusable POM rather
than duplicated between the modal and Explorer suites.

## Fixture strategy

### Ownership

The fixtures should belong to `e2e-pw`, next to its existing image, video, PCD,
PLY, and FO3D media factories. Generate them at test setup into unique
temporary paths instead of committing opaque binary recordings.

The generator should be deterministic and reviewable:

- fixed schemas, channels, and message order;
- fixed absolute timestamps beginning at `2024-01-01T00:00:00Z`, and fixed
  relative timestamps beginning at zero;
- no wall clock or random values;
- indexed MCAP output;
- no compression in v1;
- small image and point-cloud payloads;
- explicit expected values for each tick.

`@mcap/core` is the likely writer. Because `e2e-pw` is a separate
CommonJS-oriented Yarn project, the initial spike must prove that the package
can be used cleanly there. If it cannot, run a small ESM fixture generator as a
subprocess. The generated files should remain temporary either way.

JSON-schema messages are the preferred first format. The adapter already has
JSON decoders for useful ROS message types, and JSON keeps fixture definitions
understandable. The spike should validate that the chosen JSON image and
point-cloud schemas activate the expected tiles end to end before the rest of
the suite is built.

### Proposed fixture matrix

| Fixture                   | Contents                                                                                                                         | Contract                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `tiny-episode-a.mcap`     | Three one-second ticks; `/camera/front`, `/points`, `/log`, and `/pose`                                                          | Main grid, modal, decoding, stepping, raw-value, log, and rendering coverage                                                 |
| `tiny-episode-b.mcap`     | Four relative-time ticks at 2 Hz; landscape `/camera/rear`, portrait `/camera/side`, `/scan/rear`, and structured `/status` JSON | Source-boundary coverage across inventory, layout, timeline mode, configured step size, duration, and available capabilities |
| `unsupported.mcap`        | One valid JSON-schema channel with no previewable decoder                                                                        | Visible no-previewable-streams behavior                                                                                      |
| `long-mixed-episode.mcap` | One hour, dense 2 Hz front camera, and several lower-rate sensor and metadata channels; maximum 10 MiB                           | Long-duration seeking, dense indexes, heterogeneous stream ranges, cross-modal synchronization, gaps, and boundary behavior  |

Fixture A's image frames should have distinct solid colors and large baked-in
labels such as `A0`, `A1`, and `A2`. Its pose and log messages should also
change at every tick. The point cloud can contain a few points arranged into a
different simple shape per tick.

Fixture B should be deliberately asymmetric:

- four ticks at `0.0`, `0.5`, `1.0`, and `1.5` seconds, using relative rather
  than epoch timestamps;
- two image streams instead of one: a landscape rear camera and a portrait side
  camera;
- `LaserScan` instead of `PointCloud2` for its 3D source;
- a structured generic `/status` JSON stream instead of log and pose streams;
- no `/camera/front`, `/points`, `/log`, or `/pose` channels;
- B-specific colors, frame labels, status values, topic names, and filename.

This gives an A-to-B transition several independent signals. The stream
inventory must lose A-only topics and gain B-only topics. The default layout
must grow from one camera to two and account for different aspect ratios. The
3D tile must bind to a different schema and topic. The log capability must
disappear instead of retaining A's console tile, while the generic JSON status
remains available through the raw-message path. The playback shell must leave
absolute UTC mode, show a 1.5-second relative timeline, and step in 0.5-second
increments.

Each difference has a specific job:

| A to B difference                                       | Regression it can expose                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| Epoch timestamps to relative timestamps                 | Stale absolute-time mode or UTC readout                                   |
| 1 Hz to 2 Hz                                            | Stale configured sampling interval                                        |
| 2-second duration to 1.5-second duration                | Stale duration, loop bounds, or playhead clamping                         |
| One landscape camera to landscape plus portrait cameras | Incomplete stream replacement, missing tiles, or stale auto-layout inputs |
| `PointCloud2` to `LaserScan`                            | Stale 3D binding or failure to rebuild for a different spatial decoder    |
| Log and pose channels to generic `/status` JSON         | Stale log capability while still proving raw-message fallback on B        |
| Different topic names and visible payloads              | Source mixing that a filename-only assertion would miss                   |

B remains tiny despite covering more behavior. Its job is not to duplicate A's
happy path; it is to make stale state obvious at the source boundary.

A uses three one-second ticks because they make the primary stepping assertions
easy to read. B uses four half-second ticks so a source change must also
replace the duration. The tests configure the user-visible sampling rate to
match each fixture before asserting step size.

### Long mixed correctness fixture

`long-mixed-episode.mcap` is a separate one-hour recording, not an expanded
version of A or B. It should be physically small but contain enough real
messages to exercise dense indexes and sustained timelines. The target is 7–9
MiB with a hard 10 MiB generator limit.

One hour at 2 Hz produces 7,200 camera frames. A measurement with the current
`@mcap/core` writer, default indexes, and uncompressed chunks produced a 1.32
MiB MCAP for 7,200 1×1 raw JSON images and a 1.58 MiB MCAP for 7,200 1×1 PNG
`CompressedImage` messages. That leaves enough room for slightly larger
synthetic frames and several additional channels.

#### Channel and size budget

| Channel                    | Rate and coverage                                     | Approximate size | Main contracts                                                    |
| -------------------------- | ----------------------------------------------------- | ---------------: | ----------------------------------------------------------------- |
| `/camera/front`            | 2 Hz for the full hour: 7,200 frames                  |      2.2–3.0 MiB | Dense message indexes, exact seeks, stepping, and image rendering |
| `/camera/rear`             | 0.5 Hz from minute 10 through minute 50: 1,200 frames |      0.4–0.7 MiB | Late-starting and early-ending streams, second-camera selection   |
| `/lidar/points`            | 0.5 Hz: 1,800 messages with 12–16 points              |      0.9–1.3 MiB | Point-cloud rendering and synchronized seeks                      |
| `/scan/rear`               | 0.1 Hz: 360 small scans                               |      0.2–0.4 MiB | Alternate spatial decoder and 3D stream switching                 |
| `/odometry`                | 1 Hz: 3,600 messages                                  |      1.2–1.8 MiB | Pose, trajectories, numeric plots, and raw-message values         |
| `/camera/front/detections` | 0.5 Hz: 1,800 single-box messages                     |      0.7–1.1 MiB | Image annotation and camera synchronization                       |
| `/tf`                      | 1 Hz dynamic transform                                |      0.4–0.7 MiB | Frame composition and transform updates                           |
| `/tf_static`               | One fixed sensor transform                            |       Negligible | Static transform bootstrap                                        |
| `/status`                  | 0.2 Hz: 720 small JSON messages                       |      0.1–0.2 MiB | Generic raw records, numeric fields, and hold-last behavior       |
| `/rosout`                  | About 20 phase-change messages                        |       Negligible | Log ordering and exact event lookup                               |
| `/diagnostics`             | One message per minute                                |       Negligible | Diagnostic severity and sparse console rows                       |

The expected total is roughly 6.5–9.2 MiB. These are budget estimates, not a
reason to pad the file. The generator should fail if its output exceeds 10 MiB
and report per-channel message and payload counts so accidental fixture growth
is easy to diagnose.

#### Camera frame identity

Use small synthetic PNGs, around 32×18 pixels. Each frame should be
distinguishable without rendering expensive text:

- background color identifies the 15-minute phase;
- a small pixel strip encodes the frame number in binary;
- one corner distinguishes front and rear cameras;
- a moving square gives the detection stream an obvious target.

The frame pattern should be a pure function of timestamp and camera ID. Tests
should hardcode a small set of anchor expectations from the fixture
specification rather than import the generator's implementation. That keeps the
fixture reviewable without letting the same formula make both generation and
verification wrong in the same way.

The front camera emits 7,200 frames from `0` through `3599.5` seconds. A final
`/status` or `/rosout` marker at exactly `3600` seconds makes the episode
duration exactly one hour without requiring a 7,201st camera frame.

#### Deliberate timeline phases

- **0:00** — front camera, lidar, odometry, transforms, and status begin.
- **10:00** — rear camera begins.
- **15:00** — camera palette and detection class change.
- **29:50–30:10** — deliberate lidar gap while other streams continue.
- **30:00** — diagnostic severity changes to warning and a log marker fires.
- **40:00** — the dynamic transform changes direction.
- **45:00** — the second camera/detection phase begins.
- **50:00** — rear camera ends.
- **59:59.5** — the final front-camera frame arrives.
- **1:00:00** — the terminal status and log markers arrive.

Every value should be deterministic. Camera pixels, detection position, point
coordinates, scan ranges, odometry, transform, status counter, and diagnostic
phase should all derive from the message timestamp.

#### Correctness coverage unlocked by this fixture

- exact seeks at the start, quarter-hour, midpoint, three-quarter mark, and
  end;
- `59:59` to `1:00:00` timeline formatting;
- frame selection after large forward and backward seeks;
- 2 Hz step-forward and step-back behavior;
- playhead, loop-bound, and end-of-recording clamping;
- streams with different start and end ranges;
- hold-last behavior on sparse channels;
- missing-data behavior during the lidar gap;
- switching between camera and 3D streams;
- camera/detection, pose/point-cloud, and transform synchronization;
- logs, diagnostics, raw values, and numeric plots at known timestamps;
- navigation from a short fixture to the one-hour fixture and back without
  retaining duration or stream state.

The tests should seek to known anchors; they should never wait for an hour of
playback. This remains correctness coverage, not a performance or endurance
test.

## Proposed suites

### 1. Dataset grid and modal

Create a dataset containing fixture A, then verify:

- the custom multimodal grid renderer appears;
- the expected preview stream is selected;
- opening the grid tile produces the episode modal;
- the expected camera and point-cloud tile titles appear;
- playback controls and the UTC timestamp readout are visible;
- the viewer has no visible error state.

This test proves the main route from a FiftyOne sample filepath to the episode
shell.

### 2. Deterministic paused stepping

Open fixture A with playback paused. Assert the initial timestamp and one known
raw value. Then:

1. Click **Step forward**.
2. Wait for the visible UTC timestamp to become `00:00:01.000`.
3. Assert the tick-one raw value and log text.
4. Click **Step back**.
5. Assert the original timestamp and values return.

The timestamp is the synchronization boundary. There should be no fixed sleeps
and no access to playback internals.

Real-time play/pause can get a small smoke assertion later: the control changes
from Play to Pause and the visible time advances monotonically. It should not
assert an exact frame or elapsed duration while the clock is running.

### 3. Rendered image identity

Use the timestamp to settle on a known tick, then assert the image tile itself.
A narrowly scoped screenshot of the colored, labeled image is justified because
it proves that the decoded payload reached the renderer. Avoid a whole-modal
screenshot.

Point-cloud screenshots should come later. They add GPU and camera variance and
are not required to establish the first useful correctness loop.

### 4. Sample navigation

Create a two-sample dataset containing A followed by B. Open A, then navigate
to B and verify:

- the displayed filename changes;
- `/camera/rear`, `/camera/side`, `/scan/rear`, and `/status` appear;
- the rear and side camera tiles both render, with their distinct aspect
  ratios;
- the 3D tile binds to the laser scan rather than A's point cloud;
- B's status value appears in the raw-message view;
- `/camera/front`, `/points`, `/log`, `/pose`, and their values disappear;
- A's log console tile or log-specific controls do not survive the transition;
- the absolute UTC readout disappears and the relative duration becomes 1.5
  seconds;
- after selecting 2 Hz sampling, **Step forward** advances by 0.5 seconds
  rather than A's configured 1-second interval;
- the rendered image changes to B's expected frame.

For the timeline case, navigate back from B to A and verify that the UTC
readout, 2-second duration, and 1-second step interval return. A round trip
catches one-way cleanup that an A-to-B assertion alone would miss.

These checks should be split into focused tests even if they share the same
fixture pair: inventory/layout replacement, timeline round-trip replacement,
and decoded-content replacement. The modal persists across samples, so together
they target stale source data, stale capabilities, stale layout, and a stale
playback clock.

### 5. Explorer local-file lifecycle

With a multimodal dataset open:

1. Open MCAP Explorer.
2. Upload fixture A through the real file input.
3. Assert that A reaches the shared episode shell.
4. Unmount it and verify the picker returns.
5. Upload fixture B and assert there is no A-specific content left.

The B mount should also assert the two-camera inventory, relative timeline, and
half-second step interval after selecting 2 Hz sampling. This proves Explorer
replaces the source-oriented shell just as dataset navigation does, without
repeating every dataset-backed assertion.

Add one invalid-extension case using the visible `Choose an .mcap file` error.
URL format validation can live in the same spec, but remote byte serving should
not be part of v1.

### 6. Unsupported recording

Open `unsupported.mcap` and assert the visible `No previewable streams` state.
This is distinct from a corrupt file: the recording is valid, but the app has
nothing it can render.

Malformed and truncated MCAP coverage can be added later if it corresponds to a
product regression or a specific error-message contract.

### 7. Long-duration mixed recording

Add focused tests over `long-mixed-episode.mcap` rather than one large
scenario:

- seek to the quarter-hour anchors and assert the calculated camera, status,
  and odometry values;
- seek immediately before, inside, and after the lidar gap;
- verify rear-camera absence, presence, and disappearance across minutes 10 and
  50;
- verify the half-second camera step interval near the beginning and end;
- assert synchronized image/detection and spatial values at the midpoint;
- seek to the terminal marker and verify one-hour formatting and end clamping;
- navigate from a short fixture to the long fixture and back, asserting that
  duration and inventory change in both directions.

Keep these assertions DOM-first. A small number of targeted image or overlay
screenshots can prove rendered frame identity at selected anchors.

## POM design

Add two small POMs and extend existing ones where appropriate.

### `EpisodePom`

Own shared episode interactions and assertions:

- playback controls;
- UTC timestamp readout;
- tile titles;
- raw-message and log content;
- visible loading, empty, and error states;
- narrowly scoped rendered-image assertions.

Compose it into both `ModalPom` and `McapExplorerPom`.

### `McapExplorerPom`

Own Explorer-specific actions:

- open the panel;
- upload a local file;
- enter and submit a URL;
- unmount the active recording;
- assert picker and validation states.

The Playwright project currently maps `getByTestId()` to `data-cy`, while much
of multimodal uses `data-testid`. Prefer accessible roles, labels, and visible
text. For existing `data-testid` attributes that have no semantic equivalent,
the POM can use one small CSS-selector helper. The v1 suite should not require
new product instrumentation.

## Synchronization and assertions

Prefer assertions in this order:

1. Exact visible values: filenames, topic names, raw fields, logs, timestamps,
   and control labels.
2. Element presence and enabled state.
3. `expect.poll()` for user-visible state that settles asynchronously.
4. A targeted screenshot only when pixels are the behavior under test.

Avoid:

- `page.waitForTimeout()`;
- exact time or frame assertions during active playback;
- whole-page screenshots;
- browser clock mocking, since MCAP work crosses workers;
- mutable shared playback state between tests.

Prefer unique datasets and fixture paths when parallel workers are cheap. The
runtime one-hour fixture is intentionally generated once for this file, so its
tests run serially against one immutable dataset and reset the route/modal
state in hooks. Keep grid tests on the normal grid route.

## Remote URL coverage

Remote Explorer loading is a separate correctness contract because the source
must support HTTP byte ranges and CORS. Add it after local upload and
dataset-backed playback are stable.

The test should use a real local HTTP endpoint that correctly implements
`HEAD`, ranged `GET`, `Accept-Ranges`, `Content-Range`, and CORS. It should not
fulfill the recording with `page.route()`. The final choice can be either
FiftyOne's `/media` route or a small worker-scoped static server, but it must
work in both the split dev-server setup and the production build before
becoming shared coverage.

## Rollout

### Spike

Generate one JSON-schema `tiny-episode-a.mcap` and prove this path:

`dataset sample -> grid renderer -> modal -> timestamp -> step forward -> changed raw value`

This is the only assumption likely to reshape the fixture format. If JSON image
or point-cloud activation fails in the browser, use Foxglove protobuf payloads
while keeping the same scenario and expected values.

### First PR

- MCAP media factory
- fixture A
- shared `EpisodePom`
- dataset-backed grid/modal smoke
- exact paused-step/raw-value test
- one targeted image assertion

### Second PR

- fixture B
- round-trip source-boundary coverage for inventory, layout, capabilities, and
  timeline semantics
- `McapExplorerPom`
- Explorer upload, unmount, and remount
- unsupported fixture and empty-state assertion

### Long-fixture PR

- `long-mixed-episode.mcap` generator scenario and 10 MiB size guard
- a versioned scenario description plus independently stated anchor
  expectations
- long-duration seek and boundary specs
- heterogeneous stream-range and lidar-gap specs
- synchronized image/detection and spatial assertions
- short-to-long-to-short source replacement coverage

### Later

- remote URL serving;
- point-cloud visual coverage;
- corrupt/truncated files tied to explicit error contracts;
- additional ROS or Foxglove encodings only when they cover a known integration
  risk.

## Running and validation

Use the normal `e2e-pw` workflow:

- start `foWebServer` in the spec's `beforeAll` and stop it in `afterAll`;
- use the dev build while iterating;
- confirm the finished specs against a production build with `--workers=1`;
- run the new behaviors repeatedly with `check-flaky -r 10`;
- keep each individual test comfortably below 60 seconds because the same suite
  runs more slowly in Teams CI;
- run the `e2e-pw` type check and the affected multimodal unit tests before
  merge.

## V1 acceptance criteria

V1 is done when the suite can prove, without fixed sleeps or internal runtime
access, that:

- a dataset-backed MCAP renders in the grid and modal;
- paused stepping moves the visible clock and decoded values together;
- at least one decoded image is visually correct;
- navigating from A to the asymmetric B fixture and back replaces the stream
  inventory, layout inputs, capabilities, timeline mode, duration, and
  configured sampling interval in both directions;
- Explorer can mount, unmount, and replace a local file;
- a valid recording with no supported streams produces the intended empty
  state;
- all new tests pass ten repeated local runs and a one-worker production run.
