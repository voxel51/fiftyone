# Video playback perf harness

`playback-perf.cjs` is a standalone Playwright probe for measuring video
playback smoothness in the modal (Lighter video in Explore, or Annotate). It is
not part of the Playwright test suite; it runs against a live dev app + API and
writes a JSON report you can diff between branches.

It was built to compare the label warmup / `warmupAll` fan-out and the mask
overlay stack (#8527 / #8544 / #8545) before and after changes.

## What it measures

Per run, during a fixed play window:

- presented-frame cadence via `requestVideoFrameCallback` (or the imavid canvas
  paint counter when no `<video>` element drives playback): p50 / p95 / p99 /
  max interval, stutter events (> 1.5x the expected frame interval), severe
  stutters
- dropped frames from `video.getVideoPlaybackQuality()`
- main-thread long tasks (> 50 ms) during play: count, total ms, max ms
- `<video>` `waiting` / `stalled` events
- playhead seconds actually advanced, and whether the player paused itself
- every request to the API origin, with `/video-labels/window` count and max
  in-flight concurrency during play, so the label fan-out can be compared
  against the media fetch
- the app's own "achieved speed" readout when it under-delivers

## Setup

1. Start the API (`:5151`) and the app dev server (`:5173` or `:5174`).
2. Create a fixture. Two that have been useful:
    - `perf_longclip`: one ~10 minute 30 fps clip with dense per-frame
      detections, so the whole-clip warmup fans out to ~300 window chunks. Any
      long mp4 works; encode a static clip with ffmpeg, then:
        ```sh
        python e2e-pw/scripts/gen_perf_longclip.py --video /path/to/longclip.mp4
        ```
    - a dense 1080p clip with per-frame `Segmentation` + `Heatmap` fields for
      the mask overlay path.
3. Playwright is already a dependency of `e2e-pw`; run from that directory so
   `require("playwright")` resolves.

## Running

```sh
cd e2e-pw
node scripts/playback-perf.cjs \
  --url http://localhost:5173 --api http://localhost:5151 \
  --dataset perf_longclip --sample-id <sample id> --mode explore \
  --runs 3 --play-ms 10000 --label baseline --out /tmp/baseline.json \
  --headed 0 \
  --browser-args "--use-angle=vulkan,--enable-features=Vulkan,--ignore-gpu-blocklist"
```

Flags:

| flag             | default                      | notes                                                                     |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------- |
| `--url`          | `http://127.0.0.1:5174`      | app origin                                                                |
| `--api`          | `http://127.0.0.1:5151`      | API origin; requests to it are captured                                   |
| `--dataset`      | `perf_longclip`              | dataset name                                                              |
| `--sample-id`    |                              | open the modal directly on this sample (recommended)                      |
| `--mode`         | `annotate`                   | `explore` or `annotate`                                                   |
| `--fields`       |                              | sidebar fields to force, e.g. `on:frames.segmentation,off:frames.heatmap` |
| `--fps`          | `30`                         | expected fps, sets the stutter threshold                                  |
| `--runs`         | `5`                          |                                                                           |
| `--play-ms`      | `15000`                      | play window                                                               |
| `--open-ms`      | `10000`                      | settle time after the modal opens before play                             |
| `--label`        | `run`                        | tag in the report and log                                                 |
| `--out`          | `/tmp/playback-<label>.json` | report path                                                               |
| `--raw-out`      |                              | also dump raw per-run samples to `<raw-out>-<run>.json`                   |
| `--headed`       | `1`                          | `0` for headless                                                          |
| `--browser-args` |                              | comma-separated extra Chromium switches                                   |

## Gotchas

- Use `localhost`, not `127.0.0.1`, if your server's `allowed_origins` only
  lists localhost. Otherwise CORS blocks every request and the grid never
  renders.
- `--mode annotate` hangs on datasets with no annotation schema (the Annotate
  top bar never appears). Lighter video is the Explore modal.
- Prefer `--sample-id`; the grid-click path is slow and flaky.
- Plain headless Chromium renders WebGL with SwiftShader. Pass the Vulkan flags
  above to get the real GPU, otherwise mask/shader numbers are not
  representative.
- Long tasks are only captured for the main thread; worker time shows up
  indirectly as cadence.

## Reading the report

`--out` is an array of per-run objects. The `playback` block has the numbers
above; compare medians across runs, not single runs. A healthy 30 fps run looks
like p50 ~33 ms, p95 <= 50 ms, few stutters, zero long tasks, and
`advancedSeconds` close to `play-ms / 1000`.
