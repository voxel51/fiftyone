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
import {
  isInFetchedRange,
  mergeRange,
  removeFrame,
  toSecondRanges,
} from "./fetchedRanges";
import { FrameCache } from "./frameCache";
import { estimateFrameDocBytes } from "./frameDocBytes";

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
  /** Dynamic-group value; routes the window read to that group's ordered samples. */
  dynamicGroup?: string | null;
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
  /**
   * The surface's frame budget, shared with its bitmap stream. A stream given
   * none gets its own.
   */
  frameCache?: FrameCache;
}

const DEFAULT_CHUNK_SIZE = 60;
const DEFAULT_FRAME_FIELD = "detections";

/**
 * Notified when a window fetch lands, with the server-clamped frame range it
 * covered, so a subscriber can seed just that range.
 */
export type FrameLabelsEditListener = (range: [number, number]) => void;

/** Notified when the frame cache evicts a frame's documents. */
export type FrameLabelsEvictListener = (frame: number) => void;

/** The part of a decoded mask its cost is measured from. */
type DecodedMaskSize = { rawPixels: { width: number; height: number } };

/** {@link FrameCache} part names for label documents and decoded masks. */
const LABELS_PART = "labels";
const MASKS_PART = "masks";

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
/**
 * Chunks `prefetch` will start in one nudge.
 *
 * Enough to stay ahead of real-time playback across a network round-trip
 * (each chunk is `chunkSize` frames — 2s at 30fps — so this is several
 * seconds of headroom), while staying far below the browser's per-origin
 * connection limit so the <video> element's own range requests still get
 * through.
 */
const MAX_CHUNKS_IN_FLIGHT = 4;

/**
 * The slice of {@link MAX_CHUNKS_IN_FLIGHT} a {@link VideoFrameLabelsStream.load}
 * may hold: one below the cap, so the playhead's own `prefetch` always finds a
 * slot.
 */
const LOAD_MAX_CHUNKS_IN_FLIGHT = MAX_CHUNKS_IN_FLIGHT - 1;

/** Seconds of labels to keep fetched ahead of the playhead. */
const LABEL_LOOKAHEAD_SECONDS = 12;

const MASK_HOLD_AHEAD_FRAMES = 12;

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
  private readonly dynamicGroup: string | null;
  private readonly frameCount: number;
  private readonly frameRate: number;
  private frameField: string;
  /** All fields fetched per window + seeded into the engine (primary first). */
  private readonly frameFields: string[];
  private readonly chunkSize: number;

  private readonly cache = new Map<number, FrameDoc>();
  private readonly inflight = new Map<number, Promise<void>>();
  /**
   * Live chunk fetches, one entry per request — the unit
   * {@link MAX_CHUNKS_IN_FLIGHT} counts, shared by `prefetch` and `load`.
   */
  private readonly liveChunks = new Set<Promise<void>>();
  private readonly fetchedRanges: Array<[number, number]> = [];
  /**
   * Decides which frames stay: a frame's documents and decoded masks are
   * dropped together, with its video bitmap, when the budget evicts it.
   */
  private readonly frameCache: FrameCache;
  private readonly unregisterFromCache: Array<() => void>;
  /**
   * Frames whose masks are decoded AND borrowed, keyed to the sources borrowed
   * for them — see {@link holdMasks}. A borrow is what makes readiness mean
   * something: the mask cache can't close a mask the gate has promised. Held
   * until the frame is evicted, so a revisit doesn't re-decode.
   */
  private readonly maskHeld = new Map<number, MaskSource[]>();
  private disposed = false;
  /** Frames with a hold pass currently running. */
  private readonly maskWarmInFlight = new Set<number>();
  /**
   * Frames whose masks failed to decode. Reported ready so one broken mask can't
   * stall the clock forever — same escape hatch `frameBitmapStream` uses to play
   * through a frame whose bitmap will never arrive.
   */
  private readonly maskUndecodable = new Set<number>();
  /**
   * Memoized per-frame mask sources, invalidated when a frame's document is
   * replaced. The hold window re-checks the same frames on every commit.
   */
  private readonly maskSourceCache = new Map<number, MaskSource[]>();
  // Notified whenever a chunk lands. The annotation engine's frame store
  // re-seeds from `cachedFrames()` on this signal (via `subscribeToEdits`);
  // the stream itself holds no edit state — it is a read-only window seed
  // and the engine owns all label mutations.
  private readonly editListeners = new Set<FrameLabelsEditListener>();
  private readonly evictListeners = new Set<FrameLabelsEvictListener>();

  constructor(opts: VideoFrameLabelsStreamOptions) {
    super(opts.id, {
      blocking: true,
      duration: opts.frameCount / opts.frameRate,
      nativeStepSeconds: 1 / opts.frameRate,
      // The engine's 3s default is sized for a stream that is already local.
      // This one is a network fetch that has to stay ahead of a playhead
      // consuming a second of labels per second, and it BLOCKS the clock when
      // it falls behind — so the window has to be deep enough to absorb a
      // round-trip rather than merely to notice one.
      lookaheadSeconds: LABEL_LOOKAHEAD_SECONDS,
      lookupPolicy: {
        type: "nearestPrevious",
        thresholdSeconds: 1 / opts.frameRate,
      },
    });

    this.sampleId = opts.sampleId;
    this.dataset = opts.dataset;
    this.view = opts.view;
    this.dynamicGroup = opts.dynamicGroup ?? null;
    this.frameCount = opts.frameCount;
    this.frameRate = opts.frameRate;
    this.frameField = opts.frameField ?? DEFAULT_FRAME_FIELD;
    // Always fetch the primary field; union any extra active fields (deduped).
    this.frameFields =
      opts.frameFields && opts.frameFields.length > 0
        ? [...new Set([this.frameField, ...opts.frameFields])]
        : [this.frameField];
    this.chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
    this.frameCache =
      opts.frameCache ?? new FrameCache({ frameCount: opts.frameCount });

    this.unregisterFromCache = [
      this.frameCache.register(LABELS_PART, {
        evict: (frame) => this.evictFrame(frame),
      }),
      // re-decoded on the next visit, so a held frame can give these up
      this.frameCache.register(MASKS_PART, {
        evict: (frame) => this.evictFrame(frame),
        shed: (frame) => this.releaseMasksAt(frame),
      }),
      this.frameCache.registerLoader((frames) => this.load(frames)),
    ];
  }

  /**
   * Resolve once the frame containing `time` is cached, fetching its chunk if
   * needed. Call before `seek(time)` to show overlays before the user plays.
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
   * Resolve once every frame in `frames` is cached or known empty, fetching the
   * missing ones in chunks while holding at most
   * {@link LOAD_MAX_CHUNKS_IN_FLIGHT} requests, so a large load never crowds
   * out the playhead's window or the `<video>`'s own byte fetch. What lands is
   * subject to the frame budget; {@link FrameCache.hold} keeps it.
   */
  async load(frames: readonly number[]): Promise<void> {
    const pending: Promise<void>[] = [];

    for (const [start, length] of this.missingRuns(frames)) {
      for (let f = start; f < start + length; f++) {
        const inflight = this.inflight.get(f);

        if (inflight) {
          pending.push(inflight);
        }
      }

      let f = start;

      while (f < start + length) {
        await this.awaitChunkCapacity(LOAD_MAX_CHUNKS_IN_FLIGHT);

        if (this.disposed) {
          return;
        }

        // a prefetch may have claimed frames of this run while we waited
        if (this.hasSnapshotAt(f) || this.isInflight(f)) {
          f++;
          continue;
        }

        let numFrames = 1;
        while (
          numFrames < this.chunkSize &&
          f + numFrames < start + length &&
          !this.hasSnapshotAt(f + numFrames) &&
          !this.isInflight(f + numFrames)
        ) {
          numFrames++;
        }

        pending.push(this.fetchChunk(f, numFrames));
        f += numFrames;
      }
    }

    await Promise.all(pending);
  }

  /** Contiguous `[start, length]` runs of `frames` not cached or fetched. */
  private missingRuns(frames: readonly number[]): Array<[number, number]> {
    const sorted = [...new Set(frames)]
      .filter((f) => f >= 1 && f <= this.frameCount && !this.hasSnapshotAt(f))
      .sort((a, b) => a - b);
    const runs: Array<[number, number]> = [];

    for (const f of sorted) {
      const last = runs.at(-1);

      if (last && last[0] + last[1] === f) {
        last[1]++;
      } else {
        runs.push([f, 1]);
      }
    }

    return runs;
  }

  /** Resolve once fewer than `limit` chunk requests are live. */
  private async awaitChunkCapacity(limit: number): Promise<void> {
    while (this.liveChunks.size >= limit) {
      // `fetchChunk` never rejects (`doFetch` logs and swallows)
      await Promise.race([...this.liveChunks]);
    }
  }

  /** Total frames in the clip — useful for callers iterating the cache. */
  get totalFrames(): number {
    return this.frameCount;
  }

  /**
   * Every cached frame document, for seeding an external store (the annotation
   * engine's frame store). Pairs with {@link subscribeToEdits} so the seed
   * re-runs as chunks land, and {@link subscribeToEvictions} so it drops what
   * the budget evicts.
   */
  cachedFrames(): FrameDoc[] {
    return [...this.cache.values()];
  }

  /**
   * The cached documents within `[startFrame, endFrame]`, for seeding just the
   * range a fetch reported. Costs the window's size, not the clip's.
   */
  cachedFramesIn([startFrame, endFrame]: [number, number]): FrameDoc[] {
    const docs: FrameDoc[] = [];

    for (let f = Math.max(1, startFrame); f <= endFrame; f++) {
      const doc = this.cache.get(f);

      if (doc) {
        docs.push(doc);
      }
    }

    return docs;
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
   * Engine label path for the primary field: `frames.<field>` for a video, the
   * bare field for a dynamic group. Use this rather than a hardcoded `frames.`
   * prefix when addressing the engine.
   */
  get labelsPath(): string {
    return this.dynamicGroup !== null
      ? this.frameField
      : `frames.${this.frameField}`;
  }

  /**
   * Repoint the primary label field {@link getValue} extracts from, without a
   * refetch. Lets the active field follow a field-move without rebuilding the
   * stream and losing the frame store's edits.
   */
  setPrimaryField(field: string): void {
    this.frameField = field;
  }

  /**
   * The dataset query this stream reads against — the params the
   * `/video-labels/{index,window}` fetches share with the `/frames` seed.
   */
  labelQuery(): {
    sampleId: string;
    dataset: string;
    view: Stage[];
    dynamicGroup: string | null;
  } {
    return {
      sampleId: this.sampleId,
      dataset: this.dataset,
      view: this.view,
      dynamicGroup: this.dynamicGroup,
    };
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
   * Whether this frame's masks are currently borrowed, folded into
   * {@link bufferState} so the clock waits for drawable masks rather than for
   * label bytes. Borrowing, not a one-time decode pass, is the gate so that
   * evicted masks re-gate on every visit.
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
      const decoded = sources.map((source) => maskBitmapCache.acquire(source));
      const borrowed = sources.filter((_, i) => decoded[i] !== undefined);

      if (borrowed.length === sources.length) {
        this.holdDecoded(frame, borrowed, decoded);
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
      const decoded: Array<DecodedMaskSize | undefined> = [];
      let failed = false;

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          borrowed.push(sources[index]);
          decoded.push(result.value);
        } else {
          failed = true;
        }
      });

      // A frame evicted, or whose document was replaced, mid-decode must not
      // become held — its borrows would never be released, and holding the
      // old document's masks would report the frame ready while the new
      // document's are undecoded.
      if (!this.maskHoldWanted(frame, sources)) {
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

      this.holdDecoded(frame, borrowed, decoded);
    });
  }

  /** Record a frame's borrowed masks, and what decoding them costs the budget. */
  private holdDecoded(
    frame: number,
    borrowed: MaskSource[],
    decoded: ReadonlyArray<DecodedMaskSize | undefined>,
  ): void {
    this.maskHeld.set(frame, borrowed);

    let bytes = 0;
    for (const mask of decoded) {
      if (mask) {
        // decoded RGBA plus the single-channel hit-test copy
        bytes += mask.rawPixels.width * mask.rawPixels.height * 5;
      }
    }

    this.frameCache.set(MASKS_PART, frame, bytes);
  }

  /**
   * Whether `frame` still wants the hold pass it started: still cached, not
   * already held, and — because a document replaced mid-decode carries
   * different masks — still describing the same sources the pass decoded.
   */
  private maskHoldWanted(frame: number, startedFor: MaskSource[]): boolean {
    const current = this.maskSourcesAt(frame);

    if (
      current.length !== startedFor.length ||
      current.some((source, index) => source !== startedFor[index])
    ) {
      return false;
    }

    return !this.disposed && this.cache.has(frame) && !this.maskHeld.has(frame);
  }

  /**
   * Return every mask borrow this stream holds; an unreturned borrow pins its
   * mask cache entry for good. Marked disposed first so an in-flight warm pass
   * releases rather than re-holds.
   */
  dispose(): void {
    this.disposed = true;

    for (const unregister of this.unregisterFromCache) {
      unregister();
    }

    for (const frame of [...this.maskHeld.keys()]) {
      this.releaseMasksAt(frame);
    }
  }

  /** The budget dropped `frame`: release everything held for it. */
  private evictFrame(frame: number): void {
    if (!this.cache.has(frame) && !this.maskHeld.has(frame)) {
      return;
    }

    this.cache.delete(frame);
    this.maskSourceCache.delete(frame);
    this.maskUndecodable.delete(frame);
    this.releaseMasksAt(frame);
    removeFrame(this.fetchedRanges, frame);

    for (const listener of this.evictListeners) {
      listener(frame);
    }
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
    this.frameCache.delete(MASKS_PART, frame);
  }

  /**
   * Decode the masks just ahead of the committed frame. Forward only —
   * decoding frames the playhead has already passed buys nothing.
   */
  private holdWindow(time: number): void {
    const frame = this.timeToFrame(time);
    const end = Math.min(
      this.frameCount,
      frame + Math.min(MASK_HOLD_AHEAD_FRAMES, this.frameCache.aheadFrames()),
    );

    for (let f = frame; f <= end; f++) {
      this.holdMasks(f);
    }
  }

  prefetch(range: [number, number]): void {
    const [startSec, endSec] = range;
    const startFrame = this.timeToFrame(startSec);
    const endFrame = Math.min(
      this.timeToFrame(endSec),
      startFrame + this.frameCache.aheadFrames() - 1,
    );

    // Decode-ahead: frames whose documents are already cached still need their
    // masks rasterized before they can be drawn, and that is the stage the
    // playhead actually outruns. Holding across the window (rather than
    // first-missing-wins, as the chunk fetch below does) is what turns a cold
    // play-through into cache hits.
    if (MASK_GATE_ENABLED) {
      this.holdWindow(startSec);
    }

    // Cover the whole requested window rather than stopping at the first
    // missing chunk.
    //
    // One-chunk-per-nudge assumed the engine would call back as the playhead
    // advanced, which it does — but only while the stream reports NOT ready.
    // That makes the fetch reactive: it starts a chunk at the moment the
    // clock has already stalled on it, and since the stream is `blocking`,
    // every one of those is a visible hitch. A chunk is `chunkSize` frames
    // (2s at 30fps) and playback consumes a second of labels per second, so
    // one request deep leaves no room for a round-trip.
    //
    // Bounded by `MAX_CHUNKS_IN_FLIGHT`: dispatching every chunk at once
    // crowds the <video>'s own byte fetch off the connection pool. The point
    // here is to stay a few chunks ahead of the playhead, not to load the
    // clip, and the frame budget caps how far ahead that is.
    //
    // Counted against `liveChunks`, the cap `load` shares, so the two paths
    // together never exceed it.
    for (let f = startFrame; f <= endFrame; f += 1) {
      if (this.liveChunks.size >= MAX_CHUNKS_IN_FLIGHT) {
        return;
      }

      if (this.cache.has(f) || this.isInflight(f)) {
        continue;
      }

      void this.fetchChunk(f);

      // `fetchChunk` covers `chunkSize` frames from `f`, so the next missing
      // frame cannot be nearer than that — skip ahead instead of re-testing
      // every frame it just claimed.
      f += this.chunkSize - 1;
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

    this.frameCache.setPlayhead(frame);

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

  /** Subscribe to `/frames` cache mutations (chunks landing); returns an unsubscribe function. */
  subscribeToEdits(listener: FrameLabelsEditListener): () => void {
    this.editListeners.add(listener);
    return () => {
      this.editListeners.delete(listener);
    };
  }

  /** Subscribe to frames the budget evicts; returns an unsubscribe function. */
  subscribeToEvictions(listener: FrameLabelsEvictListener): () => void {
    this.evictListeners.add(listener);
    return () => {
      this.evictListeners.delete(listener);
    };
  }

  private notifyEdits(range: [number, number]): void {
    for (const listener of this.editListeners) {
      listener(range);
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

  private async fetchChunk(
    startFrame: number,
    length = this.chunkSize,
  ): Promise<void> {
    const numFrames = Math.min(length, this.frameCount - startFrame + 1);

    if (numFrames <= 0) {
      return;
    }

    const promise: Promise<void> = this.doFetch(startFrame, numFrames).finally(
      () => {
        for (let f = startFrame; f < startFrame + numFrames; f++) {
          if (this.inflight.get(f) === promise) {
            this.inflight.delete(f);
          }
        }

        this.liveChunks.delete(promise);
      },
    );

    this.liveChunks.add(promise);

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
        dynamicGroup: this.dynamicGroup ?? undefined,
        fields: this.frameFields,
        startFrame,
        endFrame,
      });

      if (this.disposed) {
        return;
      }

      const landed: Array<[number, FrameDoc]> = [];

      for (const [frameNumber, fields] of Object.entries(result.frames)) {
        const frame = Number(frameNumber);
        // Field-projected window payload → the cache's per-frame doc shape.
        // The engine owns edits, so the stream never reconciles against it.
        const doc: FrameDoc = { frame_number: frame, ...fields };
        this.cache.set(frame, doc);
        // A replaced document may carry different masks, so drop the memoized
        // sources and any hold taken against the old ones.
        this.maskSourceCache.delete(frame);
        this.maskUndecodable.delete(frame);
        this.releaseMasksAt(frame);
        landed.push([frame, doc]);
      }

      mergeRange(this.fetchedRanges, result.range);

      // Counted after the whole window is cached, so the budget never evicts
      // part of a window before it is seeded.
      for (const [frame, doc] of landed) {
        if (this.cache.get(frame) === doc) {
          this.frameCache.set(LABELS_PART, frame, estimateFrameDocBytes(doc));
        }
      }

      // Also when nothing landed: a window with no frame documents is still an
      // answer, and the first landing is what settles a store born loading
      this.notifyEdits(result.range);
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
      rotation: typeof det.rotation === "number" ? det.rotation : undefined,
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
