/**
 * Video label propagation (browser, WASM SAM2).
 *
 * Walks the frames between two keyframes and, for each, runs SAM2 against
 * the decoded frame bitmap to localise the tracked object. The next frame's
 * prompt is derived from the previous frame's mask (centroid sampling), so
 * the track re-localises every frame and stays robust to motion / scale.
 *
 * The engine is decoupled from how frames are sourced: callers inject a
 * `getFrameBitmap(frameIdx)` that returns a decoded `ImageBitmap`.Frame
 * indices are opaque to the engine — it only requires that
 * `keyframeA.frameIdx` / `keyframeB.frameIdx` and the indices
 * passed to `getFrameBitmap` / reported via `onFrame` share one base.
 *
 * Pluggable next-frame strategies:
 *   "centroid-{1,3,5}" — chain forward; each frame prompts SAM2 with N
 *                         points sampled from the previous frame's mask.
 *   "lerp"             — linearly interpolate the user points between A and
 *                         B (no model). Cheap; assumes near-translation.
 */

import type { BrowserAnnotationProvider } from "./BrowserAnnotationProvider";
import { PointLabel, type InferenceResult, type PromptPoint } from "./types";

// Temporary perf instrumentation for the video-propagation tuning effort.
// Logs are tagged "[sam2-perf]" — filter the console on that. Engine-side
// timings (bitmap fetch / infer round-trip / point sampling) pair with the
// worker-side encode/decode breakdown; the gap between the engine's `infer`
// time and the worker's `total` is postMessage + structured-clone overhead.
// Flip to false (or strip) once the server-side-precompute decision is made.
const SAM2_PERF_LOG = true;

export interface Keyframe {
  /** Frame index in the caller's chosen base (the ImaVid agent uses the
   *  1-based frame number). */
  frameIdx: number;
  /** Point prompts that seed the mask at this keyframe. */
  points: PromptPoint[];
}

/** How prompt points for the next frame are chosen. */
export type PropagationStrategy =
  | "centroid-5"
  | "centroid-3"
  | "centroid-1"
  | "lerp"
  | "sam2-video-browser";

export interface PropagateOptions {
  /** Returns the decoded bitmap for a frame index (caller-defined base). */
  getFrameBitmap: (frameIdx: number) => Promise<ImageBitmap>;
  keyframeA: Keyframe;
  keyframeB: Keyframe;
  /** Stable id for the source video; per-frame embedding cache key prefix. */
  videoKey: string;
  /** Point-propagation strategy. Defaults to "centroid-5". */
  strategy?: PropagationStrategy;
  /** Called with each frame's mask as it lands. */
  onFrame?: (frameIdx: number, result: InferenceResult) => void;
  /** Per-frame progress over the inclusive `[A, B]` span. */
  onProgress?: (done: number, total: number) => void;
  /** Polled before each frame; return `true` to stop early. */
  shouldAbort?: () => boolean;
}

/**
 * Run propagation between two keyframes for a single object. Returns a map
 * `frameIdx → result` for every frame visited in `[kfA, kfB]` (inclusive).
 */
export async function propagate(
  provider: BrowserAnnotationProvider,
  options: PropagateOptions
): Promise<Map<number, InferenceResult>> {
  const {
    getFrameBitmap,
    keyframeA,
    keyframeB,
    videoKey,
    strategy = "centroid-5",
  } = options;

  if (keyframeA.frameIdx >= keyframeB.frameIdx)
    throw new Error("keyframeA must precede keyframeB");

  if (
    strategy === "lerp" &&
    keyframeA.points.length !== keyframeB.points.length
  )
    throw new Error("lerp strategy requires matching point counts");

  const start = keyframeA.frameIdx;
  const end = keyframeB.frameIdx;
  const span = end - start;
  const total = span + 1;
  const results = new Map<number, InferenceResult>();

  let prevResult: InferenceResult | null = null;

  const runStart = performance.now();
  let bitmapTotalMs = 0;
  let inferTotalMs = 0;
  let pointsTotalMs = 0;
  let framesDone = 0;

  for (let i = 0; i < total; i++) {
    if (options.shouldAbort?.()) {
      break;
    }

    const frameIdx = start + i;
    const t = span === 0 ? 0 : i / span;
    const tPoints = performance.now();
    const points = nextPoints(strategy, prevResult, keyframeA, keyframeB, t);
    const pointsMs = performance.now() - tPoints;

    if (!points) {
      // centroid found nothing — bail rather than mis-prompt
      break;
    }

    const tBitmap = performance.now();
    const bitmap = await getFrameBitmap(frameIdx);
    const bitmapMs = performance.now() - tBitmap;

    const cacheKey = `${videoKey}#frame=${frameIdx}`;
    const tInfer = performance.now();
    const result = await provider.inferBitmap({ bitmap, cacheKey, points });
    const inferMs = performance.now() - tInfer;

    if (SAM2_PERF_LOG) {
      // eslint-disable-next-line no-console
      console.debug(
        `[sam2-perf] frame=${frameIdx} bitmap=${bitmapMs.toFixed(
          1
        )}ms infer=${inferMs.toFixed(1)}ms points=${pointsMs.toFixed(1)}ms`
      );
    }
    bitmapTotalMs += bitmapMs;
    inferTotalMs += inferMs;
    pointsTotalMs += pointsMs;
    framesDone++;

    prevResult = result;
    results.set(frameIdx, result);
    options.onFrame?.(frameIdx, result);
    options.onProgress?.(i + 1, total);
  }

  if (SAM2_PERF_LOG && framesDone > 0) {
    const wall = performance.now() - runStart;
    // eslint-disable-next-line no-console
    console.debug(
      `[sam2-perf] run done frames=${framesDone} wall=${wall.toFixed(0)}ms (${(
        wall / framesDone
      ).toFixed(1)}ms/frame) ` +
        `bitmap=${bitmapTotalMs.toFixed(0)}ms infer=${inferTotalMs.toFixed(
          0
        )}ms points=${pointsTotalMs.toFixed(0)}ms strategy=${strategy}`
    );
  }

  return results;
}

/** Strategy dispatch — pick the next-frame prompt points. */
function nextPoints(
  strategy: PropagationStrategy,
  prevResult: InferenceResult | null,
  kfA: Keyframe,
  kfB: Keyframe,
  t: number
): PromptPoint[] | null {
  if (strategy === "lerp") {
    return lerpPoints(kfA.points, kfB.points, t);
  }

  // First frame of the chain: seed from the starting keyframe's points.
  if (prevResult === null) {
    return kfA.points.length > 0 ? kfA.points : null;
  }

  const count = centroidCount(strategy);
  const pts = pointsFromMask(prevResult, count);

  return pts.length > 0 ? pts : null;
}

function centroidCount(s: PropagationStrategy): 1 | 3 | 5 {
  switch (s) {
    case "centroid-1":
      return 1;
    case "centroid-3":
      return 3;
    default:
      return 5;
  }
}

function lerpPoints(
  a: PromptPoint[],
  b: PromptPoint[],
  t: number
): PromptPoint[] {
  return a.map((pa, i) => ({
    x: pa.x + (b[i].x - pa.x) * t,
    y: pa.y + (b[i].y - pa.y) * t,
    label: pa.label,
  }));
}

/**
 * Sample 1–5 positive points from a mask so SAM2 has enough signal on the
 * next frame to keep the same object extent:
 *   - the mask centroid (if it lies inside the mask);
 *   - up to four cardinal interior points at ~½ distance from the centroid
 *     toward each bbox edge, kept only when inside the mask.
 * Returned coordinates are normalised in the full-image frame.
 */
function pointsFromMask(
  r: InferenceResult,
  count: 1 | 3 | 5 = 5
): PromptPoint[] {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < r.maskHeight; y++) {
    for (let x = 0; x < r.maskWidth; x++) {
      if (r.mask[y * r.maskWidth + x] > 0.5) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }

  if (n === 0) {
    return [];
  }

  const cx = sx / n;
  const cy = sy / n;

  // centroid first; then horizontal pair (3); then vertical pair (5).
  const all: [number, number][] = [
    [cx, cy],
    [cx * 0.5, cy], // toward left edge
    [cx + (r.maskWidth - cx) * 0.5, cy], // toward right edge
    [cx, cy * 0.5], // toward top edge
    [cx, cy + (r.maskHeight - cy) * 0.5], // toward bottom edge
  ];
  const candidates = all.slice(0, count);

  const out: PromptPoint[] = [];
  for (const [mx, my] of candidates) {
    const ix = Math.min(r.maskWidth - 1, Math.max(0, Math.round(mx)));
    const iy = Math.min(r.maskHeight - 1, Math.max(0, Math.round(my)));
    if (r.mask[iy * r.maskWidth + ix] <= 0.5) {
      continue;
    }

    // mask-pixel → bbox-relative → full-image normalised
    out.push({
      x: r.bbox.x + (mx / r.maskWidth) * r.bbox.w,
      y: r.bbox.y + (my / r.maskHeight) * r.bbox.h,
      label: PointLabel.POSITIVE,
    });
  }

  return out;
}

/**
 * Derive seed prompt points from a normalised bounding box `[x, y, w, h]`:
 * the box centre plus four interior points at ¼ / ¾ along each axis, all
 * positive. Mirrors {@link pointsFromMask}'s sampling so the seed frame and
 * subsequent centroid-followed frames prompt SAM2 consistently.
 */
export function pointsFromBox(
  bbox: [number, number, number, number],
  count: 1 | 3 | 5 = 5
): PromptPoint[] {
  const [x, y, w, h] = bbox;
  const cx = x + w / 2;
  const cy = y + h / 2;

  const all: [number, number][] = [
    [cx, cy],
    [x + w * 0.25, cy], // left-interior
    [x + w * 0.75, cy], // right-interior
    [cx, y + h * 0.25], // top-interior
    [cx, y + h * 0.75], // bottom-interior
  ];

  return all.slice(0, count).map(([px, py]) => ({
    x: px,
    y: py,
    label: PointLabel.POSITIVE,
  }));
}
