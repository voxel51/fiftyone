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

## Instrumentation 9: Add Worker Request Attribution

Date: 2026-06-30

Purpose:

- Before changing chunk size, worker concurrency, cancellation, or request
  coalescing, measure the causal chain for each worker request.
- Correlate user-visible stalls with whether work waited in queue, spent time
  actively decoding/fetching, touched many large chunks, or returned a large
  payload to the main thread.

Instrumentation added:

- Each final worker response can now carry a debug-only attribution row when
  `mcapLatencyDebug=1`.
- Published summary attribute: `data-mcap-worker-attribution`.
- Console row per completed worker request: `[mcap] worker attribution`.
- Aggregates by lane, operation, lane+operation, and priority.
- Tracks recent rows plus top offenders by queue wait, run time, fetched bytes,
  and payload bytes.

Per-request fields:

- Lane, operation, priority, request id, source key.
- Requested time/window details, tick count, topic count, topic preview.
- Queue wait, queue depth at start, and worker run time.
- Unique read request count, requested bytes, fetched bytes.
- Chunks touched, unique chunk bytes, data-chunk overlap bytes, message-index
  overlap bytes, and top chunks.
- Approximate response payload bytes, raw encoded bytes, decoded payload bytes,
  result windows/messages/samples, and transferable count.

Smoke-test signal:

- Reloaded the NuScenes local sample with `mcapLatencyDebug=1`.
- Verified `data-mcap-worker-attribution` was present with both `foreground`
  and `idle` lanes.
- Observed request attribution for synchronized batches, transform windows,
  timeline range, topics, topic bounds, and transform bootstrap.
- A full-range idle `readFrameTransformWindow` touched about `531 MB` of chunks
  and fetched about `532 MB` to return about `0.264 MB` of transform payload.

Interpretation:

- This confirms the transform payload itself is tiny, but range shape can force
  huge chunk pressure.
- The next optimization should use this attribution to decide whether to split,
  defer, cancel, coalesce, or reprioritize chunk-heavy background work.

## Optimization 10: Stop Default Full-Range Transform Warmup

Date: 2026-06-30

Problem observed:

- Worker attribution showed a full-range idle `readFrameTransformWindow`
  touching about `531 MB` of chunks and fetching about `532 MB` to return only
  about `0.264 MB` of transform payload.
- That means the expensive part was not transform payload size. It was request
  shape against MCAP chunk granularity: a broad transform time range forced the
  reader to touch many mixed-data chunks.

Product stance:

- The user does not need every transform in the file immediately.
- The user needs truthful placement for the current frame and enough
  near-future transform coverage to avoid visual snaps during playback.
- A full-recording transform warmup spends a lot of invisible work on data the
  user may never look at.

Refactor:

- Removed the default full-source dynamic transform warmup.
- Kept the foreground placement read small: `-500 ms` to `+1 s` around the
  current playhead.
- Kept the idle transform runway: `-500 ms` to `+4 s` around the current
  playhead.
- Coalesced runway requests around meaningful coverage instead of exact window
  equality: if cache or in-flight work covers at least the next `2 s`, small
  playhead shifts do not queue another overlapping idle runway.
- Left source/timeline changes resetting the transform store, in-flight
  windows, and retry state.
- Removed the now-unused `transform-range` bandwidth operation from live code.

Expected measurement:

- `readFrameTransformWindow` fetched/chunk MB should no longer include a huge
  full-range idle request on initial load.
- First transformed placement should remain governed by the small foreground
  placement window.
- Provisional fallback after first transformed placement should stay at `0`.
- If transform coverage gaps appear later in playback, they should show up as
  small runway/placement requests rather than one massive source-wide request.

Smoke validation:

- Reloaded the local NuScenes sample with `mcapLatencyDebug=1`.
- Observed `2` transform-window worker requests and `0` full-range transform
  requests.

| Request     | Lane       | Window | Fetched MB | Chunk MB | Payload MB | Run time |
| ----------- | ---------- | -----: | ---------: | -------: | ---------: | -------: |
| Placement   | foreground |  1.5 s |     29.260 |   29.934 |      0.014 | 159.2 ms |
| Idle runway | idle       |  4.5 s |    116.896 |  121.287 |      0.055 |   1.02 s |

Transform-window summary after reload:

| Metric              |   Value |
| ------------------- | ------: |
| Requests            |       2 |
| Fetched MB          | 146.156 |
| Chunk MB            | 151.222 |
| Payload MB          |   0.069 |
| Full-range requests |       0 |

Interpretation:

- The massive full-range request is gone from initial load.
- The remaining transform cost is now the idle runway itself: even a local
  `4.5 s` transform window still touches about `121 MB` of chunks for about
  `0.055 MB` of payload.
- The next chunk/worker optimization should focus on reducing or deferring
  runway chunk pressure, not on transform payload serialization.

## Optimization 11: Make Transform Runway Progressive

Date: 2026-06-30

Problem observed:

- Removing full-range warmup fixed the worst transform request, but the idle
  runway still fetched about `116.896 MB` for a `4.5 s` window.
- That idle window overlapped the foreground placement window. We were asking
  for near-now transforms twice: once for the current truthy placement, then
  again for the speculative runway.

Product stance:

- Current placement should stay urgent and truthful.
- Future transform warmup should be invisible and incremental; it should not
  spend a large chunk budget before the user sees the future data.
- A smaller progressive runway preserves playback smoothness while reducing
  hidden startup pressure.

Refactor:

- Kept foreground placement unchanged: `-500 ms` to `+1 s`.
- Added a transform-store high-water query for indexed coverage.
- Changed idle runway from one `-500 ms` to `+4 s` window into a bounded
  extension beyond current coverage.
- Each idle extension is capped at `1.5 s`.
- Each extension overlaps existing coverage by `100 ms` for interpolation
  safety.
- A new idle extension is requested only when current indexed or in-flight
  coverage does not cover the next `2 s`.

Smoke validation:

- Reloaded the local NuScenes sample with `mcapLatencyDebug=1`.
- Observed `2` transform-window worker requests and `0` full-range transform
  requests.

| Request        | Lane       | Window | Fetched MB | Chunk MB | Payload MB | Run time |
| -------------- | ---------- | -----: | ---------: | -------: | ---------: | -------: |
| Placement      | foreground |  1.5 s |     29.260 |   29.934 |      0.014 | 167.8 ms |
| Idle extension | idle       |  1.5 s |     43.670 |   44.321 |      0.020 | 594.0 ms |

Transform-window summary after reload:

| Metric              |  Before |  After | Change |
| ------------------- | ------: | -----: | -----: |
| Requests            |       2 |      2 |      0 |
| Fetched MB          | 146.156 | 72.929 | -50.1% |
| Chunk MB            | 151.222 | 74.255 | -50.9% |
| Payload MB          |   0.069 |  0.034 | -50.7% |
| Full-range requests |       0 |      0 |      0 |

Interpretation:

- Progressive runway cut initial transform-window fetch pressure roughly in
  half without changing current-frame placement.
- The remaining cost is still chunk-granularity dominated, but the request
  shape is now sane enough for true chunk/worker policy experiments.

## Instrumentation 12: Bridge Message Batch Attribution

Date: 2026-07-01

Problem:

- We could see user-visible latency events, bandwidth category samples, and
  worker request attribution, but message playback batches did not have one
  stable join key across all three surfaces.
- That made it hard to answer whether a specific startup/lookahead batch was
  expensive because of requested ticks/topics, cache misses, worker queue/run
  time, chunk bytes, or payload/category mix.

Refactor:

- Added a debug-only `mcapDataRequestId` per message batch fetch.
- Threaded that id through:
    - the data-stream `readSynchronizedMessageBatch` payload;
    - worker attribution root and request summaries;
    - bandwidth samples for decoded message windows;
    - per-batch latency events.
- Added `mcap data batch request`, `mcap data batch settled`, and
  `mcap data batch failed` events.
- Per-batch events now include requested ticks/topics, cache coverage before
  and after, worker priority, operation, and whether the batch cleared pending
  play or buffering.

Smoke validation:

- Reloaded the local NuScenes sample with `mcapLatencyDebug=1`.
- Observed common `mcap-data:*` ids across:
    - `data-mcap-latency-events`;
    - `data-mcap-latency-bandwidth`;
    - `data-mcap-worker-attribution`.
- First startup batch example:
    - `135` requested topic-ticks;
    - `0%` cache coverage before;
    - `100%` cache coverage after;
    - `607.3 ms` batch duration;
    - `90` point-cloud messages;
    - same request id present in events, bandwidth, and worker attribution.

## Optimization 13: Shape Message Startup Around Shallow Pane-Neutral Playback

Date: 2026-07-01

Problem:

- Message playback startup was expensive because requested bytes scale as
  `topics x ticks`.
- A first attempt reduced topics by prioritizing a LIDAR-like point-cloud
  stream first. That helped 3D startup, but it was the wrong product contract:
  it implicitly made one pane more important than the rest of the visible
  layout.
- The better axis is time depth. Every active pane should get a truthful
  current frame / near-term startup window; the app should then build runway in
  the background.

Product stance:

- First playback should be pane-neutral. Cameras, radar/point-cloud panes, and
  other active renderables should all get a fair first-frame path.
- The startup gate should ask for just enough time depth to avoid an immediate
  hitch, not half a second of every stream.
- This does not invent data: missing secondary streams remain loading/stale
  until their own messages land.

Refactor:

- Restored blocking topics to all active non-annotation renderables.
- Current-frame fetches cover all active subscribed topics, so no pane is
  silently deprioritized.
- Startup lookahead is now a shallow 3-tick window (`0.1 s` at 30 Hz), down
  from the previous 15-tick / `0.5 s` window.
- Background lookahead remains idle-lane work after the shallow startup window
  is covered.
- Tightened paused idle warmup cadence so background warmup does not chain
  immediately after every batch completion.

Smoke validation:

- Unit coverage asserts multi-topic current-frame/startup requests include all
  active panes and cap startup to at most 3 ticks.
- Browser smoke on the local NuScenes sample:
    - current-frame request covered `9` topics;
    - startup request covered `3` ticks x `9` topics;
    - startup request was foreground/playback priority;
    - worker attribution linked the same `mcapDataRequestId`;
    - startup batch touched `9` chunks, fetched `5.259 MB`, decoded `3.319 MB`,
      and ran in `233.3 ms`.

Interpretation:

- The optimization is now a product-safe byte reduction: fewer startup ticks,
  same pane fairness.
- This should reduce startup byte pressure by roughly the tick reduction factor
  before chunk effects: `3 / 15` of the old startup depth for the same active
  topic set.
- This is the right precondition for chunk-level/concurrency work because the
  request shape no longer encodes a pane preference.

## Optimization 14: Reuse In-Flight Reads and Decompressed Chunks

Date: 2026-07-01

Problem:

- Current-frame and startup/lookahead requests are separate MCAP reader calls.
- The generic byte client already has byte-range cache/coalescing, but
  `@mcap/core` only keeps decompressed chunk views inside one `readMessages()`
  call.
- Sequential foreground requests can therefore be raw-byte-cache-hot while
  still paying chunk parse/decompression cost again.

Product stance:

- This is a pure physical-layer optimization. It does not change which panes
  are shown, how time is resolved, or which data is considered truthful.
- It should make startup and early playback feel less hitchy without hiding
  missing/stale data or privileging one pane.

Refactor:

- Added exact in-flight range coalescing inside `ByteClientReadable`.
    - Identical concurrent `(offset, size, cachePolicy)` reads share one
      promise.
    - Coalesced reads are logged with `fetchedBytes: 0`.
- Added a bounded `64 MB` decompressed chunk cache around MCAP decompress
  handlers.
    - Cache key is raw byte-buffer identity + byte range + compression +
      decompressed size.
    - This lets adjacent sequential reader calls reuse decompressed chunk data
      when the raw byte cache returns the same chunk bytes.
- Extended worker attribution with:
    - `coalescedReadRequests`;
    - `coalescedRequestedBytes`;
    - summarized MB fields in debug DOM attributes / console logs.

Smoke validation:

- Browser smoke on the local NuScenes sample with the active layout at the
  time:
    - current-frame request covered `5` topics;
    - startup request covered `3` ticks x `5` topics;
    - startup touched `4` chunks, fetched `3.023 MB`, and ran in `10.6 ms`;
    - `coalescedReadRequests` was `0`, which is expected for the serial
      foreground worker path.
- Treat this as a behavioral smoke, not a cold baseline. The app/session had
  warm caches by this point.

Hard-refresh baseline:

- Mount/startup run:
    - run token: `hardColdChunkReuse-1782878224117`;
    - timeline index ready at `352.8 ms`;
    - current-frame request at `353.7 ms`, cached at `383.8 ms`;
    - playhead buffer ready at `384.2 ms`;
    - startup buffer request at `354.0 ms`, ready at `592.6 ms`;
    - startup batch duration `237.2 ms`;
    - startup worker: `3` ticks x `9` topics, `9` chunks touched, `5.259 MB`
      fetched, `3.319 MB` payload, `200.4 ms` worker run, `35.4 ms` queue wait;
    - startup payload categories: `1.987 MB` lidar point cloud, `1.127 MB`
      image, `0.061 MB` radar point cloud.
- Immediate-Space run:
    - run token: `hardColdPlayChunkReuse-1782878260983`;
    - current-frame cached at `392.8 ms`;
    - playhead buffer ready at `393.2 ms`;
    - startup buffer ready at `612.4 ms`;
    - first playback commit at `637.3 ms`;
    - first 10 s playback stall window completed with `0 ms` stall wall time,
      `0 ms` max stall, `0` stalls, and `0%` stall time;
    - startup worker: `3` ticks x `9` topics, `9` chunks touched, `5.259 MB`
      fetched, `3.319 MB` payload, `212.3 ms` worker run, `44.1 ms` queue wait.
- Caveat: this is a browser hard refresh with a fresh run token and fresh app /
  worker memory. It is not an OS/server disk-cache-cold run.

Interpretation:

- In-flight coalescing is still useful for overlapping idle/foreground and
  future concurrent worker paths, and it makes attribution truthful when it
  happens.
- The immediate foreground win should come mostly from decompressed chunk
  reuse, because current-frame and startup are scheduled serially.
- The next truly cold comparison should use a hard refresh and fresh run token
  before/after this optimization.

## Optimization 15: Keep Transform Discovery Off The First-Play Path

Date: 2026-07-01

Problem:

- Droid exposed a bad edge case: a low-count `/tf` channel can still be
  dynamic. Treating every small transform channel as bootstrap/static made the
  first-open path scan data that was not needed before playback.
- NuScenes exposed the complementary problem: transform windows are useful for
  truthful 3D placement, but they are physically heavy enough that they should
  not contend with observation playback.
- The previous `0.1 s / 3 tick` startup cushion was too shallow for heavy
  all-pane playback. It improved first-commit latency but let playback outrun
  the first real lookahead on NuScenes.

Product stance:

- Stay schema-driven. Topic names are acceptable only as fast hints for known
  static transform conventions such as `tf_static`; they should not decide the
  general case.
- Ambiguous transform channels should be classified by decoding a tiny amount
  of data, not by assuming a topic name is meaningful.
- Transform availability should improve 3D placement as it arrives, but it
  should not block first observation playback. Provisional 3D is preferable to
  blankness while bounded transform windows warm.
- A small upfront startup cushion is the right product tradeoff if it avoids
  visible mid-play stalls.

Refactor:

- Changed transform bootstrap discovery to:
    - discover transform-capable channels by schema;
    - directly scan only small static-looking transform topics;
    - for ambiguous small channels, decode the first transform message and
      bootstrap only when it contains a static/no-timestamp sample;
    - leave timestamped dynamic channels to bounded transform window reads.
- Demoted `readFrameTransformBootstrap` to idle priority.
- Moved the current transform placement window to idle priority. Placement can
  catch up without blocking current-frame or playback reads.
- Restored startup buffering to `0.5 s` with at most `15` ticks. The earlier
  `0.1 s` cushion was too aggressive for NuScenes.
- Updated unit tests around transform bootstrap classification, worker
  priority, transform hook priority, and bounded startup batch depth.

Verification:

| Dataset  | Run token                          | Timeline ready | Startup ready | First commit | First 10 s stall | Notes                                                            |
| -------- | ---------------------------------- | -------------: | ------------: | -----------: | ---------------: | ---------------------------------------------------------------- |
| Droid    | `immediateDroid-1782879998229`     |       287.9 ms |      508.9 ms |     628.7 ms |             0 ms | Immediate Space after timeline ready; completed full 10 s window |
| NuScenes | `domFocusedNuScenes-1782880231047` |       376.6 ms |    1,308.6 ms |   1,510.4 ms |          37.9 ms | DOM-focused Space to keep modal open; completed full 10 s window |

Transform-specific checks:

- NuScenes transform bootstrap now fetched `0 MB`, touched `0` chunks, returned
  `0` samples, and ran in about `8.9 ms` after waiting on the idle lane.
- Droid transform bootstrap returned `0` samples and no longer blocked startup.
  It still fetched about `1.167 MB` to classify the ambiguous dynamic `/tf`
  channel, which is acceptable for this slice and dramatically better than a
  full dynamic scan on the foreground path.
- Dynamic transform windows are still byte-heavy on NuScenes, but they now show
  up as idle/background pressure rather than first-play blockers.

Interpretation:

- This is the right product shape. The app starts playback from observation
  data, renders provisional 3D when necessary, and lets transforms improve
  placement without becoming a hard gate.
- The remaining meaningful pressure is physical: heavy idle transform windows
  and all-pane observation lookahead still fetch large overlapping chunks. That
  is now a chunk/worker optimization problem, not a time-policy problem.

## Instrumentation 16: Remote-Transport Capture Harness

Date: 2026-07-01

Problem:

- Every prior baseline and optimization was validated against the `local` read
  profile. Enterprise usage is ~95% object storage, where every byte read pays
  a real round trip plus constrained bandwidth. We had no repeatable way to
  measure that.

Harness added (`app/packages/multimodal/perf/`):

- `shaping-proxy.mjs`: reverse proxy that adds deterministic first-byte latency
  and a shared token-bucket bandwidth cap to `/media` responses, and logs every
  request as JSONL (transport ground truth, independent of in-app
  instrumentation). Shaping applies to worker fetches trivially because it is
  server-side, avoiding CDP throttling's worker gaps.
- `capture-run.mjs`: Playwright driver that runs a scripted scenario
  (immediate-Space, ready-Space, idle10-Space) against an isolated Vite + proxy
  stack, waits for `playback first 10s stall window finished`, and dumps the
  four debug DOM attributes plus browser resource timings to a timestamped JSON
  file.
- Profiles: `local` (control), `remote-fast` (40 ms / 1000 Mbps),
  `remote-typical` (100 ms / 200 Mbps), `remote-slow` (180 ms / 60 Mbps).

Measurement-methodology caveat (important):

- The proxy initially logged duplicate rows for one physical response when
  bucket-wait timers stacked (fixed: idempotent finish). Analyses of proxy
  JSONL must dedupe rows by request `id`. Early in-session conclusions drawn
  from raw rows (multi-GB grid pressure, hundreds-of-refetches per block) were
  artifacts of that bug; every number recorded below is id-deduped.

## Baseline 17: Remote-Typical Is Unusable Before Transport Work

Date: 2026-07-01

Method: `remote-typical` shaping (100 ms first byte, 25 MB/s link),
immediate-Space scenario, hard-cold browser per run, NuScenes scene-0006 (562
MB, 19.5 s timeline).

| Metric                       |   Local control | Remote-typical baseline |
| ---------------------------- | --------------: | ----------------------: |
| Timeline index ready         |        370.6 ms |              3,592.4 ms |
| Startup buffer ready         |      1,664.8 ms |             27,452.4 ms |
| First 3D paint               |      1,680.9 ms |             27,468.6 ms |
| First playback commit        |        759.2 ms |             29,891.4 ms |
| First 10 s wall time         |     10,609.5 ms |            152,046.1 ms |
| First 10 s stalled wall time | 737.0 ms (6.9%) |    141,920.9 ms (93.3%) |
| Max single stall             |        310.2 ms |             30,664.9 ms |
| Missing-data stalls          |            0 ms |                    0 ms |

Transport ground truth (id-deduped proxy log, modal file only):

- 2,017 media range requests total; modal file fetched 637 MB with 171 MB (27%)
  exact-duplicate refetches.
- 82% of wall time had at most one media request in flight: `@mcap/core`
  fetches strictly serially (one awaited read per chunk message index, one per
  chunk), so remote playback degrades into a line of idle round trips.
- Candidate enumeration alone costs `chunks x topics` small serial `readExact`
  reads before any chunk data moves.
- Link utilization ~14%: the link could carry 25 MB/s but mostly idled between
  serialized round trips.

Interpretation:

- Truthfulness held (missing-data 0 ms) but the product was unusable: ~30 s to
  first paint and 93% stall.
- The dominant costs were (1) serialized round trips and (2) refetches from
  per-worker 128 MB caches churning under playback pressure.

## Optimization 18: Pipelined Chunk Prefetch (Reader Layer)

Date: 2026-07-01

Product stance:

- Do not change which data is read or shown; change only how bytes move.
  Prefetch is advisory: failures surface exclusively through the real read.

Refactor:

- Added `reader/chunk-prefetch.ts`: resolves the byte ranges an indexed read
  will touch (per-chunk message-index regions, then chunk data in consumption
  order) and warms them with bounded concurrency (default 6, matching the
  browser's per-origin HTTP/1.1 budget; 32-chunk cap per pass).
- `McapIndexedReaderLike` gains optional `prefetchWindow` /
  `prefetchChunkData`, wired in `createDefaultMcapReader`.
- Synchronized batch reads await the message-index warm-up before candidate
  enumeration (those `readExact` reads cannot coalesce with widened block
  fills, so ordering matters), then fire chunk-data prefetch for exactly the
  selected candidates' chunks — never for unselected scan-range chunks.
- Frame-transform windows and unbounded decoded-message reads fire
  fire-and-forget window prefetch; racing reads coalesce on identical byte
  ranges (`ByteClientReadable` in-flight map) or identical fill blocks (cached
  byte client), so the race cannot double-fetch.
- Limited (`limit`) decoded reads do not prefetch.

Validation (remote-typical, immediate-Space, cold):

| Metric                       |     Baseline | Prefetch only |
| ---------------------------- | -----------: | ------------: |
| Timeline index ready         |   3,592.4 ms |    1,874.4 ms |
| Startup buffer ready         |  27,452.4 ms |    7,956.6 ms |
| First 3D paint               |  27,468.6 ms |    7,991.9 ms |
| First playback commit        |  29,891.4 ms |    7,969.2 ms |
| First 10 s wall time         | 152,046.1 ms |  108,207.2 ms |
| First 10 s stalled wall time | 141,920.9 ms |   98,087.4 ms |

Interpretation:

- Startup transformed (first paint -71%), but sustained playback barely
  improved and modal fetch bytes rose from 637 MB to 1,041 MB with 542 MB (52%)
  duplicates: prefetched blocks were evicted from the 128 MB per-worker memory
  cache by concurrent lane traffic before consumption, then refetched serially.
- Conclusion: pipelining and cache capacity are co-dependent. Prefetch without
  a shared, larger cache trades latency for bandwidth waste on remote links.
  The two changes below must ship together.

## Optimization 19: Shared Persistent Byte Cache (Cache API L2)

Date: 2026-07-01

Product stance:

- One user opening one sample should fetch each byte from the network once,
  regardless of which worker lane or pool needs it, and revisits should not
  refetch a file that has not changed.

Refactor:

- Added `query/bytes/cache-api-byte-cache.ts`: a `ByteRangeCache` backed by the
  browser Cache API — origin-scoped, so one stored block serves the main
  thread, both playback lanes, and the grid preview pool, and survives page
  reloads.
- Keyed by content identity (stable `sourceId` + discovered size), never by
  access URL, so rotating signed object-storage URLs keep hitting. A changed
  size invalidates naturally; an ETag validator is a known follow-up.
- Layered under the memory cache in the cached byte client: memory miss →
  persistent hit promotes to memory; fetches persist fire-and-forget. Exact
  one-off (`blockFill: false`) reads stay out of the persistent layer so it
  holds only deterministic block/chunk shapes.
- Feature-detected (no-op in non-secure contexts); `persistent: false` opts
  out. Approximate budgets: 256 entries per source, 8 sources, oldest-first.

Validation (remote-typical, immediate-Space, cold browser profile):

| Metric                       |     Baseline | Prefetch + L2 |          Change |
| ---------------------------- | -----------: | ------------: | --------------: |
| Timeline index ready         |   3,592.4 ms |    1,209.8 ms |            -67% |
| Startup buffer ready         |  27,452.4 ms |    7,108.7 ms |            -74% |
| First 3D paint               |  27,468.6 ms |    7,144.2 ms |            -74% |
| First playback commit        |  29,891.4 ms |    7,122.1 ms |            -76% |
| First 10 s wall time         | 152,046.1 ms |   46,913.4 ms |     3.2x faster |
| First 10 s stalled wall time | 141,920.9 ms |   36,693.3 ms |            -74% |
| Max single stall             |  30,664.9 ms |   13,297.2 ms |            -57% |
| Missing-data stalls          |         0 ms |       98.7 ms | small, truthful |
| Modal bytes fetched          |       637 MB |        652 MB |              ~0 |
| Modal duplicate bytes        | 171 MB (27%) |    59 MB (9%) |            -65% |
| Media range requests (all)   |        2,017 |           748 |            -63% |

Local control after both changes: first commit 461.8 ms, first 3D paint 940.2
ms, first 10 s stall 579.4 ms (5.4%) — same or better than before.

Interpretation:

- The pair delivers the structural win: pipelined fetches at baseline-level
  byte cost, 3.2x faster sustained playback, and a warm-revisit path (a second
  visit to the same sample serves init reads from disk).
- Remote-typical playback is still not realtime (78% stall). Two causes remain,
  in order: (1) this file's full-fidelity content bitrate (~43 MB/s peak
  demand) exceeds the 25 MB/s emulated link — no transport work can fix that;
  it is an adaptive-policy question; (2) average link draw was ~12 MB/s, so
  scheduling gaps (lane turnarounds, idle-lane contention, decode) now hide
  remaining headroom — the next audit target.

## Product 20: Attribute Buffering To Slow Networks In The Top Bar

Date: 2026-07-01

Product stance:

- When content bitrate exceeds link throughput, no transport work can make
  playback realtime. The honest experience is longer buffering — and the user
  should learn the wait is their network, not a broken viewer.
- A stall with an idle link must NOT be blamed on the network: that is a
  scheduling or decode gap, and mis-attributing it would hide our own bugs.

Refactor:

- Always-on `onRead` observer on the byte cache layers (independent of the
  debug flag) feeding a per-worker transport meter: fetched bytes plus busy
  time as the union of fetch intervals (parallel fetches count wall time once).
- Cumulative meter snapshots piggyback on every worker RPC response; the worker
  client fans them out to `subscribeTransport` listeners.
- Main-thread rolling-window estimator (pure, unit-tested) combines the engine
  buffering flag / pending-play intent with link busy fraction: "network
  limited" requires sustained buffering (>= 1.25 s) while the busiest lane kept
  the link >= 50% occupied. Asymmetric exit (2.5 s calm, or busy fraction <
  25%) prevents flapping at batch boundaries.
- `McapNetworkStatusPill` in the modal top bar (header caption slot): "Slow
  network" plus observed throughput, e.g. `2 MB/s`. Only rendered while
  limited.

Validation (Playwright probe, immediate-Space):

| Profile                  | Result                                       |
| ------------------------ | -------------------------------------------- |
| `remote-slow` (7.5 MB/s) | Pill appears 2.5 s into buffering, live MB/s |
| `local` (unshaped)       | Pill never appears across 45 s               |

## Optimization 21: Network-Aware Idle-Work Gate

Date: 2026-07-01

Product stance:

- Speculative idle reads (background lookahead top-ups, paused warmup,
  transform runway extensions) should yield the link while a constrained
  network is the reason the user is waiting — and never change behavior on
  healthy transports.

Refactor:

- Pure gate `shouldDeferMcapIdleWork` (unit-tested): active only while the
  network-limited verdict holds; defers idle work during buffering or accepted
  play intent, plus a 1.5 s post-seek cooldown while foreground catch-up owns
  the link.
- Wired into the playing-time background top-up and the paused idle warmup loop
  (which retries on its cadence rather than dying when gated), and into
  transform runway extensions via a nullable playback-store context so
  standalone callers and tests keep ungated behavior.
- Debug metric `network limited idle deferrals` records gated passes.

Validation (remote-typical, immediate-Space, warm-L2 runs):

| Metric                       | Prefetch + L2 | + idle gate |
| ---------------------------- | ------------: | ----------: |
| Startup buffer ready         |    6,586.0 ms |  5,501.4 ms |
| First 3D paint               |    6,616.1 ms |  5,544.7 ms |
| First 10 s stalled wall time |   37,519.5 ms | 38,717.4 ms |
| Stall percent                |         78.6% |       79.2% |

Local control: unchanged (5.9% stall vs 5.4%, run noise; the gate cannot fire
while the limited verdict is false).

Honest interpretation:

- Startup improved (~1.1 s) but the first-10 s stall profile is flat. The
  transport log explains why: on this profile the link is over-subscribed by
  playback-critical work itself (startup fills, current-frame, playback
  batches, transform placement), and runway extensions key off playhead
  movement, which freezes during stalls — so there was little idle traffic left
  for the gate to shed inside the measured window.
- The gate remains correct hygiene: it bounds idle pileups on moderately
  constrained links and protects post-seek recovery, at zero healthy-path cost.
  But the binding constraint on remote-typical is content bitrate vs link
  throughput, which only adaptive fidelity (product) or server-side assists can
  move.

## Hardening 22: ETag Validation, Abort-On-Seek, Measured Block Size

Date: 2026-07-01

Three ship-safety changes; none chases benchmark numbers, all close field
failure modes.

ETag validation (correctness):

- The HTTP byte client now captures normalized ETags from HEAD and ranged
  responses into the source descriptor; `ByteClientReadable` absorbs them and
  fires one non-blocking HEAD when metadata-supplied sizes would otherwise
  leave a warm persistent-cache session fully network-free.
- Persistent-cache entries store the validator and read as a miss (with
  deletion) when it changes: a re-ingested file under the same id and size can
  no longer serve stale bytes. Entries written before discovery stay servable;
  the first transport touch bounds that window.

Abort-on-seek (interactivity):

- Byte reads accept abort signals end-to-end: request → cached client → HTTP
  fetch. The worker scheduler aborts the running job's signal on cancel; one
  mutable slot per serial lane scopes reads to their owning request without
  threading signals through `@mcap/core`.
- `cancelIdleReads()` on the worker client cancels queued and in-flight
  speculative idle work (synchronized batches and transform runway windows only
  — bootstrap/topics/bounds are excluded so their error paths cannot surface UI
  states from a seek). The data stream calls it on every seek.
- Cancellations reject with a canonical marker and are benign by contract: no
  failure streaks, no transform error states, no retry spend. Late worker
  responses for cancelled ids are ignored.

Measured block-size promotion (misclassified sources):

- Scheme-based profiles miss "local" paths served by a remote FiftyOne session.
  A per-source EWMA of small-fetch latency (>= 30 ms over >= 4 samples)
  promotes such sources to the remote fill size — a one-way latch, since
  flapping block sizes would fragment cache keys. Explicit block-size overrides
  bypass the heuristic entirely.

Validation:

- Unit coverage per layer (validator round-trips and mismatches, scheduler
  abort of running jobs, transport local cancellation, client idle-cancel,
  promotion thresholds and latch).
- Remote-typical capture (warm L2): first 10 s wall 48.9 s → 32.1 s and stall
  79.2% → 67.6% versus the idle-gate run — consistent with block-size promotion
  engaging, because the harness serves a scheme-local path over a shaped WAN,
  exactly the misclassified case. Treat the delta as one run's evidence, not a
  controlled experiment.
- Local control: unchanged (5.2% stall; fast reads never promote).

## Remote Next Steps

1. Idle-lane bandwidth budgets: lanes isolate CPU but share the link; idle
   prefetch and transform runway should yield to foreground reads on
   constrained transports, and pause briefly after seeks. — Shipped as
   Optimization 21 (gate on the limited verdict).
2. Re-attribute remaining remote stalls now that transport is honest: measure
   lane turnaround gaps and decode occupancy against link idle time.
3. Adaptive fidelity policy (product decision): when content bitrate exceeds
   measured link throughput, choose between longer buffering, topic-priority
   degradation (e.g. radar first), or server-side assists (topic-filtered
   slices; per-topic re-chunking at ingest).
4. Read-profile detection by measured first-read latency instead of filepath
   scheme (a local path served by a remote FiftyOne session is remote in every
   way that matters).
5. ETag validator for the persistent byte cache; abort-on-seek plumbing for
   in-flight range requests.
6. Persistence policy review: Cache API stores object-storage bytes on the
   user's disk (same exposure class as the browser HTTP cache, but worth an
   explicit enterprise sign-off; `persistent: false` is the kill switch).

## Next Steps

1. Make baseline capture repeatable with a small browser/dev helper that writes
   the three debug DOM attributes to a timestamped JSON file.
2. Stabilize the capture surface so before/after runs use the same active
   stream count and layout.
3. Treat `0.5 s / 15 ticks` as the current local startup cushion unless a new
   cold baseline shows consistent stalls above the local target.
4. Add explicit idle-lane budgets and source-profile policy:
    - Local can be more aggressive.
    - Remote should cap concurrent idle byte pressure and ramp after playback
      stays smooth.
    - Idle work should pause briefly after seek, step, or a foreground miss.
5. Reduce duplicated current-frame/startup pressure:
    - Dedupe current-frame reads by tick/topic set.
    - Avoid issuing one current-frame fetch and a startup batch for overlapping
      data when the batch can satisfy both.
6. Reduce idle transform runway byte pressure:
    - keep transform windows bounded and progressive;
    - avoid refetching overlapping chunks for adjacent transform windows;
    - keep all transform runway work idle unless a user action explicitly needs
      a foreground transform.
7. Reduce the byte cost of the now-smooth paused warmup further:
    - Start with a shallow all-pane background horizon.
    - Ramp the horizon only after playback has stayed ready for a short window.
    - Keep images/current-frame responsive instead of coupling them to heavy
      background work.
8. Re-run both baselines after each refactor:
    - immediate Space after session start;
    - wait idle for 10 seconds, then Space.
9. Compare:
    - First 3D paint.
    - Playhead buffer ready.
    - Startup buffer ready.
    - First 10 s stalled wall time.
    - Max single stall.
    - Effective MB in the 0-1 s, 2-5 s, and 5-10 s buckets.
10. After scheduling is healthy, test chunk-level changes:
    - Smaller initial byte windows for local startup.
    - Controlled concurrency for point-cloud chunks.
    - Request coalescing where adjacent windows repeatedly hit the same chunk.
    - Prioritized cancellation or demotion for background reads after seeks.
11. Suggested local success targets:
    - First 3D paint under 1 second.
    - Playhead buffer ready under 1.5 seconds.
    - Startup buffer ready under 2 seconds.
    - First 10 s stalled wall time under 250 ms.
    - Missing-data stalled wall time stays at 0 ms.
    - 0-5 s effective bytes materially lower than this baseline without hiding
      truthful data.
