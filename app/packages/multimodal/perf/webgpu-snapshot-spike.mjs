#!/usr/bin/env node
/**
 * Driver for the WebGPU snapshot spike (see webgpu-snapshot-spike/main.js).
 * Serves the spike page with vite, opens it in headed Chromium (WebGPU
 * needs the real GPU), waits for completion, prints the JSON results.
 *
 * Usage: node webgpu-snapshot-spike.mjs [--port 5211]
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(
  process.argv.includes("--port")
    ? process.argv[process.argv.indexOf("--port") + 1]
    : 5211,
);
const spikeDir = path.join(__dirname, "webgpu-snapshot-spike");
const viteBin = path.resolve(__dirname, "../../../node_modules/.bin/vite");

const vite = spawn(
  viteBin,
  ["--port", String(port), "--strictPort", "--logLevel", "warn"],
  { cwd: spikeDir, stdio: ["ignore", "pipe", "pipe"] },
);
vite.stderr.on("data", (d) => process.stderr.write(`[vite] ${d}`));

const origin = `http://localhost:${port}`;
await waitForServer(origin, 15_000);

const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on("console", (msg) => {
  if (msg.type() === "error") console.error(`[page] ${msg.text()}`);
});
try {
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.title === "spike-done", null, {
    timeout: 60_000,
  });
  const results = await page.evaluate(() => window.__SPIKE_RESULTS__);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  vite.kill("SIGTERM");
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`vite did not come up at ${url} within ${timeoutMs}ms`);
}

function resolvePlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_BASE,
    path.resolve(__dirname, "../../../../e2e-pw"),
  ].filter(Boolean);
  for (const base of candidates) {
    try {
      const require = createRequire(path.join(base, "package.json"));
      return require("playwright");
    } catch {
      // try next
    }
  }
  throw new Error("playwright not resolvable; set PLAYWRIGHT_BASE");
}
