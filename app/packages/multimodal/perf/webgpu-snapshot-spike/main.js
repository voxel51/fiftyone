// Spike: prove (or refute) the snapshot-renderer design for MCAP grid tiles.
//
// Questions, in order of load-bearing-ness for grid-mcap-optimization.md:
//   T1  Same-task readback: after `await renderer.renderAsync(...)` on an
//       OffscreenCanvas, does `transferToImageBitmap()` capture the frame?
//   T2  Deferred readback: does the frame survive a macrotask (setTimeout 0),
//       a rAF, or 100 ms? (If yes, the serial queue has slack; if no, the
//       transfer must stay in the same task as the render.)
//   T3  Serial reuse: one renderer, five scenes back-to-back, distinct
//       background colors — do all five bitmaps come back correct, and how
//       fast is each render+transfer?
//   T4  Resize between jobs: can one renderer serve different cell sizes
//       serially (256² then 128²)?
//   T5  HTMLCanvasElement fallback: does `createImageBitmap(canvas)` work
//       same-task on a DOM canvas, and does the frame survive compositing
//       (post-rAF)?
//   Also recorded: GPUDevice request count for the whole spike (expect 1 for
//   T1–T4 sharing one renderer + 1 for T5), adapter info, per-step timings.
import * as THREE from "three/webgpu";

const SIZE = 256;
const COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];
const COLOR_NAMES = ["red", "green", "blue", "yellow", "magenta"];

const results = {
  userAgent: navigator.userAgent,
  webgpuAvailable: !!navigator.gpu,
  adapterInfo: null,
  deviceRequests: 0,
  tests: [],
  totalMs: 0,
};

// Count device acquisitions the same way the freeze probe does.
if (navigator.gpu && globalThis.GPUAdapter) {
  const orig = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = function (...args) {
    results.deviceRequests += 1;
    return orig.apply(this, args);
  };
}

function report(name, ok, detail) {
  results.tests.push({ name, ok, detail });
}

function pixelAt(bitmap, x, y) {
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

// Saturated primaries survive sRGB conversion with the dominant channel at
// ~255 and the off channels at ~0, so dominance classification is stable.
function matchesColor(px, hex) {
  const want = [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
  for (let i = 0; i < 3; i += 1) {
    const high = want[i] > 127;
    if (high && px[i] < 200) return false;
    if (!high && px[i] > 55) return false;
  }
  return true;
}

function makeScene(colorHex) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(colorHex);
  // Representative content: a small white point cloud, kept away from the
  // sampled corner pixel so the background assertion stays deterministic.
  const count = 5000;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 1.2;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 1.2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2,
    sizeAttenuation: false,
  });
  scene.add(new THREE.Points(geometry, material));
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);
  return { scene, camera, geometry, material };
}

async function createRenderer(canvas, width, height) {
  const renderer = new THREE.WebGPURenderer({
    alpha: false,
    antialias: true,
    canvas,
    depth: true,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setSize(width, height, false);
  await renderer.init();
  return renderer;
}

async function renderOnce(renderer, colorHex) {
  const { scene, camera, geometry, material } = makeScene(colorHex);
  await renderer.renderAsync(scene, camera);
  geometry.dispose();
  material.dispose();
}

function corner(bitmap) {
  return pixelAt(bitmap, 4, 4);
}

async function main() {
  const t0 = performance.now();
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    results.adapterInfo = adapter?.info
      ? {
          vendor: adapter.info.vendor,
          architecture: adapter.info.architecture,
          description: adapter.info.description,
        }
      : null;
  } catch {
    results.adapterInfo = null;
  }

  // --- T1..T4 share ONE renderer on one OffscreenCanvas ---
  const offscreen = new OffscreenCanvas(SIZE, SIZE);
  let renderer = null;
  try {
    renderer = await createRenderer(offscreen, SIZE, SIZE);
    report("T0 offscreen renderer init", true, {
      backend: renderer.backend?.isWebGPUBackend ? "webgpu" : "unknown",
    });
  } catch (error) {
    report("T0 offscreen renderer init", false, { error: String(error) });
  }

  if (renderer) {
    // T1 — same-task transfer.
    try {
      await renderOnce(renderer, COLORS[0]);
      const start = performance.now();
      const bitmap = offscreen.transferToImageBitmap();
      const px = corner(bitmap);
      const ok =
        bitmap.width === SIZE &&
        bitmap.height === SIZE &&
        matchesColor(px, COLORS[0]);
      report("T1 same-task transferToImageBitmap", ok, {
        transferMs: +(performance.now() - start).toFixed(2),
        bitmap: `${bitmap.width}x${bitmap.height}`,
        cornerPixel: px,
        expected: COLOR_NAMES[0],
      });
      bitmap.close();
    } catch (error) {
      report("T1 same-task transferToImageBitmap", false, {
        error: String(error),
      });
    }

    // T2 — deferred transfers. Each does a fresh render, then waits.
    const deferreds = [
      ["T2a macrotask (setTimeout 0)", (r) => setTimeout(r, 0)],
      ["T2b requestAnimationFrame", (r) => requestAnimationFrame(() => r())],
      ["T2c 100ms delay", (r) => setTimeout(r, 100)],
    ];
    for (let i = 0; i < deferreds.length; i += 1) {
      const [name, wait] = deferreds[i];
      const color = COLORS[(i + 1) % COLORS.length];
      try {
        await renderOnce(renderer, color);
        await new Promise((resolve) => wait(resolve));
        const bitmap = offscreen.transferToImageBitmap();
        const px = corner(bitmap);
        report(name, matchesColor(px, color), {
          bitmap: `${bitmap.width}x${bitmap.height}`,
          cornerPixel: px,
          expected: COLOR_NAMES[(i + 1) % COLORS.length],
          note: "ok=frame survived the wait; ok:false=frame lost after task boundary",
        });
        bitmap.close();
      } catch (error) {
        report(name, false, { error: String(error) });
      }
    }

    // T3 — serial reuse, five distinct scenes, same-task transfers.
    try {
      const rounds = [];
      let allOk = true;
      for (let i = 0; i < COLORS.length; i += 1) {
        const start = performance.now();
        await renderOnce(renderer, COLORS[i]);
        const bitmap = offscreen.transferToImageBitmap();
        const px = corner(bitmap);
        const ok = matchesColor(px, COLORS[i]);
        allOk = allOk && ok;
        rounds.push({
          color: COLOR_NAMES[i],
          ok,
          ms: +(performance.now() - start).toFixed(2),
        });
        bitmap.close();
      }
      report("T3 serial reuse x5 (one renderer)", allOk, { rounds });
    } catch (error) {
      report("T3 serial reuse x5 (one renderer)", false, {
        error: String(error),
      });
    }

    // T4 — resize between jobs on the same renderer.
    try {
      renderer.setSize(128, 128, false);
      await renderOnce(renderer, COLORS[1]);
      const small = offscreen.transferToImageBitmap();
      const smallPx = corner(small);
      const smallOk =
        small.width === 128 &&
        small.height === 128 &&
        matchesColor(smallPx, COLORS[1]);
      small.close();
      renderer.setSize(SIZE, SIZE, false);
      await renderOnce(renderer, COLORS[2]);
      const big = offscreen.transferToImageBitmap();
      const bigPx = corner(big);
      const bigOk =
        big.width === SIZE &&
        big.height === SIZE &&
        matchesColor(bigPx, COLORS[2]);
      big.close();
      report("T4 resize between jobs (256→128→256)", smallOk && bigOk, {
        smallPixel: smallPx,
        bigPixel: bigPx,
      });
    } catch (error) {
      report("T4 resize between jobs (256→128→256)", false, {
        error: String(error),
      });
    }

    renderer.dispose();
  }

  // --- T5: HTMLCanvasElement fallback path ---
  try {
    const domCanvas = document.createElement("canvas");
    domCanvas.width = SIZE;
    domCanvas.height = SIZE;
    domCanvas.style.cssText =
      "position:fixed;left:0;top:0;width:64px;height:64px;";
    document.body.appendChild(domCanvas);
    const domRenderer = await createRenderer(domCanvas, SIZE, SIZE);
    await renderOnce(domRenderer, COLORS[3]);
    const sameTask = await createImageBitmap(domCanvas);
    const sameTaskPx = corner(sameTask);
    const sameTaskOk = matchesColor(sameTaskPx, COLORS[3]);
    sameTask.close();
    // Post-composite: wait two rAFs so the compositor consumed the frame.
    await renderOnce(domRenderer, COLORS[4]);
    await new Promise((r) => requestAnimationFrame(() => r()));
    await new Promise((r) => requestAnimationFrame(() => r()));
    const postRaf = await createImageBitmap(domCanvas);
    const postRafPx = corner(postRaf);
    const postRafOk = matchesColor(postRafPx, COLORS[4]);
    postRaf.close();
    report("T5 DOM canvas createImageBitmap", sameTaskOk, {
      sameTaskPixel: sameTaskPx,
      sameTaskExpected: COLOR_NAMES[3],
      postCompositePixel: postRafPx,
      postCompositeExpected: COLOR_NAMES[4],
      postCompositeOk: postRafOk,
    });
    domRenderer.dispose();
    domCanvas.remove();
  } catch (error) {
    report("T5 DOM canvas createImageBitmap", false, { error: String(error) });
  }

  results.totalMs = +(performance.now() - t0).toFixed(1);
  window.__SPIKE_RESULTS__ = results;
  document.getElementById("out").textContent = JSON.stringify(results, null, 2);
  document.title = "spike-done";
}

main().catch((error) => {
  results.tests.push({ name: "fatal", ok: false, detail: String(error) });
  window.__SPIKE_RESULTS__ = results;
  document.getElementById("out").textContent = JSON.stringify(results, null, 2);
  document.title = "spike-done";
});
