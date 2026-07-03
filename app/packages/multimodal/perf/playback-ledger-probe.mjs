#!/usr/bin/env node
/**
 * Playback frame-ledger probe for the MCAP modal.
 *
 * Opens a sample, plays for a sustained window, and reads the latency
 * session's worker attribution — which now splits each request's runMs
 * into pipeline stages (byte-wait / decompress / hash / decode) — plus the
 * playback stall windows and commit gaps. The output is the verdict that
 * ranks decode-path work: is the lane waiting on the link, burning CPU in
 * schema decode, hashing cache keys, or idle (scheduling gap)?
 *
 * Usage:
 *   node playback-ledger-probe.mjs --app http://localhost:5173 \
 *     --dataset nuscenes-mcap-local [--play 30] [--label local] \
 *     [--tile 0] [--headless]
 *
 * Snapshots of the cumulative attribution are taken every 5s of playback,
 * so phases (startup vs steady-state vs loop) can be diffed offline from
 * the runs/ dump. Headless runs render in software — worker timings are
 * representative but paint-side numbers are not; prefer headed.
 *
 * Playwright resolves like capture-run.mjs (PLAYWRIGHT_BASE or e2e-pw).
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const appOrigin = (args["app"] ?? "http://localhost:5173").replace(/\/$/, "");
const dataset = args["dataset"] ?? "nuscenes-mcap-local";
const playSeconds = Number(args["play"] ?? 30);
const label = args["label"] ?? "run";
const tileIndex = Number(args["tile"] ?? 0);
const headless = Boolean(args["headless"]);

const SNAPSHOT_INTERVAL_MS = 5_000;

const { chromium } = resolvePlaywright();

const browser = await chromium.launch({ headless });
const context = await browser.newContext({
  viewport: { height: 1080, width: 1860 },
});
const page = await context.newPage();

await page.goto(
  `${appOrigin}/datasets/${encodeURIComponent(dataset)}?mcapLatencyDebug=1&ledgerProbe=${Date.now()}`,
  { waitUntil: "domcontentloaded" },
);

// Consent and promo overlays eat pointer events; clear them first.
await page.waitForTimeout(1_500);
await clearOverlays();

// The app restores the last-open modal on load; dismiss it so the run
// starts from the grid like a fresh user session.
for (let attempt = 0; attempt < 3; attempt += 1) {
  const modalOpen = await page
    .locator("[data-cy=modal]")
    .count()
    .then((count) => count > 0)
    .catch(() => false);
  if (!modalOpen) break;
  console.log("[ledger-probe] dismissing restored modal");
  await page.mouse.click(0, 0);
  await page
    .waitForSelector("[data-cy=modal]", { state: "detached", timeout: 10_000 })
    .catch(() => undefined);
}
await page.waitForSelector("[data-cy=fo-grid]", { timeout: 120_000 });

await openTileFromGrid(tileIndex);
console.log("[ledger-probe] modal open, waiting for playback readiness");

const playButton = page.getByRole("button", { exact: true, name: "Play" });
await playButton.waitFor({ state: "visible", timeout: 60_000 });
// Let the startup buffer warm so the measurement window is playback, not
// first-paint fetch (that path is measured elsewhere).
await page.waitForTimeout(2_000);

console.log(`[ledger-probe] playing for ${playSeconds}s`);
await playButton.click();

const snapshots = [];
const playStartedAtMs = Date.now();
while (Date.now() - playStartedAtMs < playSeconds * 1_000) {
  await page.waitForTimeout(
    Math.min(
      SNAPSHOT_INTERVAL_MS,
      Math.max(250, playSeconds * 1_000 - (Date.now() - playStartedAtMs)),
    ),
  );
  snapshots.push({
    atSec: Number(((Date.now() - playStartedAtMs) / 1_000).toFixed(1)),
    ledger: await readLedger(),
  });
}

const pauseButton = page.getByRole("button", { exact: true, name: "Pause" });
if (await pauseButton.isVisible().catch(() => false)) {
  await pauseButton.click().catch(() => undefined);
}
// Let in-flight worker responses settle so the final attribution is whole.
await page.waitForTimeout(1_500);
const final = await readLedger();

printReport(final);

const dumpPath = path.join(__dirname, "runs", `ledger-${label}.json`);
fs.mkdirSync(path.dirname(dumpPath), { recursive: true });
fs.writeFileSync(
  dumpPath,
  JSON.stringify({ dataset, final, playSeconds, snapshots }, null, 1),
);
console.log(`[ledger-probe] dump written to ${dumpPath}`);

await browser.close();

async function clearOverlays() {
  for (const overlayLabel of ["Allow", "Dismiss"]) {
    const overlayButton = page
      .getByRole("button", { name: overlayLabel })
      .first();
    if (await overlayButton.isVisible().catch(() => false)) {
      await overlayButton.click().catch(() => undefined);
      await page.waitForTimeout(300);
    }
  }
}

// Custom-renderer grid tiles reveal their open-modal button on hover. Tiles
// hydrate asynchronously, so keep sweeping plausible tile centers until a
// hover actually reveals the button.
async function openTileFromGrid(index) {
  const grid = page.locator("[data-cy=fo-grid]");
  const box = await grid.boundingBox();
  if (!box) throw new Error("grid has no bounding box");
  const columns = 4;
  const tileWidth = box.width / columns;
  const baseX = box.x + tileWidth * (index % columns) + 150;
  const baseY = box.y + 90 + Math.floor(index / columns) * 200;
  const openButton = page.locator('button[title="Open sample modal"]');
  const deadline = Date.now() + 30_000;
  let revealed = false;
  while (Date.now() < deadline && !revealed) {
    await clearOverlays();
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
}

async function readLedger() {
  return page.evaluate(() => {
    const read = (name) => {
      const raw = document.documentElement.getAttribute(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };
    return {
      attribution: read("data-mcap-worker-attribution"),
      events: read("data-mcap-latency-events") ?? [],
      metrics: read("data-mcap-latency-metrics"),
    };
  });
}

function printReport(ledger) {
  const attribution = ledger.attribution;
  if (!attribution) {
    console.log("[ledger-probe] no worker attribution published — is the app running with mcapLatencyDebug?");
    return;
  }

  console.log("\n=== worker lane stage split ===");
  console.log(
    padRow([
      "lane",
      "reqs",
      "runMs",
      "queueMs",
      "byteWaitMs",
      "dcmpMs",
      "hashMs",
      "decodeMs",
      "otherMs",
    ]),
  );
  for (const [lane, bucket] of Object.entries(attribution.byLane ?? {})) {
    console.log(padRow(stageRow(lane, bucket)));
  }
  console.log("--- by lane:operation (top by runMs) ---");
  const laneOps = Object.entries(attribution.byLaneOperation ?? {})
    .sort(([, left], [, right]) => right.runMs - left.runMs)
    .slice(0, 6);
  for (const [key, bucket] of laneOps) {
    console.log(padRow(stageRow(key, bucket)));
  }

  console.log("\n=== decode by schema ===");
  console.log(
    padRow(["schema", "msgs", "ms", "avgMs/msg", "MB", "requests"]),
  );
  for (const [schema, bucket] of Object.entries(
    attribution.byDecodeSchema ?? {},
  )) {
    console.log(
      padRow([
        schema.slice(0, 34),
        bucket.messages,
        bucket.ms,
        bucket.avgMsPerMessage,
        bucket.bytesMB,
        bucket.requests,
      ]),
    );
  }

  console.log("\n=== playback stalls ===");
  const stallWindows = ledger.events.filter((event) =>
    event.name.endsWith("stall window finished"),
  );
  if (stallWindows.length === 0) {
    console.log("no finished stall windows");
  }
  for (const event of stallWindows) {
    const detail = event.detail ?? {};
    console.log(
      `${event.name}: stall ${detail.stallWallMs}ms (${detail.stallPercent}%) across ${detail.stallCount} stalls, max ${detail.maxStallMs}ms, loading ${detail.loadingWallMs}ms, missing ${detail.missingWallMs}ms`,
    );
  }
  const commitGaps = ledger.events.filter(
    (event) => event.name === "playback commit gap",
  );
  const maxGapMs = commitGaps.reduce(
    (max, event) => Math.max(max, event.detail?.wallDeltaMs ?? 0),
    0,
  );
  console.log(
    `commit gaps (>=250ms): ${commitGaps.length}${commitGaps.length ? `, max ${maxGapMs}ms` : ""}`,
  );

  const foreground = attribution.byLane?.foreground;
  if (foreground?.runMs) {
    const staged =
      (foreground.byteWaitMs ?? 0) +
      (foreground.decompressMs ?? 0) +
      (foreground.hashMs ?? 0) +
      (foreground.decodeMs ?? 0);
    console.log(
      `\nverdict (foreground lane): runMs=${foreground.runMs} → byteWait ${share(foreground.byteWaitMs, foreground.runMs)}, decompress ${share(foreground.decompressMs, foreground.runMs)}, hash ${share(foreground.hashMs, foreground.runMs)}, decode ${share(foreground.decodeMs, foreground.runMs)}, other ${share(foreground.runMs - staged, foreground.runMs)}`,
    );
  }
}

function stageRow(key, bucket) {
  const staged =
    (bucket.byteWaitMs ?? 0) +
    (bucket.decompressMs ?? 0) +
    (bucket.hashMs ?? 0) +
    (bucket.decodeMs ?? 0);
  return [
    key.slice(0, 36),
    bucket.requests,
    Math.round(bucket.runMs),
    Math.round(bucket.queueWaitMs),
    Math.round(bucket.byteWaitMs ?? 0),
    Math.round(bucket.decompressMs ?? 0),
    Math.round(bucket.hashMs ?? 0),
    Math.round(bucket.decodeMs ?? 0),
    Math.round(Math.max(0, bucket.runMs - staged)),
  ];
}

function share(part, total) {
  if (!total) return "0%";
  return `${Math.max(0, Math.round(((part ?? 0) / total) * 100))}%`;
}

function padRow(cells) {
  const widths = [38, 6, 8, 8, 11, 7, 7, 9, 8];
  return cells
    .map((cell, index) => String(cell ?? "").padEnd(widths[index] ?? 8))
    .join(" ");
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
