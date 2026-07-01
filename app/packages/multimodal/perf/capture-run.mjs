#!/usr/bin/env node
/**
 * MCAP playback performance capture driver.
 *
 * Drives a scripted playback scenario against a running app + shaping proxy
 * and writes the in-app debug instrumentation (latency events, metrics,
 * bandwidth, worker attribution) plus browser resource timings to a
 * timestamped JSON file.
 *
 * Prerequisites (see README.md):
 *   1. FiftyOne server running (e.g. :5152).
 *   2. shaping-proxy.mjs running in front of it (e.g. :5153).
 *   3. A Vite dev app whose VITE_API points at the proxy (e.g. :5175).
 *
 * Usage:
 *   node capture-run.mjs \
 *     --app http://localhost:5175 \
 *     --dataset nuscenes-mcap-local \
 *     --sample 6a1b1814ed669ab6352e8043 \
 *     --scenario immediate-space \
 *     --label remote-typical-baseline \
 *     [--proxy-status http://localhost:5153/__shape__/status] \
 *     [--headless] [--warmup] [--out ./runs]
 *
 * Scenarios:
 *   immediate-space  Space as soon as the timeline index is ready.
 *   ready-space      Space once the startup buffer is ready.
 *   idle10-space     Space after startup buffer ready + 10 s paused idle.
 *
 * Playwright is resolved from PLAYWRIGHT_BASE (a directory containing
 * node_modules/playwright) or from this repo's e2e-pw install.
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = parseArgs(process.argv.slice(2));
const appOrigin = trimSlash(args["app"] ?? "http://localhost:5175");
const dataset = args["dataset"] ?? "nuscenes-mcap-local";
const sampleId = args["sample"] ?? null;
const scenario = args["scenario"] ?? "immediate-space";
const label = args["label"] ?? scenario;
const outDir = path.resolve(args["out"] ?? path.join(__dirname, "runs"));
const proxyStatusUrl = args["proxy-status"] ?? null;
const headless = Boolean(args["headless"]);
const warmup = Boolean(args["warmup"]);
const stallWindowTimeoutMs = Number(args["timeout-ms"] ?? 240_000);

const SCENARIOS = new Set(["immediate-space", "ready-space", "idle10-space"]);
if (!SCENARIOS.has(scenario)) {
  console.error(
    `Unknown scenario '${scenario}'. Known: ${[...SCENARIOS].join(", ")}`,
  );
  process.exit(1);
}
if (!sampleId) {
  console.error("--sample <id> is required");
  process.exit(1);
}

const { chromium } = resolvePlaywright();

const runToken = `${label.replace(/[^a-zA-Z0-9_-]/g, "-")}-${Date.now()}`;
const runUrl =
  `${appOrigin}/datasets/${encodeURIComponent(dataset)}` +
  `?mcapLatencyDebug=1&id=${sampleId}&perfRun=${runToken}`;

const events = [];
const note = (message) => {
  const stamp = new Date().toISOString();
  events.push({ message, ts: stamp });
  console.log(`[capture] ${message}`);
};

await main();

async function main() {
  const proxyStatus = proxyStatusUrl ? await fetchJson(proxyStatusUrl) : null;
  if (proxyStatusUrl && !proxyStatus) {
    console.error(`shaping proxy not reachable at ${proxyStatusUrl}`);
    process.exit(1);
  }

  await assertReachable(appOrigin, "app dev server");

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { height: 1080, width: 1860 },
  });
  const page = await context.newPage();

  try {
    if (warmup) {
      // One throwaway navigation so Vite's on-demand transforms and the
      // browser process are warm; measured runs then reflect media transport,
      // not dev-server compile time. A fresh perfRun token keeps app-level
      // run bookkeeping distinct.
      note("warmup navigation (vite transform warm-up)");
      await page.goto(
        `${runUrl.replace(runToken, `${runToken}-warmup`)}`,
        { waitUntil: "domcontentloaded" },
      );
      await waitForLatencyEvent(page, "timeline index ready", 120_000);
      await page.goto("about:blank");
      await context.clearCookies();
    }

    note(`navigate ${runUrl}`);
    const navStartMs = Date.now();
    await page.goto(runUrl, { waitUntil: "domcontentloaded" });

    note("waiting for mcap session start");
    await waitForLatencyEvent(page, "session start", 120_000);

    if (scenario === "immediate-space") {
      await waitForLatencyEvent(page, "timeline index ready", 120_000);
      note("timeline ready -> pressing Space");
      await pressPlaybackSpace(page);
    } else {
      await waitForLatencyEvent(page, "startup buffer ready", 180_000);
      if (scenario === "idle10-space") {
        note("startup buffer ready -> idling 10 s");
        await page.waitForTimeout(10_000);
      }
      note("pressing Space");
      await pressPlaybackSpace(page);
    }

    note("waiting for first 10 s stall window to finish");
    await waitForLatencyEvent(
      page,
      "playback first 10s stall window finished",
      stallWindowTimeoutMs,
    );
    // One publish interval of settle time so throttled metric/bandwidth
    // publishes catch up with the final event.
    await page.waitForTimeout(600);

    const capture = await page.evaluate(() => {
      const root = document.documentElement;
      const parse = (name) => {
        const raw = root.getAttribute(name);
        return raw ? JSON.parse(raw) : null;
      };
      return {
        bandwidth: parse("data-mcap-latency-bandwidth"),
        events: parse("data-mcap-latency-events"),
        mediaResources: performance
          .getEntriesByType("resource")
          .filter((entry) => entry.name.includes("/media"))
          .map((entry) => ({
            durationMs: Number(entry.duration.toFixed(1)),
            name: entry.name.slice(0, 160),
            responseEndMs: Number(entry.responseEnd.toFixed(1)),
            responseStartMs: Number(entry.responseStart.toFixed(1)),
            startTimeMs: Number(entry.startTime.toFixed(1)),
            transferSize: entry.transferSize,
          })),
        metrics: parse("data-mcap-latency-metrics"),
        workerAttribution: parse("data-mcap-worker-attribution"),
      };
    });

    const result = {
      capturedAt: new Date().toISOString(),
      driverEvents: events,
      label,
      navStartMs,
      proxyStatus,
      runToken,
      runUrl,
      scenario,
      ...capture,
    };

    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${runToken}.json`);
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    note(`wrote ${outPath}`);
    printSummary(result);
  } finally {
    await browser.close();
  }
}

/**
 * Space is bound to the modal-context play/pause command. Clicking the
 * timeline controls row first guarantees the modal surface has focus without
 * disturbing camera state in a 3D pane.
 */
async function pressPlaybackSpace(page) {
  const controls = page.getByTestId("timeline-controls-root").first();
  try {
    await controls.click({ position: { x: 4, y: 4 }, timeout: 2_000 });
  } catch {
    // The controls row may not be present in every layout; the command
    // binding is document-scoped so Space usually works regardless.
  }
  await page.keyboard.press(" ");
}

async function waitForLatencyEvent(page, eventName, timeoutMs) {
  await page.waitForFunction(
    (name) => {
      const raw = document.documentElement.getAttribute(
        "data-mcap-latency-events",
      );
      if (!raw) return false;
      try {
        return JSON.parse(raw).some((event) => event.name === name);
      } catch {
        return false;
      }
    },
    eventName,
    { polling: 100, timeout: timeoutMs },
  );
}

function printSummary(result) {
  const byName = new Map(
    (result.events ?? []).map((event) => [event.name, event]),
  );
  const stallFinish = byName.get("playback first 10s stall window finished");
  const rows = [
    ["timeline index ready", byName.get("timeline index ready")?.elapsedMs],
    ["playhead buffer ready", byName.get("playhead buffer ready")?.elapsedMs],
    ["startup buffer ready", byName.get("startup buffer ready")?.elapsedMs],
    [
      "point cloud panel painted",
      byName.get("point cloud panel painted")?.elapsedMs ??
        byName.get("provisional point cloud panel painted")?.elapsedMs,
    ],
    ["playback first commit", byName.get("playback first commit")?.elapsedMs],
  ];
  console.log("\n=== capture summary ===");
  for (const [name, value] of rows) {
    console.log(
      `${name.padEnd(28)} ${value === undefined ? "-" : `${value.toFixed(1)} ms`}`,
    );
  }
  if (stallFinish?.detail) {
    const detail = stallFinish.detail;
    console.log(
      `first 10s stall wall ms      ${detail.stallWallMs} (max ${detail.maxStallMs}, count ${detail.stallCount}, ${detail.stallPercent}%)`,
    );
    console.log(
      `first 10s missing-data ms    ${detail.missingWallMs} | wall ${detail.wallMs} ms`,
    );
  }
  const total = result.bandwidth?.total;
  if (total) {
    console.log(
      `total effective MB           ${total.effectiveMB} over ${total.requests} requests`,
    );
  }
  console.log("=======================\n");
}

async function assertReachable(origin, description) {
  try {
    await fetch(origin, { method: "GET" });
  } catch {
    console.error(
      `${description} not reachable at ${origin}. See perf/README.md for setup.`,
    );
    process.exit(1);
  }
}

async function fetchJson(url) {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch {
    return null;
  }
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
    "playwright not found. Install it in e2e-pw (cd e2e-pw && yarn install) " +
      "or set PLAYWRIGHT_BASE to a directory containing node_modules/playwright.",
  );
  process.exit(1);
}

function trimSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
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
