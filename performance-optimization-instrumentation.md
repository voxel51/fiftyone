# MCAP Performance Optimization Instrumentation

## Baseline: local NuScenes MCAP, fresh reload, immediate play

Date: 2026-06-30

Branch: `feat/mm-pass-6-transforms`

Instrumentation commit: `6137ab088e measure mcap playback pressure`

Dataset: `nuscenes-mcap-local`

Sample id: `6a1b1814ed669ab6352e8043`

File: `NuScenes-v1.0-trainval-scene-0006.mcap`

Read profile: `local`

URL:
`http://localhost:5174/datasets/nuscenes-mcap-local?mcapLatencyDebug=1&id=6a1b1814ed669ab6352e8043&baselineRun=1782856348205`

Method:

- Enabled `mcapLatencyDebug=1`.
- Opened a fresh cache-busted sample URL.
- Clicked Play as soon as the Play control was available.
- Measured through the first 10 seconds of playback.
- Read results from `data-mcap-latency-events`, `data-mcap-latency-metrics`,
  and `data-mcap-latency-bandwidth`.
- Play was clicked at roughly 3.9 seconds from MCAP session start, or 5.55
  seconds from the browser navigation command.

## User-visible Latency

| Signal                               | Elapsed from session start | Notes                                |
| ------------------------------------ | -------------------------: | ------------------------------------ |
| Session start                        |                       0 ms | Local MCAP read profile              |
| Scene inventory ready                |                   144.4 ms | 41 topics, 24 sources                |
| Timeline index ready                 |                   151.2 ms | 585 ticks, 19.5 s duration           |
| Current frame requested              |                   163.5 ms | 1 topic                              |
| Current frame cached                 |                   363.6 ms | 200.1 ms fetch duration              |
| First lookahead batch buffered       |                   439.5 ms | 9 ticks, 1 topic                     |
| Transform bootstrap ready            |                   373.2 ms | 0 samples                            |
| Transform current window ready       |                   547.2 ms | 93 samples                           |
| Point cloud lookahead batch buffered |                   598.9 ms | 9 point cloud messages               |
| 3D layers ready                      |                   611.0 ms | 34,720 points, transformed           |
| Point cloud panel painted            |                   620.9 ms | 34,720 rendered points               |
| Playhead buffer ready                |                 2,996.5 ms | 12 streams                           |
| First playback commit                |                 3,892.2 ms | Playhead 0.042 s                     |
| Transform full range ready           |                 5,190.2 ms | 3,106 samples, 4,642.5 ms duration   |
| Startup buffer ready                 |                 5,210.4 ms | 12 streams, 9 ticks, 0.3 s lookahead |
| First 10 s stall window finished     |                16,993.5 ms | Wall window 13,112.5 ms              |

## First 10 Seconds Of Playback

| Metric                         |               Value |
| ------------------------------ | ------------------: |
| Playback window                | 0.033 s to 10.033 s |
| Wall time to complete window   |         13,112.5 ms |
| Total stalled wall time        |          3,108.2 ms |
| Loading stalled wall time      |          3,108.2 ms |
| Missing-data stalled wall time |                0 ms |
| Max single stall               |          1,800.6 ms |
| Stall count                    |                   3 |
| Stall percent                  |               23.7% |

Interpretation:

- Truthfulness looks okay in this run: playback did not stall because data was
  missing.
- Smoothness is still not good enough: local playback spent about 3.1 seconds
  stalled during the first 10 seconds.
- The largest user-visible disruption was a single 1.8 second stall.
- First 3D paint is good at about 621 ms, but the app is not ready to play
  smoothly when the user can first press Play.

## Fetch And Buffer Metrics

| Metric                          | Count |        Max |       Total |
| ------------------------------- | ----: | ---------: | ----------: |
| Current frame duration          |    12 | 2,403.3 ms |  6,709.8 ms |
| Lookahead batch duration        |    19 | 4,741.2 ms | 37,735.0 ms |
| Lookahead batch requested ticks |    19 |  150 ticks |   832 ticks |
| Background lookahead topups     |    13 |          1 |          13 |
| Buffer state loading samples    |   372 |          1 |         372 |
| Buffer state ready samples      | 1,250 |          1 |       1,250 |
| Playback commit wall delta      |   339 | 1,834.8 ms | 14,375.2 ms |

## Bandwidth Pressure

Total observed fetch pressure:

| Metric          |      Value |
| --------------- | ---------: |
| Effective bytes | 480.117 MB |
| Raw bytes       | 480.117 MB |
| Decoded bytes   | 406.762 MB |
| Requests        |         34 |
| Unique messages |      6,342 |

By operation:

| Operation                | Effective MB | Share | Requests | Unique messages |
| ------------------------ | -----------: | ----: | -------: | --------------: |
| Background lookahead     |      472.708 | 98.5% |        7 |           3,096 |
| Startup lookahead        |        7.092 |  1.5% |       12 |              44 |
| Transform range          |        0.264 |  0.1% |        1 |           3,106 |
| Current frame            |        0.045 |  0.0% |       12 |               3 |
| Transform current window |        0.008 |  0.0% |        1 |              93 |
| Transform bootstrap      |        0.000 |  0.0% |        1 |               0 |

By category:

| Category          | Effective MB | Share | Requests | Unique messages |
| ----------------- | -----------: | ----: | -------: | --------------: |
| LIDAR point cloud |      323.905 | 67.5% |        8 |             489 |
| Image             |      141.814 | 29.5% |       10 |             863 |
| Radar point cloud |       12.775 |  2.7% |       12 |           1,653 |
| Image annotations |        1.350 |  0.3% |       12 |             138 |
| Transform         |        0.272 |  0.1% |        3 |           3,199 |

By elapsed session bucket:

| Bucket | Effective MB | Share | Requests | Unique messages |
| ------ | -----------: | ----: | -------: | --------------: |
| 0-1 s  |        7.067 |  1.5% |       21 |             135 |
| 2-5 s  |       99.871 | 20.8% |        3 |             614 |
| 5-10 s |      101.071 | 21.1% |        5 |           3,757 |
| 10 s+  |      272.108 | 56.7% |        5 |           1,836 |

Top topics by effective bytes:

| Topic                                   | Effective MB | Share | Requests | Unique messages |
| --------------------------------------- | -----------: | ----: | -------: | --------------: |
| `/LIDAR_TOP`                            |      323.905 | 67.5% |        8 |             489 |
| `/CAM_FRONT_LEFT/image_rect_compressed` |       48.693 | 10.1% |        8 |             285 |
| `/CAM_BACK_RIGHT/image_rect_compressed` |       48.215 | 10.0% |        8 |             293 |
| `/CAM_FRONT/image_rect_compressed`      |       44.906 |  9.4% |        8 |             285 |
| `/RADAR_BACK_RIGHT`                     |        3.003 |  0.6% |        8 |             334 |
| `/RADAR_FRONT`                          |        2.931 |  0.6% |        8 |             326 |
| `/RADAR_BACK_LEFT`                      |        2.833 |  0.6% |        8 |             315 |
| `/RADAR_FRONT_RIGHT`                    |        2.177 |  0.5% |        8 |             338 |

## Interpretation

- Background lookahead is the dominant pressure source. It accounts for 98.5%
  of effective bytes in this baseline.
- LIDAR is the dominant data category at 67.5% of effective bytes. Images are
  next at 29.5%.
- Transform data is tiny in bytes, but the full-range transform warmup takes
  4.6 seconds. It should remain background-only and should not be allowed to
  contend with first paint or playback-critical work.
- Startup lookahead is small in bytes, but smooth playback is still not ready
  quickly enough. That points more toward scheduling, prioritization, and
  contention than simple total byte volume.
- We currently have enough instrumentation to compare user-visible latency,
  stalls, and category-level byte pressure. We now also have enough
  chunk/request visibility to start evaluating byte-level experiments, but
  those experiments should come after scheduling is improved.

## Refactor Log

### Optimization 1: Make background lookahead less greedy

Date: 2026-06-30

Run URL:
`http://localhost:5174/datasets/nuscenes-mcap-local?mcapLatencyDebug=1&id=6a1b1814ed669ab6352e8043&optimizationRun=1782857413362`

Product stance:

- The first visible 3D frame was already fast enough; the broken customer
  experience was irregular playback after pressing Play.
- Speculative future buffering should not compete equally with data needed for
  the next visible playback moment.
- Because this is greenfield, the playback pipeline should encode intent
  explicitly instead of relying on incidental request order.

High-level refactors:

- Added a resource-read priority option for synchronized MCAP batch reads:
  `current`, `playback`, and `idle`.
- Kept startup and playback-needed batches on playback priority.
- Demoted background lookahead batches to idle worker priority.
- Reduced speculative lookahead horizon from 15 s to 4 s.
- Reduced background batch size from 5 s to 1 s, capping batches at 30 ticks
  instead of 150.
- Increased background top-up cadence from 1.0 s to 0.5 s so smaller batches
  still refill steadily.
- Added a near-playhead startup-coverage gate: if the 0.3 s startup window is
  not fully covered, refill that first and defer idle background lookahead.
- Added debug metric `background lookahead deferred` to prove when the gate is
  protecting playback-critical work.
- Added tests for startup priority, idle background demotion, startup gating,
  and bounded idle background batches.

Before/after:

| Metric                               |    Baseline | Optimization 1 |       Change |
| ------------------------------------ | ----------: | -------------: | -----------: |
| First 3D paint                       |    620.9 ms |       671.5 ms |     +50.6 ms |
| Playhead buffer ready                |  2,996.5 ms |     3,341.5 ms |    +345.0 ms |
| Startup buffer ready                 |  5,210.4 ms |     3,342.4 ms |  -1,868.0 ms |
| First playback commit                |  3,892.2 ms |     3,344.3 ms |    -547.9 ms |
| First 10 s wall time                 | 13,112.5 ms |    12,248.6 ms |    -863.9 ms |
| First 10 s stalled wall time         |  3,108.2 ms |     1,712.4 ms |  -1,395.8 ms |
| Max single stall                     |  1,800.6 ms |     1,536.2 ms |    -264.4 ms |
| Stall percent                        |       23.7% |          14.0% |      -9.7 pp |
| Missing-data stalled wall time       |        0 ms |           0 ms |    unchanged |
| Total effective bytes                |  480.117 MB |     271.816 MB |  -208.301 MB |
| Background lookahead effective bytes |  472.708 MB |     263.145 MB |  -209.563 MB |
| LIDAR effective bytes                |  323.905 MB |     178.174 MB |  -145.731 MB |
| Image effective bytes                |  141.814 MB |      84.774 MB |   -57.040 MB |
| Lookahead batch max duration         |  4,741.2 ms |     2,700.9 ms |  -2,040.3 ms |
| Lookahead batch total duration       | 37,735.0 ms |    21,862.7 ms | -15,872.3 ms |
| Max lookahead ticks per batch        |         150 |             30 |         -120 |

Interpretation:

- This was a good first move: bytes dropped by 43.4%, background lookahead
  bytes dropped by 44.3%, and first-10-second stall time dropped by 44.9%.
- It is not enough. A 1.5 s max stall is still a bad playback experience.
- The remaining bottleneck is likely non-preemptive worker contention: even
  with idle priority, a background batch that has already started can still
  occupy the serial worker while a current-frame request waits behind it.
- The next refactor should attack the execution model, not just the amount of
  lookahead.

### Optimization 2: Split foreground and idle worker lanes

Date: 2026-06-30

Run URL:
`http://localhost:5174/datasets/nuscenes-mcap-local?mcapLatencyDebug=1&id=6a1b1814ed669ab6352e8043&optimizationRun=1782857623019`

Product stance:

- Optimization 1 proved that less speculative work helps, but it still left a
  1.5 s stall.
- The deeper issue is that a single serial worker cannot preempt an
  already-running idle batch.
- Playback-critical work needs an execution lane that stays responsive even
  while background lookahead is busy.
- Because this is greenfield, the resource client should model foreground
  versus idle work explicitly rather than relying only on queue priority.

High-level refactors:

- Split the worker-backed MCAP resource client into two lanes:
    - Foreground lane for current frame, placement transforms, and
      playback-critical batches.
    - Idle lane for idle prefetch, topic reads, and speculative background
      lookahead.
- Compute effective worker priority before dispatch, using caller overrides
  when present and operation defaults otherwise.
- Route idle-priority work to the idle lane and all other work to the
  foreground lane.
- Keep source ownership global: changing the active source resets both lanes so
  stale idle work cannot continue against an old source.
- Added tests proving that foreground reads use a separate worker while idle
  work is pending.
- Added tests proving source changes terminate pending idle work.

Important caveat:

- This run reported 9 active streams at the startup/playhead-ready milestones
  where the original baseline reported 12. Later cold validation still reached
  12 active topics by first playback commit, so treat the milestone counts
  carefully.
- Only the first run after a hard page refresh should be used as the
  source-of-truth number. Follow-up runs in the same browser session are warmed
  by browser/app caches and are useful only as sanity checks.

Before/after:

| Metric                               |    Baseline | Optimization 1 | Optimization 2 |
| ------------------------------------ | ----------: | -------------: | -------------: |
| First 3D paint                       |    620.9 ms |       671.5 ms |       718.2 ms |
| First 3D paint placement             | transformed |    transformed |    provisional |
| Playhead buffer ready                |  2,996.5 ms |     3,341.5 ms |       311.5 ms |
| Startup buffer ready                 |  5,210.4 ms |     3,342.4 ms |       697.3 ms |
| First playback commit                |  3,892.2 ms |     3,344.3 ms |     3,011.6 ms |
| First 10 s wall time                 | 13,112.5 ms |    12,248.6 ms |    10,294.8 ms |
| First 10 s stalled wall time         |  3,108.2 ms |     1,712.4 ms |       279.7 ms |
| Max single stall                     |  1,800.6 ms |     1,536.2 ms |       279.7 ms |
| Stall count                          |           3 |              3 |              1 |
| Stall percent                        |       23.7% |          14.0% |           2.7% |
| Missing-data stalled wall time       |        0 ms |           0 ms |           0 ms |
| Current-frame max duration           |  2,403.3 ms |     2,695.7 ms |        63.9 ms |
| Current-frame total duration         |  6,709.8 ms |     7,455.4 ms |       190.2 ms |
| Lookahead batch max duration         |  4,741.2 ms |     2,700.9 ms |       595.3 ms |
| Lookahead batch total duration       | 37,735.0 ms |    21,862.7 ms |     8,412.8 ms |
| Total effective bytes                |  480.117 MB |     271.816 MB |     328.895 MB |
| Background lookahead effective bytes |  472.708 MB |     263.145 MB |     320.226 MB |
| LIDAR effective bytes                |  323.905 MB |     178.174 MB |     215.273 MB |
| Image effective bytes                |  141.814 MB |      84.774 MB |     102.529 MB |

Interpretation:

- This is the first run that feels product-plausible: first-10-second stall
  time dropped by about 91% from baseline.
- The current-frame lane is now healthy: max current-frame duration dropped
  from seconds to 63.9 ms.
- Background bytes rose relative to Optimization 1 because the idle lane can
  now make progress in parallel. That is probably acceptable for local
  playback, but remote playback will need explicit idle budgets.
- First 3D paint became provisional in this run. That is truthful, but if the
  warning is visible or jarring, the placement-transform current window should
  get a tighter first-paint contract.

## Fresh Validation After Optimization 2

Date: 2026-06-30

Rule for these numbers:

- Use only the first run after a hard page refresh as the reliable baseline.
- Treat second and later runs in the same browser session as warmed-cache
  checks.
- Browser automation should start playback with Space when measuring the
  keyboard path.

### Hard refresh, Play click

Run URL:
`http://localhost:5174/datasets/nuscenes-mcap-local?mcapLatencyDebug=1&id=6a1b1814ed669ab6352e8043&legitBaseline=1782857818847-1`

Method:

- Navigated through a fresh cache-busted sample URL.
- Clicked Play once the control was available.
- Measured the first 10 seconds of playback.

| Metric                                       |      Value |
| -------------------------------------------- | ---------: |
| Point cloud panel painted                    |   671.6 ms |
| Playhead buffer ready                        |   307.9 ms |
| Startup buffer ready                         |   661.6 ms |
| First playback commit                        | 3,631.3 ms |
| First 10 s stalled wall time                 |   231.0 ms |
| Max single stall                             |   231.0 ms |
| Stall count                                  |          1 |
| Stall percent                                |       2.3% |
| Missing-data stalled wall time               |       0 ms |
| Current-frame max duration                   |    55.7 ms |
| Lookahead batch max duration                 |   535.8 ms |
| Total effective bytes                        | 283.590 MB |
| Background lookahead effective bytes         | 274.921 MB |
| Active topics by first commit                |         12 |
| Streams at startup/playhead-ready milestones |          9 |

Interpretation:

- This is the cleanest cold validation for the optimized Play-click path.
- The original seconds-long playback stalls are gone in this run.
- The 9 versus 12 stream count difference is a milestone timing detail: startup
  readiness covers the currently blocking stream set early, and the full active
  topic count reaches 12 by first playback commit.

### Hard refresh, Space after controls are ready

Run URL:
`http://localhost:5174/datasets/nuscenes-mcap-local?mcapLatencyDebug=1&id=6a1b1814ed669ab6352e8043&spaceColdBaseline=1782857924946`

Method:

- Navigated through a fresh cache-busted sample URL.
- Waited until the Play control was enabled.
- Pressed Space instead of clicking Play.
- Measured the first 10 seconds of playback.

| Metric                                       |      Value |
| -------------------------------------------- | ---------: |
| Point cloud panel painted                    |   678.1 ms |
| Playhead buffer ready                        |   284.2 ms |
| Startup buffer ready                         |   668.0 ms |
| First playback commit                        | 1,485.9 ms |
| First 10 s stalled wall time                 |   263.4 ms |
| Max single stall                             |   255.2 ms |
| Stall count                                  |          2 |
| Stall percent                                |       2.6% |
| Missing-data stalled wall time               |       0 ms |
| Current-frame max duration                   |    66.3 ms |
| Lookahead batch max duration                 |   895.9 ms |
| Total effective bytes                        | 283.864 MB |
| Background lookahead effective bytes         | 275.154 MB |
| LIDAR effective bytes                        | 184.798 MB |
| Image effective bytes                        |  89.564 MB |
| Active topics by first commit                |         12 |
| Streams at startup/playhead-ready milestones |          9 |

Interpretation:

- This validates that keyboard-start is healthy once the startup window is
  ready.
- The stall profile is close to the optimized Play-click path, so Space itself
  is not inherently slower.
- This is the better comparison for "user presses Space instead of clicking
  Play" if the app has already made the controls available.

### Hard refresh, Space immediately at session start

Run URL:
`http://localhost:5174/datasets/nuscenes-mcap-local?mcapLatencyDebug=1&id=6a1b1814ed669ab6352e8043&spaceImmediateBaseline=1782858024475`

Method:

- Navigated through a fresh cache-busted sample URL.
- Pressed Space as soon as the MCAP latency session started, before waiting for
  the Play control or startup buffer readiness.
- Measured the first 10 seconds of playback.

| Metric                               |      Value |
| ------------------------------------ | ---------: |
| Point cloud panel painted            |   770.7 ms |
| Startup buffer ready                 |   758.8 ms |
| First playback commit                |   770.5 ms |
| First 10 s stalled wall time         | 4,944.7 ms |
| Max single stall                     | 2,179.8 ms |
| Stall count                          |         50 |
| Stall percent                        |      33.3% |
| Missing-data stalled wall time       |   171.3 ms |
| Current-frame max duration           |    68.2 ms |
| Lookahead batch max duration         | 2,465.9 ms |
| Total effective bytes                | 243.628 MB |
| Background lookahead effective bytes |  20.862 MB |
| Startup effective bytes              |  93.342 MB |
| Current-frame effective bytes        |  22.649 MB |
| Active topics by first commit        |          9 |
| Max active topics observed           |         12 |

Interpretation:

- This is not a fair optimized playback baseline, but it is an important
  product failure mode.
- Pressing Space before the startup window is ready can begin playback too
  early, which converts startup work into user-visible stalls.
- The playback engine should either queue early Play/Space intent until the
  startup window is ready or make MCAP startup readiness part of the generic
  play contract.
- The goal should be that "instant Space" feels responsive without allowing
  playback to run into a known unbuffered startup window.

## Optimization 3: Gate early play until startup buffer readiness

Date: 2026-06-30

Run URL:
`http://localhost:5174/datasets/nuscenes-mcap-local?mcapLatencyDebug=1&id=6a1b1814ed669ab6352e8043&spaceGateFixedRun=1782858948281`

Product stance:

- A user can reasonably press Space immediately after opening a sample.
- The app should feel responsive to that intent, but it should not start the
  clock into a known unready MCAP window.
- The right behavior is "accepted play intent, buffering briefly, then
  auto-start" rather than silently ignoring Space or letting playback thrash.

High-level refactors:

- Added a generic pending-play state to the playback engine.
- Kept `isPlaying` reserved for active clock movement, so stall instrumentation
  starts only when playback really starts.
- Added `startupBufferSeconds` to the `PlaybackStream` contract.
- Made MCAP opt into the startup contract with its existing 0.3 s startup
  window.
- Exposed MCAP buffered ranges on the engine stream so the playback engine can
  prove startup coverage without knowing MCAP internals.
- Updated Space and button controls to treat pending play as accepted intent:
  the button flips to Pause and a buffering indicator is shown.
- Re-check pending play on stream activation and buffered-range publication.
- Added regression tests for:
    - startup-window pending play;
    - immediate start when the startup window is already covered;
    - pending play before any stream/duration is known;
    - canceling pending play via Pause.

Validation method:

- Navigated through a fresh cache-busted sample URL.
- Pressed Space as soon as the MCAP latency session started.
- Did not wait for the Play control or startup buffer readiness.
- Measured the first 10 seconds of playback.

| Metric                               | Before gating | After gating |
| ------------------------------------ | ------------: | -----------: |
| Point cloud panel painted            |      770.7 ms |     608.0 ms |
| Playhead buffer ready                |  not recorded |     314.7 ms |
| Startup buffer ready                 |      758.8 ms |     595.3 ms |
| Playback stall window started        |     too early |   1,174.3 ms |
| First playback commit                |      770.5 ms |   1,186.7 ms |
| First 10 s wall time                 |  not recorded |  10,411.4 ms |
| First 10 s stalled wall time         |    4,944.7 ms |     394.4 ms |
| Max single stall                     |    2,179.8 ms |     311.5 ms |
| Stall count                          |            50 |            2 |
| Stall percent                        |         33.3% |         3.8% |
| Missing-data stalled wall time       |      171.3 ms |         0 ms |
| Current-frame max duration           |       68.2 ms |      57.4 ms |
| Lookahead batch max duration         |    2,465.9 ms |     713.6 ms |
| Total effective bytes                |    243.628 MB |   283.644 MB |
| Background lookahead effective bytes |     20.862 MB |   274.921 MB |

Interpretation:

- This fixes the main immediate-Space failure mode: playback no longer starts
  before the startup window is ready.
- The user still gets instant acknowledgement: after Space, the button is Pause
  and the buffering indicator is visible.
- The remaining first-10-second stall is small enough to feel much closer to
  normal local playback, though it is still above the 250 ms target.
- Background bytes are back in the expected optimized range because playback no
  longer starves the idle lane during a bad early start.
- The next optimization should target the remaining ~300 ms max stall without
  increasing startup wait noticeably.

## Optimization 4: Smooth the startup-to-lookahead handoff

Date: 2026-06-30

Run URL:
`http://localhost:5174/datasets/nuscenes-mcap-local?mcapLatencyDebug=1&id=6a1b1814ed669ab6352e8043&primaryGateRun=1782860119525`

Product stance:

- The first gating fix made immediate Space correct, but the first stall still
  happened right after the 0.3 s startup window ran out.
- The startup window should be just large enough to let the rolling background
  lookahead catch up. If it is too small, playback starts quickly but hitches;
  if it is too large, the user waits too long after pressing Space.
- Annotation overlays should not hold the primary playback clock hostage. If
  image/point-cloud streams are ready, playback should move; annotations can
  appear when their own data is ready.

High-level refactors:

- Increased the MCAP startup readiness window from 0.3 s to 0.5 s, capped at 15
  ticks for the default 30 Hz timeline.
- Added an immediate buffered-range publish when pending play has startup
  coverage. The timeline strip still uses throttled publishes, but the
  play-start contract no longer waits on that 500 ms UI throttle.
- Added `blockingTopics` to the MCAP data stream:
    - images and point clouds block playback readiness;
    - image annotations do not block playback when primary render topics are
      active;
    - annotation-only layouts fall back to using their active annotation
      topics.
- Kept fetching active annotation topics opportunistically, so overlays still
  populate and still surface loading/stale/gap status.
- Added a regression test proving pending play starts as soon as the startup
  window is covered.

Rejected intermediate:

- A 0.5 s startup gate across all active topics produced zero first-10-second
  stalls, but delayed first playback commit to about 3.1 s because late
  annotation topics held the gate. That is the wrong product tradeoff.

Validation method:

- Navigated through a fresh cache-busted sample URL.
- Pressed Space as soon as the MCAP latency session started.
- Did not wait for the Play control or startup buffer readiness.
- Measured the first 10 seconds of playback.

| Metric                               | Optimization 3 | Optimization 4 |
| ------------------------------------ | -------------: | -------------: |
| Point cloud panel painted            |       608.0 ms |       879.1 ms |
| Playhead buffer ready                |       314.7 ms |       341.6 ms |
| Startup buffer ready                 |       595.3 ms |       868.3 ms |
| Playback stall window started        |     1,174.3 ms |       987.6 ms |
| First playback commit                |     1,186.7 ms |       994.5 ms |
| First 10 s wall time                 |    10,411.4 ms |    10,249.2 ms |
| First 10 s stalled wall time         |       394.4 ms |       259.2 ms |
| Max single stall                     |       311.5 ms |       143.5 ms |
| Stall count                          |              2 |              2 |
| Stall percent                        |           3.8% |           2.5% |
| Missing-data stalled wall time       |           0 ms |           0 ms |
| Current-frame max duration           |        57.4 ms |        72.9 ms |
| Lookahead batch max duration         |       713.6 ms |     3,865.6 ms |
| Total effective bytes                |     283.644 MB |     281.637 MB |
| Background lookahead effective bytes |     274.921 MB |     269.679 MB |

Interpretation:

- The user-visible handoff is materially smoother: total stall time dropped
  from 394.4 ms to 259.2 ms, and the largest hitch dropped from 311.5 ms to
  143.5 ms.
- First playback commit improved despite the larger startup window because the
  immediate publish removed the old buffered-range throttle from the play-start
  path.
- First 3D paint regressed from 608.0 ms to 879.1 ms but stays under the 1 s
  local target. This is acceptable for now because the primary pain was
  playback disruption, not first paint.
- The remaining total stall is barely above the 250 ms target, but max stall is
  now comfortably below it. Chasing zero stalls by blocking on every active
  topic proved worse for perceived latency.

## Optimization 5: Use paused idle time to warm playback lookahead

Date: 2026-06-30

Run URL:
`http://localhost:5174/datasets/nuscenes-mcap-local?mcapLatencyDebug=1&id=6a1b1814ed669ab6352e8043&idleWarmupRun3=1782860944736`

Product stance:

- If a user opens an MCAP sample and pauses to orient themselves before
  pressing Play, that idle time should improve the eventual playback
  experience.
- Idle warmup must stay behind the startup contract: first paint and startup
  readiness should happen before speculative work expands.
- Render-blocking topics should warm first. Annotation overlays can follow
  after images and point clouds have their lookahead covered.

High-level refactors:

- Added a paused-idle warmup loop inside the MCAP data stream hook.
- The loop starts only after the startup window is covered and playback is not
  active or pending.
- The loop clears itself when playback starts, source changes, or the hook
  unmounts.
- Added topic-set-aware missing-tick collection so primary topics and
  non-blocking overlay topics can be warmed intentionally.
- Warmup phase order:
    - fill the full lookahead for active blocking topics first;
    - then fill remaining active topics, such as annotation overlays.
- Background warmup batches continue to use idle worker priority.
- Added debug metric `paused idle warmup passes`.
- Added a regression test proving a paused sample warms lookahead after startup
  coverage without playhead movement.

Validation method:

- Navigated through a fresh cache-busted sample URL.
- Waited for the startup buffer to become ready.
- Did nothing for about 10 seconds.
- Pressed Space.
- Measured background bytes before Space and the first 10 seconds of playback
  after Space.

Before pressing Space:

| Metric                                    |     Value |
| ----------------------------------------- | --------: |
| Startup buffer ready                      |  917.0 ms |
| Paused idle warmup passes                 |         8 |
| Background lookahead effective bytes      | 70.773 MB |
| Background lookahead requests             |         8 |
| Startup lookahead effective bytes         | 11.574 MB |
| Total effective bytes before Play         | 82.663 MB |
| LIDAR point-cloud effective bytes         | 53.650 MB |
| Image effective bytes                     | 26.092 MB |
| Radar point-cloud effective bytes         |  2.121 MB |
| Image annotation effective bytes          |  0.528 MB |
| Transform effective bytes                 |  0.271 MB |
| Last paused warmup phase                  |       all |
| Active topics / blocking topics at warmup |    12 / 9 |

After pressing Space:

| Metric                                    |       Value |
| ----------------------------------------- | ----------: |
| App playback-start marker to first commit |     10.4 ms |
| First 10 s wall time                      | 10,010.0 ms |
| First 10 s stalled wall time              |        0 ms |
| Max single stall                          |        0 ms |
| Stall count                               |           0 |
| Stall percent                             |        0.0% |
| Missing-data stalled wall time            |        0 ms |

Interpretation:

- Yes, idle time is now useful: before the user presses Space, the app has
  already warmed about 70.8 MB of background lookahead.
- The payoff is exactly the product behavior we want for this scenario:
  playback starts effectively immediately and the first 10 seconds run with no
  measured stalls.
- The cost is also clear: the app spends about 82.7 MB before Play after a 10
  second idle wait. That is probably fine for local playback, but remote
  playback will need source-profile-specific idle budgets.
- This optimization improves perceived latency without making playback less
  truthful: it only prefetches frames the existing policy would display later.

## Optimization 6: Limit paused warmup to a ready-to-play runway

Date: 2026-06-30

Run URL:
`http://localhost:5174/datasets/nuscenes-mcap-local?mcapLatencyDebug=1&id=6a1b1814ed669ab6352e8043&pausedRunwayRun=1782861534158`

Product stance:

- Optimization 5 made idle time useful, but it spent too many bytes before the
  user actually pressed Play.
- Paused warmup should buy an instant-feeling Play response, not fill the full
  active playback buffer.
- Active playback can keep its larger rolling lookahead; paused warmup should
  stop after a smaller ready-to-play runway.

High-level refactors:

- Added `pausedWarmupRunwaySeconds` to the MCAP playback policy.
- Set the default paused runway to `1.5 s`.
- Clamp the paused runway between startup readiness and the active playback
  lookahead.
- Changed only the paused-idle warmup path to use this runway; active playback
  still uses the `4 s` rolling lookahead.
- Kept the same warmup order:
    - active blocking topics first;
    - then remaining active topics such as annotation overlays.
- Extended the paused-warmup regression test to use a longer timeline and prove
  the first idle request stays inside the `1.5 s` runway.

Validation method:

- Navigated through a fresh cache-busted sample URL.
- Waited for the startup buffer to become ready.
- Did nothing for about 10 seconds.
- Pressed Space.
- Measured background bytes before Space and the first 10 seconds of playback
  after Space.

Before pressing Space:

| Metric                               | Optimization 5 | Optimization 6 |     Change |
| ------------------------------------ | -------------: | -------------: | ---------: |
| Startup buffer ready                 |       917.0 ms |       889.8 ms |   -27.2 ms |
| Paused idle warmup passes            |              8 |              2 |         -6 |
| Background lookahead effective bytes |      70.773 MB |      20.521 MB | -50.252 MB |
| Startup lookahead effective bytes    |      11.574 MB |      11.574 MB |  unchanged |
| Total effective bytes before Play    |      82.663 MB |      32.411 MB | -50.252 MB |
| LIDAR point-cloud effective bytes    |      53.650 MB |      20.535 MB | -33.115 MB |
| Image effective bytes                |      26.092 MB |      10.607 MB | -15.485 MB |
| Radar point-cloud effective bytes    |       2.121 MB |       0.765 MB |  -1.356 MB |
| Image annotation effective bytes     |       0.528 MB |       0.234 MB |  -0.294 MB |

After pressing Space:

| Metric                                    | Optimization 5 | Optimization 6 |
| ----------------------------------------- | -------------: | -------------: |
| App playback-start marker to first commit |        10.4 ms |         8.9 ms |
| First 10 s wall time                      |    10,010.0 ms |    10,014.3 ms |
| First 10 s stalled wall time              |           0 ms |           0 ms |
| Max single stall                          |           0 ms |           0 ms |
| Stall count                               |              0 |              0 |
| Missing-data stalled wall time            |           0 ms |           0 ms |

Immediate-Space validation:

Run URL:
`http://localhost:5174/datasets/nuscenes-mcap-local?mcapLatencyDebug=1&id=6a1b1814ed669ab6352e8043&pausedRunwayImmediate2=1782861602383`

| Metric                         |      Value |
| ------------------------------ | ---------: |
| Startup buffer ready           |   935.1 ms |
| Playback started               | 1,078.0 ms |
| First playback commit          | 1,092.2 ms |
| First 10 s stalled wall time   |   438.1 ms |
| Max single stall               |   410.9 ms |
| Stall count                    |          3 |
| Missing-data stalled wall time |       0 ms |
| Paused warmup passes           |          0 |

Interpretation:

- This is a strong product tradeoff for the idle-start path: pre-Play byte
  spend dropped by about 61% while preserving zero measured stalls after Play.
- The 1.5 s runway still gives active playback enough time to fill the rolling
  4 s lookahead after Play starts.
- Immediate Space remains a separate bottleneck. Paused warmup is not active in
  that path, and this run still measured about 438 ms of loading stalls. The
  next optimization should target the startup-to-active-playback handoff
  directly.

## Optimization 7: Transform Runway And Camera Handoff

Problem observed:

- On a cold-ish first playback, the 3D panel could render a provisional
  `LIDAR_TOP` view, switch into transformed `base_link`, then visibly disrupt
  the camera/data relationship when transform windows became available.
- The old current transform window was only `+500 ms` ahead of the playhead, so
  playback could outrun the loaded transform window before the full transform
  range arrived.

Refactor:

- Expanded the demand-driven transform current-window runway to `+4 s` ahead
  and `-500 ms` behind the playhead.
- Preserved the visual camera/data relationship when moving from provisional
  source-frame placement to transformed world-frame placement by applying the
  same source-to-world transform to the camera position and target.
- Applied that camera handoff in a layout effect so the corrected controlled
  camera pose is in place before the first transformed frame paints.

Validation method:

- Reloaded the sample with `mcapLatencyDebug=1`.
- Started playback with Space.
- Watched the first ~7 seconds of debug events around the previous disruptive
  window.

Validation run:
`http://localhost:5174/datasets/nuscenes-mcap-local?mcapLatencyDebug=1&id=6a1b1814ed669ab6352e8043&cameraRunwayProbe=1782863540596`

| Event                            | Time Since Load | Detail                                            |
| -------------------------------- | --------------: | ------------------------------------------------- |
| Transform current-window request |        316.4 ms | Requested `-500 ms` to `+4 s` around the playhead |
| Provisional 3D placement         |        790.6 ms | 1 `LIDAR_TOP` layer, `34,720` points              |
| Transform current-window ready   |      1,707.3 ms | `649` transform samples                           |
| Camera pose remapped             |      1,712.6 ms | `LIDAR_TOP -> base_link`, exact transform         |
| Transformed 3D placement         |      1,712.9 ms | 6 layers, `35,538` points                         |
| First transformed panel paint    |      1,716.1 ms | Camera pose source `controlled`, remapped pose    |
| Full transform range ready       |      3,787.7 ms | `3,106` transform samples                         |

Observed result:

- Provisional fallbacks after first transformed placement: `0`.
- The full transform range arriving later did not cause a placement-mode snap.
- The first transformed paint used the remapped camera pose, not the stale
  provisional fitted pose.

## Optimization 8: Split Foreground Placement From Idle Transform Runway

Problem observed:

- Expanding the foreground transform current window to `+4 s` preserved 3D
  orientation, but it also delayed Space-to-playback because transform reads
  run through the foreground worker lane.
- Transform payload bytes are small, but transform windows can still touch and
  decompress large MCAP chunks. That made a long transform window block startup
  playback reads.

Refactor:

- Kept foreground transform placement reads small: `-500 ms` to `+1 s` around
  the playhead.
- Added an idle transform runway read: `-500 ms` to `+4 s`.
- Kept the full source transform range on the idle lane and gated it behind the
  runway so source-wide work cannot jump ahead of near-future transforms.
- Added explicit `priority` support to `readFrameTransformWindow` so transform
  runway/full-range reads can be demoted without changing foreground placement
  behavior.
- Added an in-flight runway range guard so playback ticks do not queue many
  overlapping idle runway reads while the first one is still running.
- Recorded runway bandwidth separately as `transform-runway`.

Validation run:
`http://localhost:5174/datasets/nuscenes-mcap-local?mcapLatencyDebug=1&id=6a1b1814ed669ab6352e8043&transformRunwaySplitRun=1782865526078`

| Event                         | Time Since Load | Detail                                    |
| ----------------------------- | --------------: | ----------------------------------------- |
| Foreground transform request  |        369.4 ms | `-500 ms` to `+1 s`                       |
| Idle transform runway request |        369.5 ms | `-500 ms` to `+4 s`                       |
| Startup buffer ready          |      1,039.4 ms | 15 ticks, 9 streams                       |
| Foreground transform ready    |      1,322.1 ms | `162` samples                             |
| Camera pose remapped          |      1,357.2 ms | `LIDAR_TOP -> base_link`, exact transform |
| First transformed placement   |      1,357.7 ms | 6 layers, `35,538` points                 |
| First playback commit         |      1,371.3 ms | About `0.37 s` after Space                |
| Idle transform runway ready   |      2,139.4 ms | `649` samples                             |

Observed result:

- Provisional fallbacks after first transformed placement: `0`.
- Transformed layer drops after first transformed placement: `0`.
- Idle runway request events logged: `1`.
- Compared with the foreground `+4 s` transform window probe, first playback
  commit improved from about `2.84 s` after Space to about `0.37 s` after Space
  in this warm validation run.
- Remaining playback stalls in this run were loading stalls from message
  lookahead, not transform placement fallback; those are the next optimization
  surface.

## Next Steps

1. Make baseline capture repeatable with a small browser/dev helper that writes
   the three debug DOM attributes to a timestamped JSON file.
2. Stabilize the capture surface so before/after runs use the same active
   stream count and layout.
3. Reduce the immediate-Space startup-to-active-playback hitch:
    - when pending Play starts, queue one extra near-playhead background batch
      immediately;
    - keep that batch render-blocking-topic-first;
    - measure whether this removes the first active-playback stall without
      delaying first commit.
4. Add explicit idle-lane budgets and source-profile policy:
    - Local can be more aggressive.
    - Remote should cap concurrent idle byte pressure and ramp after playback
      stays smooth.
    - Idle work should pause briefly after seek, step, or a foreground miss.
5. Reduce duplicated current-frame/startup pressure:
    - Dedupe current-frame reads by tick/topic set.
    - Avoid issuing one current-frame fetch and a startup batch for overlapping
      data when the batch can satisfy both.
6. Reduce the byte cost of the now-smooth paused warmup further:
    - Start with a small LIDAR background horizon.
    - Ramp the horizon only after playback has stayed ready for a short window.
    - Keep images/current-frame responsive instead of coupling them to heavy
      point-cloud background work.
7. Re-run both baselines after each refactor:
    - immediate Space after session start;
    - wait idle for 10 seconds, then Space.
8. Compare:
    - First 3D paint.
    - Playhead buffer ready.
    - Startup buffer ready.
    - First 10 s stalled wall time.
    - Max single stall.
    - Effective MB in the 0-1 s, 2-5 s, and 5-10 s buckets.
9. After scheduling is healthy, test chunk-level changes:
    - Smaller initial byte windows for local startup.
    - Controlled concurrency for point-cloud chunks.
    - Request coalescing where adjacent windows repeatedly hit the same chunk.
    - Prioritized cancellation or demotion for background reads after seeks.
10. Suggested local success targets:
    - First 3D paint under 1 second.
    - Playhead buffer ready under 1.5 seconds.
    - Startup buffer ready under 2 seconds.
    - First 10 s stalled wall time under 250 ms.
    - Missing-data stalled wall time stays at 0 ms.
    - 0-5 s effective bytes materially lower than this baseline without hiding
      truthful data.
