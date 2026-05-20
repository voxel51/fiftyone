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
  /**
   * Point prompts that produced a mask at this keyframe.
   * When undefined the keyframe is a "frame-only marker" — it bounds
   * the propagation range but does not seed a chain. Forward
   * propagation still needs kfA.points; backward still needs kfB.points;
   * a points-less kfB caps the forward run's end frame (and vice versa).
   */
  points?: PromptPoint[];
}

/** How prompt points for the next frame are chosen.
 *  - `centroid-5`: full multi-point centroid sample (centroid + 4 cardinal interior points). Default.
 *  - `centroid-3`: centroid + 2 cardinal points.
 *  - `centroid-1`: centroid only.
 *  - `lerp`:        linear interp between user-supplied A and B points (requires both, equal counts).
 */
export type PropagationStrategy =
  | "centroid-5"
  | "centroid-3"
  | "centroid-1"
  | "lerp"
  // Legacy alias for the original 5-point default — kept so existing
  // callers / saved state don't break.
  | "centroid";

/** Direction of tracking when the user supplies only one keyframe. */
export type PropagationDirection = "forward" | "backward" | "bidirectional";

/**
 * Default forward/backward horizon when no second keyframe is given.
 * "Infinity" means "as far as the video goes" — callers can clamp to a
 * specific number of frames by setting `horizonFrames` on the run.
 */
export const DEFAULT_SINGLE_KEYFRAME_HORIZON = Infinity;

/**
 * One object's keyframes for a multi-object propagation pass.
 * Either keyframe may be omitted to track in only one direction.
 */
export interface MultiObjectKeyframes {
  objectId: string;
  keyframeA?: Keyframe;
  keyframeB?: Keyframe;
  strategy?: PropagationStrategy;
  /** Forced direction; auto-detected from kfA/kfB when omitted. */
  direction?: PropagationDirection;
  /** Frame budget when only one keyframe is set. */
  horizonFrames?: number;
  /** Bounds [0, lastFrame] used to clamp horizons. */
  totalFrames?: number;
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
  /**
   * Optional `objectId → frameIdx → existing result` map. When a
   * (frame, object) entry is present we reuse it instead of running
   * inference, but still feed it into the next-frame centroid context.
   * Used to resume a propagation after Stop without redoing frames.
   */
  existingResults?: Map<string, Map<number, InferenceResult>>;
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
/** Resolved per-object range and direction. */
interface ObjectRun {
  obj: MultiObjectKeyframes;
  start: number;
  end: number;
  direction: PropagationDirection;
  /** Ordered sequence of frame indices this object's chain visits. */
  order: number[];
}

function resolveRun(obj: MultiObjectKeyframes): ObjectRun {
  const { keyframeA: a, keyframeB: b } = obj;
  const horizon = obj.horizonFrames ?? DEFAULT_SINGLE_KEYFRAME_HORIZON;
  const total = obj.totalFrames ?? Infinity;
  const hasMaskA = !!a?.points && a.points.length > 0;
  const hasMaskB = !!b?.points && b.points.length > 0;

  // Auto direction: prefer bidir when both have masks, else fall back
  // to whichever side has a mask. Frame-only markers count as boundary
  // hints but don't seed a chain.
  let direction = obj.direction;
  if (!direction) {
    if (hasMaskA && hasMaskB) direction = "bidirectional";
    else if (hasMaskA) direction = "forward";
    else if (hasMaskB) direction = "backward";
    else throw new Error(`object ${obj.objectId}: no keyframe has a mask`);
  }

  if (direction === "bidirectional") {
    if (!a || !b) throw new Error(`object ${obj.objectId}: bidir needs both keyframes`);
    if (!hasMaskA || !hasMaskB) throw new Error(`object ${obj.objectId}: bidir needs masks on both keyframes`);
    if (a.frameIdx >= b.frameIdx) throw new Error(`object ${obj.objectId}: kfA must precede kfB`);
    const order: number[] = [];
    for (let f = a.frameIdx; f <= b.frameIdx; f++) order.push(f);
    return { obj, start: a.frameIdx, end: b.frameIdx, direction, order };
  }

  if (direction === "forward") {
    if (!a || !hasMaskA) throw new Error(`object ${obj.objectId}: forward needs a mask on kfA`);
    const start = a.frameIdx;
    // kfB (even points-less) caps the end frame. Without it the run
    // goes to the last frame of the video; without a known totalFrames
    // we conservatively cap at `start + 999` so we never enter an
    // infinite loop on bad input.
    const boundary = b?.frameIdx ?? Infinity;
    const totalCap = isFinite(total) && total > 0 ? total - 1 : start + 999;
    const horizonCap = isFinite(horizon) ? start + horizon : Infinity;
    const end = Math.max(start, Math.min(horizonCap, boundary, totalCap));
    const order: number[] = [];
    for (let f = start; f <= end; f++) order.push(f);
    return { obj, start, end, direction, order };
  }

  // backward
  if (!b || !hasMaskB) throw new Error(`object ${obj.objectId}: backward needs a mask on kfB`);
  const end = b.frameIdx;
  const boundary = a?.frameIdx ?? -Infinity;
  const horizonFloor = isFinite(horizon) ? end - horizon : -Infinity;
  const start = Math.min(end, Math.max(0, horizonFloor, boundary));
  const order: number[] = [];
  for (let f = end; f >= start; f--) order.push(f);
  return { obj, start, end, direction, order };
}

export async function propagateMulti(
  provider: BrowserAnnotationProvider,
  options: PropagateMultiOptions,
): Promise<void> {
  const { videoEl, frameRate, videoKey, objects } = options;
  if (objects.length === 0) return;

  const runs = objects.map(resolveRun);

  // Split into per-direction chain views. Pure forward / backward keep
  // the run's own order. Bidir runs split [A..B] in HALF: the forward
  // chain covers [A..mid], the backward chain covers [B..mid+1]. They
  // meet at the midpoint and together cover every frame exactly once,
  // so the total inference cost is the same as a single-direction
  // walk but the drift per frame is half (each frame's mask comes
  // from whichever chain's real user keyframe is closer).
  type ChainView = {
    run: ObjectRun;
    direction: "forward" | "backward";
    order: number[];
  };
  const allChains: ChainView[] = [];
  for (const r of runs) {
    if (r.direction === "forward") {
      // run.order is already [start..end] ascending.
      allChains.push({ run: r, direction: "forward", order: r.order });
    } else if (r.direction === "backward") {
      // run.order is already [end..start] descending.
      allChains.push({ run: r, direction: "backward", order: r.order });
    } else if (r.direction === "bidirectional") {
      const A = r.start;
      const B = r.end;
      const mid = Math.floor((A + B) / 2);
      // Forward chain covers [A..mid] (inclusive).
      const fwdOrder: number[] = [];
      for (let f = A; f <= mid; f++) fwdOrder.push(f);
      // Backward chain covers [B..mid+1] (inclusive, descending).
      // For B === A+1 (range of 2), mid = A, backward covers [B..A+1] = [B].
      const bwdOrder: number[] = [];
      for (let f = B; f >= mid + 1; f--) bwdOrder.push(f);
      if (fwdOrder.length > 0)
        allChains.push({ run: r, direction: "forward", order: fwdOrder });
      if (bwdOrder.length > 0)
        allChains.push({ run: r, direction: "backward", order: bwdOrder });
    }
  }
  if (allChains.length === 0) return;

  // Per-(object, chain-direction) `last result` — so bidir's forward
  // and backward chains track their own centroid context separately.
  const lastKey = (objectId: string, dir: "forward" | "backward") =>
    `${objectId}:${dir}`;
  const last: Map<string, InferenceResult | null> = new Map();
  for (const c of allChains) last.set(lastKey(c.run.obj.objectId, c.direction), null);

  // Total step-emits across every chain (used for onProgress).
  let plannedTotal = 0;
  for (const c of allChains) plannedTotal += c.order.length;
  let opsDone = 0;

  // INTERLEAVED step loop. At step k, EVERY active chain advances by
  // exactly one frame (c.order[k]). For bidir runs the forward chain's
  // order is [A..mid] and the backward chain's order is [B..mid+1],
  // so at step k the forward chain is at A+k and the backward chain
  // is at B-k — they march toward the midpoint together.
  const maxSteps = allChains.reduce((m, c) => Math.max(m, c.order.length), 0);

  for (let k = 0; k < maxSteps; k++) {
    if (options.shouldAbort?.()) break;

    // Collect every (frame, chain) pair active at this step. Multiple
    // chains can land on the same frame (e.g. two objects sharing a
    // frame at this step). We group by frame so the bitmap extraction
    // runs once per frame.
    interface Entry { chain: ChainView; }
    const work = new Map<number, Entry[]>();
    for (const c of allChains) {
      if (k >= c.order.length) continue;
      const f = c.order[k];
      const arr = work.get(f) ?? [];
      arr.push({ chain: c });
      work.set(f, arr);
    }

    // Process the frames in ascending order so the per-step emit order
    // is consistent regardless of how the chains interleave.
    const framesThisStep = [...work.keys()].sort((a, b) => a - b);
    for (const frameIdx of framesThisStep) {
      if (options.shouldAbort?.()) break;
      const entries = work.get(frameIdx)!;

      // Reused-vs-needs-inference split, per chain.
      const reusedEntries: { entry: Entry; result: InferenceResult }[] = [];
      const inferEntries: Entry[] = [];
      for (const e of entries) {
        const existing = options.existingResults
          ?.get(e.chain.run.obj.objectId)
          ?.get(frameIdx);
        if (existing) reusedEntries.push({ entry: e, result: existing });
        else inferEntries.push(e);
      }

      // Fold reused into the chain's context (so its next step prompts
      // from this mask).
      for (const { entry, result } of reusedEntries) {
        last.set(lastKey(entry.chain.run.obj.objectId, entry.chain.direction), result);
        opsDone++;
      }

      // Only pay the bitmap fetch when at least one chain needs fresh
      // inference at this frame.
      if (inferEntries.length > 0) {
        const bitmap = await extractFrameBitmap(videoEl, frameIdx, frameRate);
        const cacheKey = `${videoKey}#frame=${frameIdx}`;

        for (const e of inferEntries) {
          if (options.shouldAbort?.()) break;
          const { run, direction } = e.chain;
          const obj = run.obj;
          const span = run.end - run.start;
          const t = span === 0 ? 0 : (frameIdx - run.start) / span;
          // Seed keyframe for this chain's first step.
          const seedKf = direction === "forward" ? obj.keyframeA : obj.keyframeB;
          const otherKf = direction === "forward" ? obj.keyframeB : obj.keyframeA;
          const points = nextPoints(
            obj.strategy ?? "centroid-5",
            last.get(lastKey(obj.objectId, direction)) ?? null,
            seedKf,
            otherKf,
            t,
          );
          if (!points) { opsDone++; continue; }

          const result = await provider.inferBitmap({ bitmap, cacheKey, points });
          last.set(lastKey(obj.objectId, direction), result);

          // For bidir runs the two chains cover DISJOINT halves of
          // [A..B] (forward owns [A..mid], backward owns [mid+1..B]),
          // so each frame is touched by exactly one chain and we
          // always emit. Same for pure forward / backward runs.
          options.onFrame?.(frameIdx, obj.objectId, result);
          opsDone++;
        }
      }

      options.onProgress?.(opsDone, plannedTotal);
    }
  }
}

/** Strategy dispatch — pick the next-frame prompt points. */
function nextPoints(
  strategy: PropagationStrategy,
  prevResult: InferenceResult | null,
  kfA: Keyframe | undefined,
  kfB: Keyframe | undefined,
  t: number,
): PromptPoint[] | null {
  if (strategy === "lerp") {
    // Lerp requires both endpoints with matching point counts.
    if (!kfA?.points || !kfB?.points) {
      return kfA?.points ?? kfB?.points ?? null;
    }
    return lerpPoints(kfA.points, kfB.points, t);
  }
  // First frame of the chain: seed from whichever keyframe started us.
  if (prevResult === null) {
    return kfA?.points ?? kfB?.points ?? null;
  }
  const count = centroidCount(strategy);
  const pts = pointsFromMask(prevResult, count);
  return pts.length > 0 ? pts : null;
}

function centroidCount(s: PropagationStrategy): 1 | 3 | 5 {
  switch (s) {
    case "centroid-1": return 1;
    case "centroid-3": return 3;
    case "centroid-5": return 5;
    case "centroid":   return 5;  // legacy alias
    default:           return 5;
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
function pointsFromMask(
  r: InferenceResult,
  count: 1 | 3 | 5 = 5,
): PromptPoint[] {
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

  // Sample order: centroid first; then "horizontal pair" (left/right) at
  // 3 points; then add "vertical pair" (top/bottom) at 5 points.
  const all: [number, number][] = [
    [cx, cy],
    [cx * 0.5, cy],                          // toward left edge
    [cx + (r.maskWidth - cx) * 0.5, cy],     // toward right edge
    [cx, cy * 0.5],                          // toward top edge
    [cx, cy + (r.maskHeight - cy) * 0.5],    // toward bottom edge
  ];
  const candidates = all.slice(0, count);

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
