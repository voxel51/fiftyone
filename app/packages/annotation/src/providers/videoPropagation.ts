/**
 * Video label propagation (browser, WASM).
 *
 * Pluggable point-propagation strategies; the orchestrator is the same.
 *
 *   "lerp"     — linearly interpolate the point between kfA and kfB.
 *                Cheap, works when motion is roughly translation.
 *   "centroid" — chain forward from kfA. Each frame uses the centroid of
 *                the previous frame's mask as the next SAM2 prompt.
 *                Robust to rotation / scale because SAM2 re-localises
 *                each frame. Default.
 *
 * Future: "klt", "optical-flow", "video-mode-sam" — add to the dispatch.
 */

import type { BrowserAnnotationProvider } from "./BrowserAnnotationProvider";
import { PointLabel, type InferenceResult, type PromptPoint } from "./types";

export interface Keyframe {
  /** Zero-based frame index. */
  frameIdx: number;
  /** Point prompts at this keyframe (1+ points). */
  points: PromptPoint[];
}

export type PropagationStrategy = "lerp" | "centroid";

/**
 * One object's keyframes for a multi-object propagation pass.
 */
export interface MultiObjectKeyframes {
  objectId: string;
  keyframeA: Keyframe;
  keyframeB: Keyframe;
  strategy?: PropagationStrategy;
}

export interface PropagateMultiOptions {
  videoEl: HTMLVideoElement;
  frameRate: number;
  videoKey: string;
  objects: MultiObjectKeyframes[];
  /** Called with each (frame, object) → mask as it lands. */
  onFrame?: (frameIdx: number, objectId: string, result: InferenceResult) => void;
  /** Per-frame progress (over the union range). */
  onProgress?: (done: number, total: number) => void;
  shouldAbort?: () => boolean;
}

export interface PropagateOptions {
  videoEl: HTMLVideoElement;
  /** Frames per second; used to convert frameIdx → currentTime. */
  frameRate: number;
  keyframeA: Keyframe;
  keyframeB: Keyframe;
  /** Stable id for the source video; per-frame embedding cache key. */
  videoKey: string;
  /** Point-propagation strategy. Defaults to "centroid". */
  strategy?: PropagationStrategy;
  onFrame?: (frameIdx: number, result: InferenceResult) => void;
  onProgress?: (done: number, total: number) => void;
  shouldAbort?: () => boolean;
}

/**
 * Run propagation between two keyframes for a single object.
 *
 * Returns a map frameIdx → result for every frame in `[kfA, kfB]`.
 */
export async function propagate(
  provider: BrowserAnnotationProvider,
  options: PropagateOptions,
): Promise<Map<number, InferenceResult>> {
  const {
    videoEl, frameRate, keyframeA, keyframeB, videoKey,
    strategy = "centroid",
  } = options;

  if (keyframeA.frameIdx >= keyframeB.frameIdx)
    throw new Error("keyframeA must precede keyframeB");

  if (strategy === "lerp" && keyframeA.points.length !== keyframeB.points.length)
    throw new Error("lerp strategy requires matching point counts");

  const start = keyframeA.frameIdx;
  const end = keyframeB.frameIdx;
  const span = end - start;
  const total = span + 1;
  const results = new Map<number, InferenceResult>();

  let prevResult: InferenceResult | null = null;

  for (let i = 0; i < total; i++) {
    if (options.shouldAbort?.()) break;

    const frameIdx = start + i;
    const t = span === 0 ? 0 : i / span;
    const points = nextPoints(strategy, prevResult, keyframeA, keyframeB, t);
    if (!points) break; // centroid found nothing — bail rather than mis-prompt

    const bitmap = await extractFrameBitmap(videoEl, frameIdx, frameRate);
    const cacheKey = `${videoKey}#frame=${frameIdx}`;
    const result = await provider.inferBitmap({ bitmap, cacheKey, points });

    prevResult = result;
    results.set(frameIdx, result);
    options.onFrame?.(frameIdx, result);
    options.onProgress?.(i + 1, total);
  }

  return results;
}

/**
 * Run propagation for multiple objects, interleaved per frame so each
 * frame's masks for all active objects land together. Visually this
 * looks like the masks rippling across the timeline together rather
 * than one object completing before the next starts.
 *
 * Each object propagates independently (its own kfA/kfB and its own
 * lastResult for centroid-following) but they all advance one frame
 * at a time. The encoder cache is shared, so per frame the encoder
 * runs once and the decoder runs once per active object.
 */
export async function propagateMulti(
  provider: BrowserAnnotationProvider,
  options: PropagateMultiOptions,
): Promise<void> {
  const { videoEl, frameRate, videoKey, objects } = options;
  if (objects.length === 0) return;

  for (const obj of objects) {
    if (obj.keyframeA.frameIdx >= obj.keyframeB.frameIdx)
      throw new Error(`object ${obj.objectId}: kfA must precede kfB`);
  }

  // Union of every frame index touched by any object.
  const frames = new Set<number>();
  for (const obj of objects)
    for (let f = obj.keyframeA.frameIdx; f <= obj.keyframeB.frameIdx; f++)
      frames.add(f);
  const sorted = [...frames].sort((a, b) => a - b);

  const last: Map<string, InferenceResult | null> = new Map(
    objects.map((o) => [o.objectId, null]),
  );

  for (let i = 0; i < sorted.length; i++) {
    if (options.shouldAbort?.()) break;
    const frameIdx = sorted[i];
    const bitmap = await extractFrameBitmap(videoEl, frameIdx, frameRate);
    const cacheKey = `${videoKey}#frame=${frameIdx}`;

    for (const obj of objects) {
      if (frameIdx < obj.keyframeA.frameIdx || frameIdx > obj.keyframeB.frameIdx)
        continue;
      const span = obj.keyframeB.frameIdx - obj.keyframeA.frameIdx;
      const t = span === 0 ? 0 : (frameIdx - obj.keyframeA.frameIdx) / span;
      const points = nextPoints(
        obj.strategy ?? "centroid",
        last.get(obj.objectId) ?? null,
        obj.keyframeA,
        obj.keyframeB,
        t,
      );
      if (!points) continue;

      const result = await provider.inferBitmap({ bitmap, cacheKey, points });
      last.set(obj.objectId, result);
      options.onFrame?.(frameIdx, obj.objectId, result);
    }

    options.onProgress?.(i + 1, sorted.length);
  }
}

/** Strategy dispatch — pick the next-frame prompt points. */
function nextPoints(
  strategy: PropagationStrategy,
  prevResult: InferenceResult | null,
  kfA: Keyframe,
  kfB: Keyframe,
  t: number,
): PromptPoint[] | null {
  switch (strategy) {
    case "lerp":
      return lerpPoints(kfA.points, kfB.points, t);
    case "centroid": {
      // First frame: use the user's original kfA points.
      if (prevResult === null) return kfA.points;
      // Multi-point sample: avoids the single-point drift where SAM2
      // collapses onto a small interior region of the previous mask.
      const pts = pointsFromMask(prevResult);
      return pts.length > 0 ? pts : null;
    }
  }
}

function lerpPoints(a: PromptPoint[], b: PromptPoint[], t: number): PromptPoint[] {
  return a.map((pa, i) => ({
    x: pa.x + (b[i].x - pa.x) * t,
    y: pa.y + (b[i].y - pa.y) * t,
    label: pa.label,
  }));
}

/**
 * Sample 1–5 positive points from a mask so SAM2 has enough signal on
 * the next frame to keep the same object extent. Strategy:
 *
 *   - Always include the mask centroid (if it lies inside the mask).
 *   - Add four cardinal interior points at ~½ distance from the
 *     centroid toward each bbox edge, kept only if they're inside the
 *     mask (mask value > 0.5 at that pixel).
 *
 * Coordinates returned are normalised in the full-image frame.
 */
function pointsFromMask(r: InferenceResult): PromptPoint[] {
  // Centroid in mask-pixel space.
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < r.maskHeight; y++) {
    for (let x = 0; x < r.maskWidth; x++) {
      if (r.mask[y * r.maskWidth + x] > 0.5) {
        sx += x; sy += y; n++;
      }
    }
  }
  if (n === 0) return [];

  const cx = sx / n;
  const cy = sy / n;

  const candidates: [number, number][] = [
    [cx, cy],
    [cx * 0.5, cy],                          // toward left edge
    [cx + (r.maskWidth - cx) * 0.5, cy],     // toward right edge
    [cx, cy * 0.5],                          // toward top edge
    [cx, cy + (r.maskHeight - cy) * 0.5],    // toward bottom edge
  ];

  const out: PromptPoint[] = [];
  for (const [mx, my] of candidates) {
    const ix = Math.min(r.maskWidth - 1, Math.max(0, Math.round(mx)));
    const iy = Math.min(r.maskHeight - 1, Math.max(0, Math.round(my)));
    if (r.mask[iy * r.maskWidth + ix] <= 0.5) continue;
    // mask-pixel → bbox-relative → full image normalised
    const lx = mx / r.maskWidth;
    const ly = my / r.maskHeight;
    out.push({
      x: r.bbox.x + lx * r.bbox.w,
      y: r.bbox.y + ly * r.bbox.h,
      label: PointLabel.POSITIVE,
    });
  }
  return out;
}

/**
 * Seek the video element to the given frame and grab pixels as an
 * ImageBitmap. The +0.5/fps nudge keeps us in the middle of the target
 * frame so we don't land on the boundary.
 */
async function extractFrameBitmap(
  videoEl: HTMLVideoElement,
  frameIdx: number,
  frameRate: number,
): Promise<ImageBitmap> {
  videoEl.currentTime = (frameIdx + 0.5) / frameRate;
  await new Promise<void>((resolve, reject) => {
    const ok = () => {
      videoEl.removeEventListener("seeked", ok);
      videoEl.removeEventListener("error", err);
      resolve();
    };
    const err = () => {
      videoEl.removeEventListener("seeked", ok);
      videoEl.removeEventListener("error", err);
      reject(new Error("Video seek failed"));
    };
    videoEl.addEventListener("seeked", ok, { once: true });
    videoEl.addEventListener("error", err, { once: true });
  });
  return createImageBitmap(videoEl);
}
