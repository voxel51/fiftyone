import {
  type FrameLabelSnapshot,
  type LocalDetection,
  type RawDetection,
  type RawDetectionsField,
  type SerializedMask,
  type Stage,
  type SyntheticBox,
} from "@fiftyone/utilities";
import {
  maskBitmapCache,
  maskSourceOf,
  type MaskSource,
} from "@fiftyone/lighter";
import { type FrameDoc } from "../../../core/src/client/framesClient";
import { getVideoLabelsWindow } from "../../../core/src/client/videoLabelsClient";
import {
  frameAt,
  PlaybackStreamBase,
  type BufferReadiness,
  type PlaybackStore,
} from "@fiftyone/playback";
import { isInFetchedRange, mergeRange, toSecondRanges } from "./fetchedRanges";

// Re-exported from `@fiftyone/utilities` for the package barrel.
export type { LocalDetection, RawDetection, RawDetectionsField };

export interface VideoFrameLabelsStreamOptions {
  id: string;
  /** Sample id for the parent video document. */
  sampleId: string;
  /** Current dataset name (the window read requires it). */
  dataset: string;
  /** Active view stages — same shape sent on every dataset query. */
  view: Stage[];
  /** Total frame count of the clip (1-indexed up to this number). */
  frameCount: number;
  /** Frame rate in frames per second. */
  frameRate: number;
  /**
   * Primary per-frame field carrying `Detections`, frame-relative (the `frames.`
   * prefix stripped). Backs the read-only overlay snapshot ({@link getValue})
   * and the timeline index's dynamic-attribute lookup.
   *
   * @default "detections"
   */
  frameField?: string;
  /**
   * Every active per-frame label field to fetch + seed into the engine,
   * frame-relative (e.g. `["detections", "polylines"]`). The engine holds all
   * of them so the sidebar/canvas/timeline see every field; defaults to just
   * {@link frameField} when omitted.
   */
  frameFields?: string[];
  /**
   * Number of frames to request in a single window chunk. Larger values mean
   * fewer round trips but larger payloads.
   *
   * @default 60
   */
  chunkSize?: number;
}

const DEFAULT_CHUNK_SIZE = 60;
const DEFAULT_FRAME_FIELD = "detections";

/** localStorage key + Vite env var for the mask gate toggle (see below). */
const MASK_GATE_LOCALSTORAGE_KEY = "fo:maskGate";

/**
 * Whether the clock waits for a frame's masks to be decoded and pinned, not just
 * fetched. On by default: an annotation surface should stall rather than present
 * a frame alongside another frame's mask. Kill switch for comparing behavior, or
 * for a session where stalling is worse than staleness:
 *
 *   localStorage.setItem("fo:maskGate", "0")   // off
 *   localStorage.removeItem("fo:maskGate")     // back to the default
 */
const readMaskGateEnabled = (): boolean => {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage?.getItem(MASK_GATE_LOCALSTORAGE_KEY);

      if (stored !== null && stored !== undefined) {
        return stored !== "0" && stored !== "false";
      }
    } catch {
      // localStorage can throw in locked-down contexts; fall through to env.
    }
  }

  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  const fromEnv = env?.VITE_MASK_GATE;

  return fromEnv ? fromEnv !== "0" && fromEnv !== "false" : true;
};

const MASK_GATE_ENABLED = readMaskGateEnabled();

/**
 * Frames whose masks are decoded and pinned ahead of the playhead — the
 * decode-ahead lead. Sized so the pinned set stays small next to any sane cache
 * capacity, since held masks are exempt from eviction.
 */
const MASK_HOLD_AHEAD_FRAMES = 12;

/** Frames kept pinned behind the playhead, so small jitter doesn't re-decode. */
const MASK_HOLD_BEHIND_FRAMES = 2;

/**
 * Labels stream backed by the `POST /video-labels/window` endpoint.
 *
 * Caches field-projected per-frame label payloads by 1-indexed frame number.
 * `bufferState` reports readiness for a given time; `prefetch` issues a window
 * fetch starting at the first missing frame in the requested range; `getValue`
 * reads the cached frame for the read-only snapshot.
 *
 * Read-only: the stream loads window chunks and seeds the annotation engine's
 * frame store (via {@link cachedFrames} + {@link subscribeToEdits}). All label
 * mutation, dirty tracking, and persistence live in the engine; the stream
 * holds no edit state.
 */
export class VideoFrameLabelsStream extends PlaybackStreamBase<FrameLabelSnapshot> {
  private readonly sampleId: string;
  private readonly dataset: string;
  private readonly view: Stage[];
  private readonly frameCount: number;
  private readonly frameRate: number;
  private frameField: string;
  /** All fields fetched per window + seeded into the engine (primary first). */
  private readonly frameFields: string[];
  private readonly chunkSize: number;

  private readonly cache = new Map<number, FrameDoc>();
  private readonly inflight = new Map<number, Promise<void>>();
  private readonly fetchedRanges: Array<[number, number]> = [];
  /**
   * Frames whose masks are decoded AND borrowed, keyed to the sources borrowed
   * for them — see {@link holdMasks}. A borrow is what makes readiness mean
   * something: the cache can't evict a mask the gate has promised.
   */
  private readonly maskHeld = new Map<number, MaskSource[]>();
  /** Current hold window in frames — see {@link holdWindow}. */
  private maskHoldStart = 0;
  private maskHoldEnd = -1;
  /** Frames with a hold pass currently running. */
  private readonly maskWarmInFlight = new Set<number>();
  /**
   * Frames whose masks failed to decode. Reported ready so one broken mask can't
   * stall the clock forever — same escape hatch `frameBitmapStream` uses to play
   * through a frame whose bitmap will never arrive.
   */
  private readonly maskUndecodable = new Set<number>();
  /**
   * Memoized per-frame mask sources. Deriving these walks every detection on the
   * frame, and the hold window re-checks the same frames on every commit, so
   * without memoization that walk dominates the commit. Invalidated when a
   * frame's document is replaced.
   */
  private readonly maskSourceCache = new Map<number, MaskSource[]>();
  // Notified whenever a chunk lands. The annotation engine's frame store
  // re-seeds from `cachedFrames()` on this signal (via `subscribeToEdits`);
  // the stream itself holds no edit state — it is a read-only window seed
  // and the engine owns all label mutations.
  private readonly editListeners = new Set<() => void>();

  constructor(opts: VideoFrameLabelsStreamOptions) {
    super(opts.id, {
      blocking: true,
      duration: opts.frameCount / opts.frameRate,
      nativeStepSeconds: 1 / opts.frameRate,
      lookupPolicy: {
        type: "nearestPrevious",
        thresholdSeconds: 1 / opts.frameRate,
      },
    });

    this.sampleId = opts.sampleId;
    this.dataset = opts.dataset;
    this.view = opts.view;
    this.frameCount = opts.frameCount;
    this.frameRate = opts.frameRate;
    this.frameField = opts.frameField ?? DEFAULT_FRAME_FIELD;
    // Always fetch the primary field; union any extra active fields (deduped).
    this.frameFields =
      opts.frameFields && opts.frameFields.length > 0
        ? [...new Set([this.frameField, ...opts.frameFields])]
        : [this.frameField];
    this.chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  }

  /**
   * Resolve once the frame containing `time` is cached. Coalesces against
   * any in-flight chunk covering that frame; otherwise kicks one off.
   *
   * Intended for "show overlays before the user plays" — call this after
   * registering the stream, then `seek(time)` once it resolves so the
   * engine commits with the frame in hand.
   */
  async warmup(time = 0): Promise<void> {
    const frame = this.timeToFrame(time);
    if (this.cache.has(frame)) {
      return;
    }

    const inflight = this.inflight.get(frame);
    if (inflight) {
      await inflight;
      return;
    }

    await this.fetchChunk(frame);
  }

  /**
   * Resolve once every frame in [1, frameCount] is cached. Coalesces
   * against any in-flight chunks; otherwise walks the range in chunk-
   * sized strides and dispatches fetches in parallel. Expensive over long
   * clips; used for one-shot full-clip analyses (e.g. timeline tracks).
   */
  async warmupAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    let f = 1;

    while (f <= this.frameCount) {
      if (this.cache.has(f)) {
        f++;
        continue;
      }

      const inflight = this.inflight.get(f);
      if (inflight) {
        promises.push(inflight);
        f += this.chunkSize;
        continue;
      }

      promises.push(this.fetchChunk(f));
      f += this.chunkSize;
    }

    await Promise.all(promises);
  }

  /** Total frames in the clip — useful for callers iterating the cache. */
  get totalFrames(): number {
    return this.frameCount;
  }

  /**
   * Every cached frame document, for seeding an external store (the annotation
   * engine's frame store). Pairs with {@link subscribeToEdits} so the seed
   * re-runs as chunks land.
   */
  cachedFrames(): FrameDoc[] {
    return [...this.cache.values()];
  }

  /** Frame rate the stream was constructed with, in fps. */
  get fps(): number {
    return this.frameRate;
  }

  /** Per-frame field that carries the labels (e.g. `"detections"`). */
  get labelsField(): string {
    return this.frameField;
  }

  /**
   * Repoint the primary label field the read-only snapshot ({@link getValue})
   * extracts from. Every field in {@link frameFields} is already fetched into
   * the per-frame cache, so this only changes which one the snapshot reads — no
   * refetch. Lets the active field follow a field-move without rebuilding the
   * stream (which would tear down the engine's frame store and its edits).
   */
  setPrimaryField(field: string): void {
    this.frameField = field;
  }

  /**
   * The dataset query this stream reads against — the params the
   * `/video-labels/{index,window}` fetches share with the `/frames` seed.
   */
  labelQuery(): { sampleId: string; dataset: string; view: Stage[] } {
    return { sampleId: this.sampleId, dataset: this.dataset, view: this.view };
  }

  bufferState(time: number): BufferReadiness {
    const frame = this.timeToFrame(time);

    if (this.cache.has(frame)) {
      return this.maskReadiness(frame);
    }

    if (this.isInflight(frame)) {
      return "loading";
    }

    if (isInFetchedRange(this.fetchedRanges, frame)) {
      return "ready";
    }

    return "missing";
  }

  /**
   * Readiness of this frame's decoded masks, folded into {@link bufferState} so
   * the clock waits for masks it can actually draw rather than merely for the
   * bytes they decode from. Without this the stream reports ready as soon as
   * the label document lands, and a mask decoded a few frames later paints
   * against whatever frame the playhead has since reached.
   *
   * Ready means this frame's masks are BORROWED, not merely that a decode pass
   * ran for it once. An earlier version settled a frame permanently after one
   * pass, which made the gate a first-visit-only check: on a looping play-through
   * every frame was already settled, so the clock advanced against masks the
   * cache had long since evicted and the draw path decoded them late. Holding
   * borrows re-gates every visit and keeps the cache from evicting what the gate
   * has promised.
   */
  private maskReadiness(frame: number): BufferReadiness {
    if (!MASK_GATE_ENABLED) {
      return "ready";
    }

    if (this.maskHeld.has(frame) || this.maskUndecodable.has(frame)) {
      return "ready";
    }

    if (this.maskWarmInFlight.has(frame)) {
      return "loading";
    }

    // Nothing to hold, so nothing to wait for. Cheap (sources are memoized) and
    // load-bearing: without it every frame of a maskless clip would cost an
    // extra barrier round-trip waiting on a hold pass with no work to do.
    if (this.maskSourcesAt(frame).length === 0) {
      return "ready";
    }

    // Not held yet — `prefetch`/`onCommit` will start the hold. Reporting
    // missing (not loading) is what keeps the engine calling prefetch.
    return "missing";
  }

  /**
   * Distinct inline mask sources across every cached frame — the clip's mask
   * working set. Compare against `entries` from {@link maskBitmapCache}'s stats:
   * a working set larger than what the cache holds at capacity means a looping
   * playthrough re-decodes on every pass rather than reusing, because LRU evicts
   * whichever frame the loop is about to come back around to.
   */
  maskWorkingSetSize(): number {
    const distinct = new Set<MaskSource>();

    for (const frame of this.cache.keys()) {
      for (const source of this.maskSourcesAt(frame)) {
        distinct.add(source);
      }
    }

    return distinct.size;
  }

  /** Every inline mask source carried by this frame's cached document. */
  private maskSourcesAt(frame: number): MaskSource[] {
    const memoized = this.maskSourceCache.get(frame);

    if (memoized) {
      return memoized;
    }

    const sources = this.deriveMaskSourcesAt(frame);

    // Only memoize once the document has landed; an empty result for an
    // unfetched frame would otherwise stick after the chunk arrives.
    if (this.cache.has(frame)) {
      this.maskSourceCache.set(frame, sources);
    }

    return sources;
  }

  private deriveMaskSourcesAt(frame: number): MaskSource[] {
    const doc = this.cache.get(frame);

    if (!doc) {
      return [];
    }

    const sources: MaskSource[] = [];

    for (const field of this.frameFields) {
      const raw = doc[field] as RawDetectionsField | undefined;

      for (const detection of raw?.detections ?? []) {
        const source = maskSourceOf(detection.mask as SerializedMask);

        if (source) {
          sources.push(source);
        }
      }
    }

    return sources;
  }

  /**
   * Decode this frame's masks and BORROW them, so the cache cannot evict them
   * out from under the readiness this frame is about to report.
   *
   * Borrows are released as the playhead leaves the frame (see
   * {@link releaseMasksOutside}), which bounds what is pinned to the hold window
   * regardless of cache capacity — the reason this can hold without starving a
   * cache too small for the whole clip.
   */
  private holdMasks(frame: number): void {
    if (this.maskHeld.has(frame) || this.maskUndecodable.has(frame)) {
      return;
    }

    if (this.maskWarmInFlight.has(frame)) {
      return;
    }

    const sources = this.maskSourcesAt(frame);

    if (sources.length === 0) {
      // Held with no borrows: nothing to draw, so the frame is ready, and the
      // entry doubles as the "already checked" marker.
      this.maskHeld.set(frame, []);
      return;
    }

    // Every source already resident: acquire synchronously so this frame is
    // ready within the current tick rather than a microtask later.
    if (sources.every((source) => maskBitmapCache.has(source))) {
      const borrowed = sources.filter(
        (source) => maskBitmapCache.acquire(source) !== undefined,
      );

      if (borrowed.length === sources.length) {
        this.maskHeld.set(frame, borrowed);
        return;
      }

      // Raced an eviction between `has` and `acquire` — hand back whatever we
      // took and fall through to the async path.
      for (const source of borrowed) {
        maskBitmapCache.release(source);
      }
    }

    this.maskWarmInFlight.add(frame);

    void Promise.allSettled(
      sources.map((source) => maskBitmapCache.acquireAsync(source)),
    ).then((results) => {
      this.maskWarmInFlight.delete(frame);

      const borrowed: MaskSource[] = [];
      let failed = false;

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          borrowed.push(sources[index]);
        } else {
          failed = true;
        }
      });

      // A frame the playhead has already left, or whose document was replaced
      // mid-decode, must not become held — its borrows would never be released.
      if (!this.maskHoldWanted(frame)) {
        for (const source of borrowed) {
          maskBitmapCache.release(source);
        }
        return;
      }

      if (failed) {
        for (const source of borrowed) {
          maskBitmapCache.release(source);
        }
        this.maskUndecodable.add(frame);
        return;
      }

      this.maskHeld.set(frame, borrowed);
    });
  }

  /**
   * Whether `frame` is still inside the window the hold pass was started for.
   * Guards the async completion against a playhead that has moved on.
   */
  private maskHoldWanted(frame: number): boolean {
    return (
      frame >= this.maskHoldStart &&
      frame <= this.maskHoldEnd &&
      !this.maskHeld.has(frame)
    );
  }

  /** Return the borrows for every held frame outside the current hold window. */
  private releaseMasksOutside(start: number, end: number): void {
    for (const [frame, sources] of this.maskHeld) {
      if (frame >= start && frame <= end) {
        continue;
      }

      for (const source of sources) {
        maskBitmapCache.release(source);
      }

      this.maskHeld.delete(frame);
    }
  }

  /**
   * Return every mask borrow this stream holds. Must be called when the
   * surface unmounts (sample change, modal close): the stream is the sole
   * owner of its holds, and an unreturned borrow pins its entry in the
   * process-wide cache for good — the bitmap can never be closed.
   *
   * The window is emptied FIRST so a warm pass still in flight releases its
   * borrows on completion instead of re-holding ({@link maskHoldWanted} is
   * window-scoped).
   */
  dispose(): void {
    this.maskHoldStart = 0;
    this.maskHoldEnd = -1;

    // Nothing is inside an empty window, so this releases every held frame.
    this.releaseMasksOutside(this.maskHoldStart, this.maskHoldEnd);
  }

  /** Drop any hold on `frame` — its masks may no longer be the right ones. */
  private releaseMasksAt(frame: number): void {
    const sources = this.maskHeld.get(frame);

    if (!sources) {
      return;
    }

    for (const source of sources) {
      maskBitmapCache.release(source);
    }

    this.maskHeld.delete(frame);
  }

  /**
   * Re-centre the hold window on the committed frame: hold forward, release
   * behind.
   *
   * Called from `onCommit` as well as `prefetch` because the engine only calls
   * `prefetch` while a stream reports NOT ready — decode-ahead has to keep
   * running through the ready stretches too, which is what `frameBitmapStream`
   * does for the same reason.
   *
   * The window is sized in FRAMES rather than from `lookaheadSeconds` (~58
   * frames here) because every frame in it pins its masks: a window that large
   * would hold most of a small cache, and holds are exempt from eviction.
   */
  private holdWindow(time: number): void {
    const frame = this.timeToFrame(time);
    const start = Math.max(1, frame - MASK_HOLD_BEHIND_FRAMES);
    const end = Math.min(this.frameCount, frame + MASK_HOLD_AHEAD_FRAMES);

    this.maskHoldStart = start;
    this.maskHoldEnd = end;

    this.releaseMasksOutside(start, end);

    // Forward only — decoding frames the playhead has already passed buys
    // nothing, though ones still held from behind stay held for jitter.
    for (let f = frame; f <= end; f++) {
      this.holdMasks(f);
    }
  }

  prefetch(range: [number, number]): void {
    const [startSec, endSec] = range;
    const startFrame = this.timeToFrame(startSec);
    const endFrame = this.timeToFrame(endSec);

    // Decode-ahead: frames whose documents are already cached still need their
    // masks rasterized before they can be drawn, and that is the stage the
    // playhead actually outruns. Holding across the window (rather than
    // first-missing-wins, as the chunk fetch below does) is what turns a cold
    // play-through into cache hits.
    if (MASK_GATE_ENABLED) {
      this.holdWindow(startSec);
    }

    // Find the first missing frame in the range and issue one chunk
    // starting there. The engine calls prefetch again as the playhead
    // advances — we don't need to fan out multiple requests here.
    for (let f = startFrame; f <= endFrame; f++) {
      if (this.cache.has(f) || this.isInflight(f)) {
        continue;
      }

      void this.fetchChunk(f);

      return;
    }
  }

  /**
   * Whether a frame has a publishable snapshot — the cheap half of
   * {@link getValue}, which `onCommit` uses to decide whether building one is
   * worth it. Keep in step with `getValue`'s null case.
   */
  private hasSnapshotAt(frame: number): boolean {
    return this.cache.has(frame) || isInFetchedRange(this.fetchedRanges, frame);
  }

  getValue(time: number): FrameLabelSnapshot | null {
    const frame = this.timeToFrame(time);

    if (!this.hasSnapshotAt(frame)) {
      return null;
    }

    const sample = this.cache.get(frame);

    return {
      frameNumber: frame,
      // No cached sample but the chunk was fetched: this frame genuinely has no
      // labels, and an empty list tells consumers that apart from "not fetched".
      // todo - adapter pattern for other label types
      detections: sample ? extractDetections(sample, this.frameField) : [],
    };
  }

  /**
   * Custom `onCommit`: dedupe by `frameNumber` so we only publish when the
   * frame changes or transitions to/from `null` (cache miss → hit). Avoids
   * re-publishing identical content on every intra-frame tick.
   */
  override onCommit(time: number, store: PlaybackStore): void {
    const frame = this.timeToFrame(time);
    const prev = this.readPublished(store);

    if (MASK_GATE_ENABLED) {
      // Before the frame-dedupe below: warming has to keep running even on ticks
      // that publish nothing new, since that is most of them.
      this.holdWindow(time);
    }

    // Dedupe BEFORE building the snapshot. The engine commits several times per
    // frame and `getValue` walks every detection on the frame, so the snapshots
    // thrown away here outnumber the ones published — a cost that scales with
    // labels per frame, i.e. worst on exactly the dense samples this stream
    // gates for.
    const hasSnapshot = this.hasSnapshotAt(frame);

    if (prev !== null && prev.frameNumber === frame && hasSnapshot) {
      return;
    }

    if (prev === null && !hasSnapshot) {
      return;
    }

    this.publish(store, this.getValue(time));
  }

  /**
   * Subscribe to cache-mutation events (chunks landing). Returns an
   * unsubscribe function. Used to re-seed an external store (the engine's
   * frame store) whenever the `/frames` cache changes.
   */
  subscribeToEdits(listener: () => void): () => void {
    this.editListeners.add(listener);
    return () => {
      this.editListeners.delete(listener);
    };
  }

  private notifyEdits(): void {
    for (const listener of this.editListeners) {
      listener();
    }
  }

  bufferedRanges(): Array<[number, number]> {
    return toSecondRanges(this.fetchedRanges, this.frameRate);
  }

  /** Map a stream time to the 1-indexed frame number. */
  timeToFrame(time: number): number {
    return frameAt(time, this.frameRate, this.frameCount);
  }

  private isInflight(frame: number): boolean {
    return this.inflight.has(frame);
  }

  private async fetchChunk(startFrame: number): Promise<void> {
    const numFrames = Math.min(
      this.chunkSize,
      this.frameCount - startFrame + 1,
    );

    if (numFrames <= 0) {
      return;
    }

    const promise = this.doFetch(startFrame, numFrames).finally(() => {
      for (let f = startFrame; f < startFrame + numFrames; f++) {
        if (this.inflight.get(f) === promise) {
          this.inflight.delete(f);
        }
      }
    });

    for (let f = startFrame; f < startFrame + numFrames; f++) {
      this.inflight.set(f, promise);
    }

    return promise;
  }

  private async doFetch(startFrame: number, numFrames: number): Promise<void> {
    const endFrame = Math.min(startFrame + numFrames - 1, this.frameCount);

    try {
      const result = await getVideoLabelsWindow({
        sampleId: this.sampleId,
        dataset: this.dataset,
        view: this.view,
        fields: this.frameFields,
        startFrame,
        endFrame,
      });

      let landed = 0;
      for (const [frameNumber, fields] of Object.entries(result.frames)) {
        // Field-projected window payload → the cache's per-frame doc shape.
        // The engine owns edits, so the stream never reconciles against it.
        this.cache.set(Number(frameNumber), {
          frame_number: Number(frameNumber),
          ...fields,
        });
        // A replaced document may carry different masks, so drop the memoized
        // sources and any hold taken against the old ones.
        this.maskSourceCache.delete(Number(frameNumber));
        this.maskUndecodable.delete(Number(frameNumber));
        this.releaseMasksAt(Number(frameNumber));
        landed++;
      }

      mergeRange(this.fetchedRanges, result.range);

      if (landed > 0) {
        this.notifyEdits();
      }
    } catch (error) {
      // Surface but don't crash — the engine will keep asking; subsequent
      // prefetch calls will retry the missing frames.
      console.error(
        `[VideoFrameLabelsStream] fetch failed for [${startFrame}, ${endFrame}]`,
        error,
      );
    }
  }
}

/**
 * Pull detections off a per-frame sample and convert them into the
 * `SyntheticBox` shape the existing overlay-diff path consumes.
 *
 * Prefers FiftyOne's track `index` for stable cross-frame identity; falls
 * back to `_id` so un-tracked detections still render (with the caveat
 * that they will churn add/remove on every frame).
 */
function extractDetections(
  sample: FrameDoc,
  frameField: string,
): SyntheticBox[] {
  const raw = sample[frameField] as RawDetectionsField | undefined;
  const detections = raw?.detections;
  if (!Array.isArray(detections)) {
    return [];
  }

  const out: SyntheticBox[] = [];
  for (const det of detections) {
    if (!det.bounding_box || det.bounding_box.length !== 4) {
      continue;
    }

    const id = resolveSyntheticId(det);
    if (!id) {
      continue;
    }

    out.push({
      id,
      _id: det._id ?? det.id ?? undefined,
      label: det.label ?? "",
      bounding_box: det.bounding_box,
      index: det.index,
      instance: det.instance ?? undefined,
      keyframe: det.keyframe ?? false,
    });
  }

  return out;
}

/**
 * Derive a detection's cross-frame overlay id for the read-only snapshot.
 * Prefers `instance._id` so tracked instances keep one identity across frames;
 * falls back to `track-${index}` for legacy data carrying only a numeric index,
 * then to the per-frame `_id` for untracked, un-instanced detections. `null`
 * when the detection carries no usable identifier.
 *
 * Note: this is the snapshot's synthetic scheme; the engine addresses tracks by
 * the raw `instance._id` (see `trackIdentity`).
 */
export function resolveSyntheticId(det: RawDetection): string | null {
  if (det.instance?._id) {
    return `instance-${det.instance._id}`;
  }

  if (det.index !== undefined) {
    return `track-${det.index}`;
  }

  return det._id ?? det.id ?? null;
}
