#!/usr/bin/env node
/**
 * Sample-navigation churn probe for the MCAP modal shell.
 *
 * Walks the real user flow — grid → modal, then in-modal next-sample hops,
 * then a dismiss-and-reopen round trip — and measures what each transition
 * costs: time to timeline-ready and first 3D paint, worker respawns, canvas
 * (WebGL context) rebuilds, main-thread long tasks, and JS heap trend.
 *
 * Usage:
 *   node nav-churn-probe.mjs --app http://localhost:5175 \
 *     --dataset nuscenes-mcap-local [--hops 4] [--headless] \
 *     [--trace-label <name>]
 *
 * --trace-label writes a per-transition timeline dump (latency events,
 * worker attribution/scheduler console rows) to runs/nav-trace-<name>.json.
 * Headless runs render WebGL in software and inflate paint times and long
 * tasks; use headed runs when comparing against prior numbers.
 *
 * Playwright resolves like capture-run.mjs (PLAYWRIGHT_BASE or e2e-pw).
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const appOrigin = (args["app"] ?? "http://localhost:5175").replace(/\/$/, "");
const dataset = args["dataset"] ?? "nuscenes-mcap-local";
const hops = Number(args["hops"] ?? 4);
const headless = Boolean(args["headless"]);
const traceLabel = args["trace-label"] ?? null;

const { chromium } = resolvePlaywright();

const browser = await chromium.launch({ headless });
const context = await browser.newContext({
  viewport: { height: 1080, width: 1860 },
});
const page = await context.newPage();

// Worker attribution and scheduler rows are console-logged continuously,
// across latency-session resets — the only capture that survives a hop's
// session restart. Stamped with Node wall-clock for cross-source ordering.
// Per-chunk-read logs are skipped: they are per-read chatty and their bytes
// are already aggregated into the attribution rows.
const consoleRows = [];
page.on("console", (message) => {
  const text = message.text();
  if (
    !text.startsWith("[mcap] worker attribution") &&
    !text.startsWith("[mcap] worker job")
  ) {
    return;
  }
  const row = { atMs: Date.now(), text: text.slice(0, 200) };
  consoleRows.push(row);
  const detailArg = message.args()[1];
  if (detailArg) {
    detailArg
      .jsonValue()
      .then((value) => {
        row.detail = value;
      })
      .catch(() => undefined);
  }
});
const traces = [];

let workersSpawned = 0;
const liveWorkers = new Set();
page.on("worker", (worker) => {
  workersSpawned += 1;
  liveWorkers.add(worker);
  worker.on("close", () => liveWorkers.delete(worker));
});

// Long-task accounting per transition window.
await page.addInitScript(() => {
  window.__longTasks = { count: 0, maxMs: 0, totalMs: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__longTasks.count += 1;
        window.__longTasks.totalMs += entry.duration;
        window.__longTasks.maxMs = Math.max(
          window.__longTasks.maxMs,
          entry.duration,
        );
      }
    }).observe({ entryTypes: ["longtask"] });
  } catch {
    // Long-task observation is best-effort.
  }
});

const rows = [];

await page.goto(
  `${appOrigin}/datasets/${encodeURIComponent(dataset)}?mcapLatencyDebug=1&navProbe=${Date.now()}`,
  { waitUntil: "domcontentloaded" },
);

// Consent and promo overlays eat pointer events; clear them first.
await page.waitForTimeout(1_500);
for (const label of ["Allow", "Dismiss"]) {
  const overlayButton = page.getByRole("button", { name: label }).first();
  if (await overlayButton.isVisible().catch(() => false)) {
    await overlayButton.click().catch(() => undefined);
    await page.waitForTimeout(300);
  }
}

// The app restores the last-open modal on load; dismiss it so the run
// starts from the grid like a fresh user session.
for (let attempt = 0; attempt < 3; attempt += 1) {
  const modalOpen = await page
    .locator("[data-cy=modal]")
    .count()
    .then((count) => count > 0)
    .catch(() => false);
  if (!modalOpen) break;
  console.log("[nav-probe] dismissing restored modal");
  await page.mouse.click(0, 0);
  await page
    .waitForSelector("[data-cy=modal]", { state: "detached", timeout: 10_000 })
    .catch(() => undefined);
}
await page.waitForSelector("[data-cy=fo-grid]", { timeout: 120_000 });

// Custom-renderer grid tiles reveal their open-modal button on hover. Tiles
// hydrate asynchronously, so keep sweeping plausible tile centers until a
// hover actually reveals the button.
const openTileFromGrid = async (tileIndex) => {
  const grid = page.locator("[data-cy=fo-grid]");
  const box = await grid.boundingBox();
  if (!box) throw new Error("grid has no bounding box");
  const columns = 4;
  const tileWidth = box.width / columns;
  const baseX = box.x + tileWidth * (tileIndex % columns) + 150;
  const baseY = box.y + 90 + Math.floor(tileIndex / columns) * 200;
  const openButton = page.locator('button[title="Open sample modal"]');
  const deadline = Date.now() + 30_000;
  let revealed = false;
  while (Date.now() < deadline && !revealed) {
    // Consent/promo banners can arrive late and swallow pointer events.
    for (const label of ["Allow", "Dismiss"]) {
      const overlayButton = page.getByRole("button", { name: label }).first();
      if (await overlayButton.isVisible().catch(() => false)) {
        await overlayButton.click().catch(() => undefined);
      }
    }
    for (const [dx, dy] of [
      [0, 0],
      [40, 30],
      [-60, 20],
      [80, -20],
    ]) {
      await page.mouse.move(baseX + dx, baseY + dy);
      await page.waitForTimeout(350);
      if ((await openButton.count()) > 0) {
        revealed = true;
        break;
      }
    }
  }
  if (!revealed) {
    throw new Error("grid tile never revealed its open-modal button");
  }
  await openButton.first().click();
  await page.waitForSelector("[data-cy=modal]", { timeout: 10_000 });
};

const requireModal = async () => {
  if ((await page.locator("[data-cy=modal]").count()) === 0) {
    throw new Error("modal is not open");
  }
};

// Open the first sample from the grid.
rows.push(
  await transition("grid->modal (open #0)", () => openTileFromGrid(0)),
);

// In-modal hops.
for (let hop = 1; hop <= hops; hop += 1) {
  rows.push(
    await transition(`modal next (hop ${hop})`, async () => {
      await requireModal();
      await page.keyboard.press("ArrowRight");
    }),
  );
}

// Dismiss to the grid (click at the top-left corner) and reopen another
// sample — the grid round-trip flavor of navigation.
console.log("[nav-probe] dismissing modal via body (0,0)");
await page.mouse.click(0, 0);
await page
  .waitForSelector("[data-cy=modal]", { state: "detached", timeout: 15_000 })
  .catch(() => console.log("[nav-probe] modal did not detach after dismiss"));
rows.push(
  await transition("grid->modal (reopen #2)", () => openTileFromGrid(2)),
);

printReport(rows);
if (traceLabel) {
  // Late console-detail jsonValue resolutions settle before serialization.
  await page.waitForTimeout(500);
  const tracePath = path.join(__dirname, "runs", `nav-trace-${traceLabel}.json`);
  fs.mkdirSync(path.dirname(tracePath), { recursive: true });
  fs.writeFileSync(tracePath, JSON.stringify({ dataset, traces }, null, 1));
  console.log(`[nav-probe] trace written to ${tracePath}`);
}
await browser.close();

/**
 * Runs one navigation action and waits for the destination sample's mcap
 * session to reach timeline-ready (and first paint when it arrives), then
 * samples churn counters.
 */
async function transition(label, act) {
  console.log(`[nav-probe] ${label} — url: ${page.url().slice(-40)}`);
  try {
    return await runTransition(label, act);
  } catch (error) {
    console.log(`[nav-probe] ${label} FAILED: ${String(error).slice(0, 160)}`);
    await page
      .screenshot({
        path: path.join(__dirname, "runs", `nav-probe-fail-${Date.now()}.png`),
      })
      .catch(() => undefined);
    return {
      canvasesAfter: null,
      canvasesBefore: null,
      heapMb: null,
      label: `${label} (failed)`,
      longTaskCount: 0,
      longTaskMaxMs: 0,
      longTaskTotalMs: 0,
      paintMs: null,
      readyMs: null,
      workersAlive: liveWorkers.size,
      workersSpawned: 0,
    };
  }
}

async function runTransition(label, act) {
  const wallClickAtMs = Date.now();
  const consoleStartIndex = consoleRows.length;
  const before = await page.evaluate(() => {
    window.__longTasks = { count: 0, maxMs: 0, totalMs: 0 };
    const events = document.documentElement.getAttribute(
      "data-mcap-latency-events",
    );
    let sessionMark = null;
    try {
      const parsed = events ? JSON.parse(events) : [];
      const start = parsed.find((event) => event.name === "session start");
      sessionMark = start ? start.timeMs : null;
    } catch {
      sessionMark = null;
    }
    return {
      canvases: document.querySelectorAll("canvas").length,
      clickAtMs: performance.now(),
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
      sessionMark,
    };
  });
  const spawnedBefore = workersSpawned;

  await act();

  // The destination sample's renderer opens a fresh latency session; its
  // `session start` stamp lands after our click on the same page clock, so
  // clock ordering unambiguously identifies the new session.
  await page.waitForFunction(
    (clickAtMs) => {
      const raw = document.documentElement.getAttribute(
        "data-mcap-latency-events",
      );
      if (!raw) return false;
      try {
        const events = JSON.parse(raw);
        const start = events.find((event) => event.name === "session start");
        if (!start || start.timeMs < clickAtMs) return false;
        return events.some((event) => event.name === "timeline index ready");
      } catch {
        return false;
      }
    },
    before.clickAtMs,
    { polling: 50, timeout: 30_000 },
  );

  // First paint is not guaranteed instantly; give it a bounded window.
  const paintDeadline = Date.now() + 20_000;
  let readyAt = null;
  let paintAt = null;
  while (Date.now() < paintDeadline) {
    const marks = await page.evaluate(() => {
      const raw = document.documentElement.getAttribute(
        "data-mcap-latency-events",
      );
      if (!raw) return null;
      try {
        const events = JSON.parse(raw);
        const named = (name) =>
          events.find((event) => event.name === name)?.timeMs ?? null;
        return {
          paint:
            named("point cloud panel painted") ??
            named("transformed point cloud panel painted") ??
            named("provisional point cloud panel painted"),
          ready: named("timeline index ready"),
        };
      } catch {
        return null;
      }
    });
    readyAt = marks?.ready ?? readyAt;
    if (marks?.paint) {
      paintAt = marks.paint;
      break;
    }
    await page.waitForTimeout(200);
  }

  const after = await page.evaluate(() => ({
    canvases: document.querySelectorAll("canvas").length,
    heapBytes: performance.memory?.usedJSHeapSize ?? null,
    longTasks: window.__longTasks,
  }));

  if (traceLabel) {
    const timeline = await page.evaluate(() => {
      const attribute = (name) => {
        const raw = document.documentElement.getAttribute(name);
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      };
      return {
        events: attribute("data-mcap-latency-events"),
        pageNowMs: performance.now(),
        workerAttributionRecent:
          attribute("data-mcap-worker-attribution")?.recent ?? null,
      };
    });
    traces.push({
      clickAtMs: before.clickAtMs,
      // Console rows carry Node wall-clock; latency events carry page clock.
      // wallClickAtMs ~ clickAtMs on those respective clocks aligns them.
      consoleRows: consoleRows.slice(consoleStartIndex),
      label,
      timeline,
      wallClickAtMs,
    });
  }

  return {
    canvasesAfter: after.canvases,
    canvasesBefore: before.canvases,
    heapMb: after.heapBytes === null ? null : after.heapBytes / 1048576,
    label,
    longTaskCount: after.longTasks?.count ?? 0,
    longTaskMaxMs: Math.round(after.longTasks?.maxMs ?? 0),
    longTaskTotalMs: Math.round(after.longTasks?.totalMs ?? 0),
    paintMs: paintAt === null ? null : Math.round(paintAt - before.clickAtMs),
    readyMs: readyAt === null ? null : Math.round(readyAt - before.clickAtMs),
    workersAlive: liveWorkers.size,
    workersSpawned: workersSpawned - spawnedBefore,
  };
}

function printReport(report) {
  console.log("\n=== mcap navigation churn ===");
  for (const row of report) {
    console.log(
      [
        row.label.padEnd(26),
        `ready ${String(row.readyMs ?? "-").padStart(6)} ms`,
        `paint ${String(row.paintMs ?? "-").padStart(6)} ms`,
        `workers +${row.workersSpawned} (alive ${row.workersAlive})`,
        `canvases ${row.canvasesBefore}->${row.canvasesAfter}`,
        `longtasks ${row.longTaskCount} (${row.longTaskTotalMs} ms, max ${row.longTaskMaxMs} ms)`,
        row.heapMb === null ? "heap -" : `heap ${row.heapMb.toFixed(0)} MB`,
      ].join(" | "),
    );
  }
  console.log("=============================\n");
}

function resolvePlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_BASE,
    path.resolve(__dirname, "../../../../e2e-pw"),
  ].filter(Boolean);
  for (const base of candidates) {
    try {
      const require = createRequire(path.join(base, "noop.js"));
      return require("playwright");
    } catch {
      // Try the next candidate.
    }
  }
  console.error(
    "playwright not found. Install it in e2e-pw or set PLAYWRIGHT_BASE.",
  );
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = "1";
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}
