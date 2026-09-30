/**
 * Video playback perf probe. Opens a video sample in Annotate (or Explore),
 * plays a fixed window, and records real playback instrumentation:
 *
 *   - presented-frame cadence via requestVideoFrameCallback (p50/p95/p99,
 *     stutter events = intervals > 1.5x expected)
 *   - dropped frames via video.getVideoPlaybackQuality()
 *   - main-thread long tasks during playback (count + total blocking ms)
 *   - <video> stall events (waiting/stalled) and total stalled ms
 *   - every request to the API origin, with in-flight concurrency over time,
 *     so the label-window fan-out can be compared against the video's own
 *     byte fetch
 *   - the app's own "achieved speed" readout when it under-delivers
 *
 * Usage:
 *   node playback-perf.cjs --url http://127.0.0.1:5174 --dataset perf_longclip \
 *     --label PR --runs 5 --play-ms 15000 --out /tmp/pr.json
 */
const fs = require("node:fs");
const { chromium } = require("playwright");

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};

const APP = arg("url", "http://127.0.0.1:5174");
const API = arg("api", "http://127.0.0.1:5151");
const DATASET = arg("dataset", "perf_longclip");
const LABEL = arg("label", "run");
const RUNS = Number.parseInt(arg("runs", "5"), 10);
const PLAY_MS = Number.parseInt(arg("play-ms", "15000"), 10);
const OPEN_MS = Number.parseInt(arg("open-ms", "10000"), 10);
const MODE = arg("mode", "annotate");
const OUT = arg("out", `/tmp/playback-${LABEL}.json`);
const HEADED = arg("headed", "1") === "1";
// Open the modal directly on this sample instead of clicking the first grid tile.
const SAMPLE_ID = arg("sample-id", "");
// Sidebar fields to force on/off in the modal before playing, e.g.
// "on:frames.segmentation,off:frames.heatmap". Matched by row label text.
const FIELDS = arg("fields", "");
const EXPECTED_FPS = Number.parseFloat(arg("fps", "30"));
// Also dump the raw in-page samples (vfc frames, playhead, long tasks, events)
// per run to `<raw-out>-<run>.json`, for locating stalls on a timeline.
const RAW_OUT = arg("raw-out", "");
// Extra Chromium switches, comma-separated (e.g. to get a real GPU headless).
const BROWSER_ARGS = arg("browser-args", "").split(",").filter(Boolean);

const pct = (sorted, p) =>
  sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]
    : 0;

/** Max simultaneous in-flight requests, from [start,end] spans. */
const maxConcurrency = (spans) => {
  const events = [];
  for (const s of spans) {
    events.push([s.start, 1]);
    events.push([s.end ?? s.start, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  let max = 0;
  for (const [, d] of events) {
    cur += d;
    if (cur > max) max = cur;
  }
  return max;
};

const INSTRUMENT = () => {
  window.__perf = { longtasks: [], events: [], t0: performance.now() };
  // The annotate surface for a video renders an imavid 2D frame canvas, not a
  // <video>, so the real "presented frame" signal is the tile's drawImage.
  window.__paints = [];
  try {
    const proto = CanvasRenderingContext2D.prototype;
    for (const method of ["drawImage", "putImageData"]) {
      const orig = proto[method];
      proto[method] = function (...args) {
        try {
          if (
            this.canvas &&
            this.canvas.dataset &&
            this.canvas.dataset.cy === "imavid-frame-canvas"
          ) {
            window.__paints.push(performance.now());
          }
        } catch (_) {}
        return orig.apply(this, args);
      };
    }
  } catch (_) {
    /* canvas tap unavailable */
  }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__perf.longtasks.push({ start: e.startTime, dur: e.duration });
      }
    }).observe({ entryTypes: ["longtask"] });
  } catch (_) {
    /* longtask unsupported */
  }
};

/** Attach vfc + media-event capture to the annotation surface's <video>. */
const ATTACH_VIDEO = () => {
  // Playhead sampler: works for both surfaces, and is the only progress signal
  // when the tile is an imavid canvas.
  window.__playhead = [];
  const sample = () => {
    const el = document.querySelector("[data-testid='timeline-playhead-time']");
    const btn = document.querySelector(
      "[data-testid='timeline-controls-play-pause']",
    );
    window.__playhead.push({
      t: performance.now(),
      v: el ? el.textContent : null,
      // The transport button's label says whether the engine thinks it is
      // playing, which is how a pause that nobody asked for shows up.
      b: btn ? btn.getAttribute("aria-label") || btn.textContent : null,
      buf: !!document.querySelector(
        "[data-testid='timeline-controls-buffering']",
      ),
    });
    window.__playheadRaf = requestAnimationFrame(sample);
  };
  sample();
  const v = document.querySelector("video");
  if (!v) return false;
  window.__vfc = { frames: [], attached: true };
  const tick = (now, meta) => {
    window.__vfc.frames.push({
      now,
      mediaTime: meta.mediaTime,
      presented: meta.presentedFrames,
    });
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick);
  };
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick);
  for (const type of ["waiting", "stalled", "playing", "pause", "seeking"]) {
    v.addEventListener(type, () => {
      window.__perf.events.push({ type, t: performance.now() });
    });
  }
  return true;
};

const READ = () => {
  const v = document.querySelector("video");
  const q = v && v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
  const achieved = document.querySelector(
    "[data-testid='timeline-controls-achieved-speed']",
  );
  const buffered = [];
  if (v) {
    for (let i = 0; i < v.buffered.length; i++) {
      buffered.push([v.buffered.start(i), v.buffered.end(i)]);
    }
  }
  return {
    paints: window.__paints || [],
    playhead: window.__playhead || [],
    paintCanvas: !!document.querySelector("[data-cy='imavid-frame-canvas']"),
    frames: window.__vfc ? window.__vfc.frames : [],
    longtasks: window.__perf.longtasks,
    events: window.__perf.events,
    dropped: q ? q.droppedVideoFrames : null,
    totalVideoFrames: q ? q.totalVideoFrames : null,
    currentTime: v ? v.currentTime : null,
    paused: v ? v.paused : null,
    achievedSpeed: achieved ? achieved.textContent : null,
    videoSrc: v ? v.currentSrc : null,
  };
};

const runOnce = async (browser, idx) => {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  await context.addInitScript(INSTRUMENT);
  const page = await context.newPage();

  // Request spans to the API origin. Playwright request/response events carry
  // no timing, so wall-clock at event time is the measure; it is the same clock
  // for every branch, which is what the comparison needs.
  const spans = new Map();
  const done = [];
  const origin = new URL(API).host;
  const stamp = () => Date.now();
  page.on("request", (r) => {
    if (new URL(r.url()).host !== origin) return;
    spans.set(r, { url: r.url(), method: r.method(), start: stamp() });
  });
  const finish = (r) => {
    const s = spans.get(r);
    if (!s) return;
    s.end = stamp();
    done.push(s);
    spans.delete(r);
  };
  page.on("requestfinished", finish);
  page.on("requestfailed", finish);
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const t0 = Date.now();
  await page.goto(
    SAMPLE_ID
      ? `${APP}/datasets/${DATASET}?id=${SAMPLE_ID}`
      : `${APP}/datasets/${DATASET}`,
    { waitUntil: "domcontentloaded", timeout: 120000 },
  );
  if (SAMPLE_ID) {
    await page.locator("[data-cy='modal']").waitFor({ timeout: 120000 });
  } else {
    await page
      .locator("[data-cy='looker']")
      .first()
      .waitFor({ timeout: 120000 });
  }
  await page.waitForTimeout(3000);

  // Open the modal.
  for (let i = 0; i < 10 && !SAMPLE_ID; i++) {
    await page.evaluate(() =>
      document
        .querySelector("[data-cy='looker']")
        ?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        ),
    );
    await page.waitForTimeout(1500);
    if (await page.locator("[data-cy='modal']").count()) break;
  }
  if (!(await page.locator("[data-cy='modal']").count())) {
    await context.close();
    throw new Error("modal never opened");
  }

  // Switch mode. This is the moment warmup is dispatched, so mark it.
  const tModeClick = Date.now();
  // JS dispatch rather than a real click: on some builds an overlay fails
  // Playwright's actionability check even though the tab is hittable.
  await page.evaluate((mode) => {
    document
      .querySelector(`[data-cy='${mode}']`)
      ?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
  }, MODE);
  if (MODE === "annotate") {
    await page
      .locator("[data-cy='video-annotation-top-bar']")
      .waitFor({ timeout: 120000 });
  }
  const tSurfaceReady = Date.now();

  // Force the requested sidebar fields before the open phase is measured.
  for (const spec of FIELDS.split(",").filter(Boolean)) {
    const [want, name] = spec.split(":");
    const result = await page.evaluate(
      ({ want, name }) => {
        const root = document.querySelector("[data-cy='modal']") || document;
        // Prefer the sidebar's own hook: `checkbox-<field path>`.
        const direct = root.querySelector(`[data-cy='checkbox-${name}']`);
        const directInput =
          direct && direct.matches("input[type=checkbox]")
            ? direct
            : direct?.querySelector("input[type=checkbox]");
        if (directInput) {
          const checked = directInput.checked;
          if ((want === "on") !== checked) directInput.click();
          return checked === (want === "on") ? "already" : "toggled";
        }
        const el = [...root.querySelectorAll("*")].find(
          (e) => e.childElementCount === 0 && e.textContent.trim() === name,
        );
        if (!el) return "no label";
        let n = el;
        for (let i = 0; i < 8 && n; i++) {
          const cbs = n.querySelectorAll("input[type=checkbox]");
          if (cbs.length === 1 && n.innerText.trim().length < 60) {
            const checked = cbs[0].checked;
            if ((want === "on") !== checked) cbs[0].click();
            return checked === (want === "on") ? "already" : "toggled";
          }
          n = n.parentElement;
        }
        return "no checkbox";
      },
      { want, name },
    );
    process.stderr.write(`  field ${name} ${want}: ${result}\n`);
    await page.waitForTimeout(1500);
  }

  // Let the open-phase fan-out play out before touching the transport.
  await page.waitForTimeout(OPEN_MS);
  const tOpenPhaseEnd = Date.now();

  const attached = await page.evaluate(ATTACH_VIDEO);
  const playBtn = page.locator("[data-testid='timeline-controls-play-pause']");
  await playBtn.waitFor({ timeout: 60000 });
  // Paints before the transport starts are open-phase repaints, not playback.
  const paintBaseline = await page.evaluate(() => window.__paints.length);
  const tPlay = Date.now();
  const perfPlay = await page.evaluate(() => performance.now());
  await playBtn.click();
  await page.waitForTimeout(PLAY_MS);
  const tPlayEnd = Date.now();

  const read = await page.evaluate(READ);
  if (RAW_OUT) {
    fs.writeFileSync(
      `${RAW_OUT}-${idx}.json`,
      JSON.stringify(
        { perfPlay, tPlayMs: tPlay, read, spans: done, consoleErrors },
        null,
        1,
      ),
    );
  }
  await page.screenshot({ path: `/tmp/playback-${LABEL}-${idx}.png` });
  await context.close();

  // ---- derive metrics ----
  const openSpans = done.filter(
    (s) => s.start >= tModeClick && s.start <= tOpenPhaseEnd,
  );
  const windowSpans = done.filter((s) =>
    s.url.includes("/video-labels/window"),
  );
  const openWindows = windowSpans.filter(
    (s) => s.start >= tModeClick && s.start <= tOpenPhaseEnd,
  );
  const playWindows = windowSpans.filter((s) => s.start >= tPlay);
  const mediaSpans = done.filter(
    (s) => !s.url.includes("/video-labels/") && /\/media|\.mp4/.test(s.url),
  );

  // Presented-frame cadence during the play window only. The imavid tile is a
  // 2D canvas, so its drawImage calls are the presented frames; a <video>
  // surface still uses vfc.
  const frames = read.frames.filter((f) => f.now > 0);
  const paintTimes = read.paints.slice(paintBaseline);
  const source = paintTimes.length ? "canvas-paint" : "vfc";
  const intervals = [];
  if (paintTimes.length) {
    for (let i = 1; i < paintTimes.length; i++) {
      intervals.push(paintTimes[i] - paintTimes[i - 1]);
    }
  } else {
    for (let i = 1; i < frames.length; i++) {
      intervals.push(frames[i].now - frames[i - 1].now);
    }
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  // Expected interval from the clip's own advertised cadence (30fps fixture).
  const expected = 1000 / EXPECTED_FPS;
  const stutters = intervals.filter((d) => d > expected * 1.5).length;
  const bigStutters = intervals.filter((d) => d > expected * 4).length;

  // Long tasks (>50ms main-thread blocks) inside the play window only.
  const playLongtasks = read.longtasks.filter((l) => l.start >= perfPlay);
  const ltTotal = playLongtasks.reduce((a, l) => a + l.dur, 0);

  const waits = read.events.filter((e) => e.type === "waiting").length;
  const stalledEvents = read.events.filter((e) => e.type === "stalled").length;

  return {
    label: LABEL,
    run: idx,
    mode: MODE,
    timings: {
      loadToModal: tModeClick - t0,
      modeClickToSurfaceReady: tSurfaceReady - tModeClick,
      playWindowMs: tPlayEnd - tPlay,
    },
    open: {
      apiRequests: openSpans.length,
      labelWindowRequests: openWindows.length,
      labelWindowMaxConcurrency: maxConcurrency(openWindows),
      allApiMaxConcurrency: maxConcurrency(openSpans),
      labelWindowSpanMs: openWindows.length
        ? Math.max(...openWindows.map((s) => s.end ?? s.start)) -
          Math.min(...openWindows.map((s) => s.start))
        : 0,
      medianWindowLatencyMs: pct(
        openWindows
          .map((s) => (s.end ?? s.start) - s.start)
          .sort((a, b) => a - b),
        0.5,
      ),
    },
    playback: {
      cadenceSource: source,
      vfcAttached: attached,
      imavidCanvas: read.paintCanvas,
      presentedFrameSamples: paintTimes.length || frames.length,
      paintsDuringPlay: paintTimes.length,
      achievedFps: Number(
        (paintTimes.length / ((tPlayEnd - tPlay) / 1000)).toFixed(2),
      ),
      playheadMoved:
        read.playhead.length > 1 &&
        read.playhead[0].v !== read.playhead[read.playhead.length - 1].v,
      playheadFirst: read.playhead.length ? read.playhead[0].v : null,
      playheadLast: read.playhead.length
        ? read.playhead[read.playhead.length - 1].v
        : null,
      droppedVideoFrames: read.dropped,
      totalVideoFrames: read.totalVideoFrames,
      dropRatePct:
        read.totalVideoFrames > 0
          ? Number(((read.dropped / read.totalVideoFrames) * 100).toFixed(2))
          : null,
      intervalP50: Number(pct(sorted, 0.5).toFixed(2)),
      intervalP95: Number(pct(sorted, 0.95).toFixed(2)),
      intervalP99: Number(pct(sorted, 0.99).toFixed(2)),
      intervalMax: Number(
        (sorted.length ? sorted[sorted.length - 1] : 0).toFixed(2),
      ),
      stutterEvents: stutters,
      severeStutterEvents: bigStutters,
      longTaskCount: playLongtasks.length,
      longTaskTotalMs: Number(ltTotal.toFixed(1)),
      longTaskMaxMs: Number(
        Math.max(0, ...playLongtasks.map((l) => l.dur)).toFixed(1),
      ),
      waitingEvents: waits,
      stalledEvents,
      achievedSpeed: read.achievedSpeed,
      advancedSeconds: read.currentTime,
      paused: read.paused,
      labelWindowRequestsDuringPlay: playWindows.length,
      labelWindowMaxConcurrencyDuringPlay: maxConcurrency(playWindows),
      mediaRequests: mediaSpans.length,
    },
  };
};

(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: !HEADED,
    args: [...(HEADED ? [] : ["--no-sandbox"]), ...BROWSER_ARGS],
  });
  const results = [];
  for (let i = 0; i < RUNS; i++) {
    process.stderr.write(`[${LABEL}] run ${i + 1}/${RUNS}…\n`);
    try {
      const r = await runOnce(browser, i);
      results.push(r);
      process.stderr.write(
        `  fps=${r.playback.achievedFps} p95=${r.playback.intervalP95}ms ` +
          `stutters=${r.playback.stutterEvents} lt=${r.playback.longTaskTotalMs}ms ` +
          `openWindows=${r.open.labelWindowRequests} maxConc=${r.open.labelWindowMaxConcurrency}\n`,
      );
    } catch (e) {
      process.stderr.write(`  FAILED: ${e.message}\n`);
      results.push({ label: LABEL, run: i, error: e.message });
    }
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  process.stderr.write(`wrote ${OUT}\n`);
})();
