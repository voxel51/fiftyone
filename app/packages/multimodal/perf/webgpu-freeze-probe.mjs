#!/usr/bin/env node
/**
 * WebGPU degenerate-state probe for the MCAP 3D tile.
 *
 * Reproduces the frozen-canvas failure: during playback it orbits the
 * camera, toggles sidebar sources (cameras / 3D labels), and resizes the
 * window — the reported triggers — while watching the WebGPU API surface
 * for the failure signatures:
 *
 *   - "Vertex buffer slot N ... was not set" validation spam (poisoned
 *     command buffers; nothing flushes, canvas freezes)
 *   - zero-size depth/swapchain texture creation after a resize
 *   - vertex-buffer create/destroy imbalance (GPU buffer leak from the
 *     three r182 Geometries.onDispose live-attribute deletion)
 *
 * Instrumentation is runtime-only (init-script hooks on GPUDevice /
 * GPUBuffer / GPURenderPassEncoder); no sources are patched.
 *
 * Usage:
 *   node webgpu-freeze-probe.mjs --app http://localhost:5175 \
 *     --dataset nuscenes-mcap-local [--rounds 8] [--no-toggles] \
 *     [--no-resize] [--no-orbit]
 *
 * Headed only: WebGPU needs the real GPU.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const appOrigin = (args["app"] ?? "http://localhost:5175").replace(/\/$/, "");
const dataset = args["dataset"] ?? "nuscenes-mcap-local";
const rounds = Number(args["rounds"] ?? 8);
const doToggles = !args["no-toggles"];
const doResize = !args["no-resize"];
const doOrbit = !args["no-orbit"];

const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { height: 1080, width: 1860 },
});
const page = await context.newPage();

// Runtime WebGPU accounting. Buffer creations/destroys are tallied by
// usage class so the vertex-buffer churn of the point clouds stands out
// from uniform/storage traffic.
await page.addInitScript(() => {
  const probe = {
    createdBuffers: 0,
    createdBytes: 0,
    destroyedBuffers: 0,
    destroyedBytes: 0,
    vertexCreated: 0,
    vertexCreatedBytes: 0,
    vertexDestroyed: 0,
    vertexDestroyedBytes: 0,
    nullVertexBinds: 0,
    zeroSizeTextures: 0,
    devices: 0,
    deviceLost: [],
    uncaptured: [],
  };
  window.__gpuProbe = probe;
  if (!("gpu" in navigator)) return;

  const VERTEX = 0x0020; // GPUBufferUsage.VERTEX

  const origCreateBuffer = GPUDevice.prototype.createBuffer;
  GPUDevice.prototype.createBuffer = function (descriptor) {
    const buffer = origCreateBuffer.call(this, descriptor);
    const size = Number(descriptor?.size ?? 0);
    const isVertex = ((descriptor?.usage ?? 0) & VERTEX) !== 0;
    probe.createdBuffers += 1;
    probe.createdBytes += size;
    if (isVertex) {
      probe.vertexCreated += 1;
      probe.vertexCreatedBytes += size;
    }
    const origDestroy = buffer.destroy.bind(buffer);
    let destroyed = false;
    buffer.destroy = () => {
      if (!destroyed) {
        destroyed = true;
        probe.destroyedBuffers += 1;
        probe.destroyedBytes += size;
        if (isVertex) {
          probe.vertexDestroyed += 1;
          probe.vertexDestroyedBytes += size;
        }
      }
      return origDestroy();
    };
    return buffer;
  };

  const origCreateTexture = GPUDevice.prototype.createTexture;
  GPUDevice.prototype.createTexture = function (descriptor) {
    const size = descriptor?.size;
    const width = Array.isArray(size) ? size[0] : size?.width;
    const height = Array.isArray(size) ? size[1] : size?.height;
    if (width === 0 || height === 0) {
      probe.zeroSizeTextures += 1;
      console.warn(
        `[gpu-probe] zero-size texture requested: ${width}x${height} label=${descriptor?.label ?? ""}`,
      );
    }
    return origCreateTexture.call(this, descriptor);
  };

  const origSetVertexBuffer = GPURenderPassEncoder.prototype.setVertexBuffer;
  GPURenderPassEncoder.prototype.setVertexBuffer = function (
    slot,
    buffer,
    ...rest
  ) {
    if (buffer === null || buffer === undefined) {
      probe.nullVertexBinds += 1;
      if (probe.nullVertexBinds <= 5 || probe.nullVertexBinds % 500 === 0) {
        console.warn(
          `[gpu-probe] setVertexBuffer(slot ${slot}, ${String(buffer)}) — slot left unset (count ${probe.nullVertexBinds})`,
        );
      }
    }
    return origSetVertexBuffer.call(this, slot, buffer, ...rest);
  };

  const origRequestDevice = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (...deviceArgs) {
    const device = await origRequestDevice.apply(this, deviceArgs);
    probe.devices += 1;
    device.addEventListener("uncapturederror", (event) => {
      const message = event.error?.message ?? String(event.error);
      probe.uncaptured.push(message.slice(0, 160));
      if (probe.uncaptured.length > 40) probe.uncaptured.shift();
    });
    device.lost.then((info) => {
      probe.deviceLost.push(`${info.reason}: ${info.message}`.slice(0, 160));
    });
    return device;
  };
});

// Console signature watch — survives Dawn's per-device warning cutoff
// because the uncapturederror hook above records independently.
const signatureRows = [];
page.on("console", (message) => {
  const text = message.text();
  if (
    /Vertex buffer slot|was not set|swapchain texture|TextureDescriptor|Invalid CommandBuffer|Destroyed buffer|gpu-probe/.test(
      text,
    )
  ) {
    signatureRows.push({ atMs: Date.now(), text: text.slice(0, 220) });
  }
});
page.on("pageerror", (error) => {
  signatureRows.push({
    atMs: Date.now(),
    text: `PAGEERROR ${String(error).slice(0, 220)}`,
  });
});

await page.goto(
  `${appOrigin}/datasets/${encodeURIComponent(dataset)}?gpuProbe=${Date.now()}`,
  { waitUntil: "domcontentloaded" },
);

await page.waitForTimeout(1_500);
for (const label of ["Allow", "Dismiss"]) {
  const overlayButton = page.getByRole("button", { name: label }).first();
  if (await overlayButton.isVisible().catch(() => false)) {
    await overlayButton.click().catch(() => undefined);
    await page.waitForTimeout(300);
  }
}

// Start from the grid: dismiss any restored modal.
for (let attempt = 0; attempt < 3; attempt += 1) {
  const modalOpen = await page
    .locator("[data-cy=modal]")
    .count()
    .then((count) => count > 0)
    .catch(() => false);
  if (!modalOpen) break;
  await page.mouse.click(0, 0);
  await page
    .waitForSelector("[data-cy=modal]", { state: "detached", timeout: 10_000 })
    .catch(() => undefined);
}
await page.waitForSelector("[data-cy=fo-grid]", { timeout: 120_000 });

// Hover-open the first grid tile (same sweep as nav-churn-probe).
{
  const grid = page.locator("[data-cy=fo-grid]");
  const box = await grid.boundingBox();
  if (!box) throw new Error("grid has no bounding box");
  const openButton = page.locator('button[title="Open sample modal"]');
  const deadline = Date.now() + 45_000;
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
      [150, 90],
      [190, 120],
      [90, 110],
      [230, 70],
    ]) {
      await page.mouse.move(box.x + dx, box.y + dy);
      await page.waitForTimeout(350);
      if ((await openButton.count()) > 0) {
        revealed = true;
        break;
      }
    }
  }
  if (!revealed) throw new Error("grid tile never revealed its open button");
  await openButton.first().click();
  await page.waitForSelector("[data-cy=modal]", { timeout: 10_000 });
}

// Wait for the 3D tile's canvas to come up, then activate the 3D tile so
// its source checkboxes replace the global Scene tab in the left sidebar.
await page.waitForSelector("[data-cy=modal] canvas", { timeout: 60_000 });
await page.waitForTimeout(4_000);

const threeDTab = page
  .locator("[data-cy=modal]")
  .getByText("3D", { exact: true })
  .first();
if (await threeDTab.isVisible().catch(() => false)) {
  await threeDTab.click();
  await page.waitForTimeout(800);
  console.log("[gpu-probe] activated 3D tile");
} else {
  console.log("[gpu-probe] 3D tile header not found");
}

const playPause = async () => {
  for (const name of ["Play", "Pause"]) {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => undefined);
      return true;
    }
  }
  return false;
};
if (await playPause()) {
  console.log("[gpu-probe] playback started");
} else {
  console.log("[gpu-probe] play button not found — continuing without it");
}

const sampleProbe = () => page.evaluate(() => window.__gpuProbe ?? null);
const baseline = await sampleProbe();
let previous = baseline;
console.log(
  `[gpu-probe] baseline: devices ${baseline?.devices}, vertex buffers ${baseline?.vertexCreated} created / ${baseline?.vertexDestroyed} destroyed`,
);

const canvasBox = async () => {
  const canvas = page.locator("[data-cy=modal] canvas").last();
  return canvas.boundingBox();
};

const orbit = async () => {
  const box = await canvasBox();
  if (!box) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(cx + step * 18, cy + Math.sin(step) * 24, {
      steps: 2,
    });
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
};

// Toggle sidebar sources (voodo checkboxes render role=checkbox, not a
// native input). Index 0 is usually the lidar source that keeps the panel
// alive; toggle the next few (cameras / labels — the reported trigger).
const toggleSidebarSources = async () => {
  const checkboxes = page.locator("[data-cy=modal] [role=checkbox]");
  const count = await checkboxes.count();
  if (count < 2) {
    console.log("[gpu-probe] no toggleable checkboxes found");
    return;
  }
  const indices = [];
  for (let i = 1; i < count && indices.length < 3; i += 1) indices.push(i);
  for (const index of indices) {
    await checkboxes
      .nth(index)
      .click({ force: true })
      .catch(() => undefined);
    await page.waitForTimeout(450);
  }
  // Toggle them back on so the scene keeps its content.
  for (const index of indices) {
    await checkboxes
      .nth(index)
      .click({ force: true })
      .catch(() => undefined);
    await page.waitForTimeout(450);
  }
};

const resizeWindow = async () => {
  await page.setViewportSize({ height: 520, width: 980 });
  await page.waitForTimeout(600);
  await page.setViewportSize({ height: 300, width: 700 });
  await page.waitForTimeout(600);
  await page.setViewportSize({ height: 1080, width: 1860 });
  await page.waitForTimeout(600);
};

let failureRound = null;
for (let round = 1; round <= rounds; round += 1) {
  await page.waitForTimeout(3_000);
  if (doOrbit) await orbit();
  // Pause/resume churn is part of the reported trigger mix.
  await playPause();
  await page.waitForTimeout(400);
  await playPause();
  if (doToggles) await toggleSidebarSources();
  if (doResize && round % 2 === 0) await resizeWindow();
  if (doOrbit) await orbit();

  const current = await sampleProbe();
  if (!current) break;
  const vertexLeak = current.vertexCreatedBytes - current.vertexDestroyedBytes;
  const roundCreated = current.vertexCreated - previous.vertexCreated;
  const roundDestroyed = current.vertexDestroyed - previous.vertexDestroyed;
  console.log(
    [
      `round ${String(round).padStart(2)}`,
      `vtx +${roundCreated}/-${roundDestroyed} this round`,
      `live vtx ${current.vertexCreated - current.vertexDestroyed} (${(vertexLeak / 1048576).toFixed(1)} MB)`,
      `null-binds ${current.nullVertexBinds}`,
      `zero-tex ${current.zeroSizeTextures}`,
      `gpu-errors ${current.uncaptured.length}`,
      `devices ${current.devices}${current.deviceLost.length ? ` LOST ${current.deviceLost.length}` : ""}`,
    ].join(" | "),
  );
  previous = current;

  if (current.nullVertexBinds > 0 || current.uncaptured.length > 5) {
    failureRound = round;
    console.log(`[gpu-probe] degenerate state detected in round ${round}`);
    break;
  }
}

const final = await sampleProbe();
console.log("\n=== gpu-probe summary ===");
console.log(
  `vertex buffers: ${final.vertexCreated} created (${(final.vertexCreatedBytes / 1048576).toFixed(1)} MB), ` +
    `${final.vertexDestroyed} destroyed (${(final.vertexDestroyedBytes / 1048576).toFixed(1)} MB), ` +
    `live ${final.vertexCreated - final.vertexDestroyed} (${((final.vertexCreatedBytes - final.vertexDestroyedBytes) / 1048576).toFixed(1)} MB)`,
);
console.log(
  `all buffers: ${final.createdBuffers} created / ${final.destroyedBuffers} destroyed, ` +
    `null vertex binds ${final.nullVertexBinds}, zero-size textures ${final.zeroSizeTextures}, devices ${final.devices}`,
);
if (final.deviceLost.length) {
  console.log(`device lost: ${final.deviceLost.join(" || ")}`);
}
if (final.uncaptured.length) {
  console.log("last uncaptured GPU errors:");
  for (const message of final.uncaptured.slice(-10)) {
    console.log(`  - ${message}`);
  }
}
if (signatureRows.length) {
  console.log(`\nsignature console rows (${signatureRows.length}):`);
  for (const row of signatureRows.slice(-25)) {
    console.log(`  ${new Date(row.atMs).toISOString()} ${row.text}`);
  }
}
console.log(
  failureRound
    ? `RESULT: reproduced in round ${failureRound}`
    : "RESULT: no degenerate state reproduced",
);

await browser.close();

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
