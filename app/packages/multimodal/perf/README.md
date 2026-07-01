# MCAP playback performance capture harness

Repeatable measurement of MCAP modal playback under emulated remote (object
storage) transport. Companion to `performance-optimization-instrumentation.md`
at the repo root.

## Pieces

- `shaping-proxy.mjs` — reverse proxy that adds deterministic per-request
  first-byte latency and a shared link bandwidth cap to `/media` responses, and
  logs every request as JSONL (ground-truth request timeline).
- `capture-run.mjs` — Playwright driver that runs a playback scenario against
  the app and writes the in-app debug instrumentation (`data-mcap-latency-*`,
  `data-mcap-worker-attribution`) plus browser resource timings to
  `runs/<label>-<timestamp>.json`.

## Setup (three processes)

```bash
# 1. FiftyOne server (any port; example: 5152)
python fiftyone/server/main.py --port 5152

# 2. Shaping proxy in front of it
node app/packages/multimodal/perf/shaping-proxy.mjs \
  --listen 5153 --target http://127.0.0.1:5152 \
  --profile remote-typical --log app/packages/multimodal/perf/runs/proxy.jsonl

# 3. App dev server pointed at the proxy (isolated from your normal dev app)
cd app/packages/app && VITE_API=http://127.0.0.1:5153 \
  ../../node_modules/.bin/vite --port 5175 --strictPort
```

Playwright is resolved from `e2e-pw/node_modules` (run `yarn install` there) or
from `PLAYWRIGHT_BASE=<dir containing node_modules/playwright>`.

## Shaping profiles

| Profile          | First-byte latency | Link rate | Emulates                              |
| ---------------- | -----------------: | --------: | ------------------------------------- |
| `local`          |               0 ms | unlimited | control run (proxy still logs)        |
| `remote-fast`    |              40 ms | 1000 Mbps | same-region object storage, good link |
| `remote-typical` |             100 ms |  200 Mbps | cross-region / VPN-fronted storage    |
| `remote-slow`    |             180 ms |   60 Mbps | distant region / constrained link     |

Override piecemeal with `--latency-ms` / `--mbps`.

## Running a capture

```bash
node app/packages/multimodal/perf/capture-run.mjs \
  --app http://localhost:5175 \
  --dataset nuscenes-mcap-local \
  --sample 6a1b1814ed669ab6352e8043 \
  --scenario immediate-space \
  --label remote-typical-baseline \
  --proxy-status http://localhost:5153/__shape__/status \
  --warmup
```

Scenarios:

- `immediate-space` — press Space as soon as the timeline index is ready
  (worst-case cold start; matches the perf doc's immediate-Space runs).
- `ready-space` — press Space once the startup buffer is ready.
- `idle10-space` — wait 10 s paused after startup readiness, then Space
  (measures paused idle warmup).

Each run uses a fresh `perfRun` token and a fresh browser instance, so it is
cold at the browser layer. Use `--warmup` once after starting a new Vite
instance so dev-server transform time does not pollute the first measured run.

Rules of interpretation (carried over from the perf doc):

- Only compare runs with the same scenario, profile, dataset, sample, and
  active layout.
- The JSONL proxy log is the transport ground truth: use it to inspect request
  concurrency (serialized chunk fetches show as non-overlapping time ranges)
  and byte pressure per run window.
- Always dedupe log rows by the `id` field before aggregating. One physical
  response logs once, but treating rows as independent without the id guard has
  burned an analysis before.
