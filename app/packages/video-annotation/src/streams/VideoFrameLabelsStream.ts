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

/**
 * Notified when a window fetch lands, with the server-clamped frame range it
 * covered. The range is what lets a subscriber seed incrementally instead of
 * re-reading the whole cache on every chunk.
 */
export type FrameLabelsEditListener = (range: [number, number]) => void;

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
 * Chunk requests this stream will keep in flight at once, across EVERY path
 * that fetches — `prefetch`'s windowed nudge and `warmupAll`'s whole-clip
 * seed share this one budget.
 *
 * Enough to stay ahead of real-time playback across a network round-trip
 * (each chunk is `chunkSize` frames — 2s at 30fps — so this is several
 * seconds of headroom), while staying below the browser's per-origin
 * connection limit so the <video> element's own range requests still get
 * through.
 *
 * Shared rather than per-path on purpose: two independent caps of four are a
 * cap of eight, which is the whole per-origin pool on HTTP/1.1 and leaves the
 * video nothing. `prefetch` dispatches synchronously and `warmupAll` awaits
 * capacity, so when they contend the playhead's window wins — which is the
 * priority we want.
 */
const MAX_CHUNKS_IN_FLIGHT = 4;

/**
 * The slice of {@link MAX_CHUNKS_IN_FLIGHT} a whole-clip `warmupAll` may hold.
 *
 * One below the cap, so there is always a slot the playhead's own window can
 * take without waiting for a background request to land. Without the reserve,
 * warmup can legally hold all four and `prefetch` — which never blocks — finds
 * the budget full and issues nothing, stalling a `blocking` stream on labels
 * while the seed fetches frames minutes away from where the user is looking.
 *
 * The seed is background work by definition; the clock is not.
 */
const WARMUP_MAX_CHUNKS_IN_FLIGHT = MAX_CHUNKS_IN_FLIGHT - 1;

/** Seconds of labels to keep fetched ahead of the playhead. */
const LABEL_LOOKAHEAD_SECONDS = 12;

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
  /**
   * Live chunk fetches, one entry per request rather than per frame — the
   * unit {@link MAX_CHUNKS_IN_FLIGHT} is counted in. `inflight` is keyed by
   * frame and so holds `chunkSize` entries for the same request, which is the
   * wrong thing to measure a connection budget with.
   */
  private readonly liveChunks = new Set<Promise<void>>();
  /** Set when the surface tears down, to stop an in-progress `warmupAll`. */
  private warmupCancelled = false;
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
  private readonly editListeners = new Set<FrameLabelsEditListener>();

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
   * Resolve once every frame in [1, frameCount] is cached. Coalesces against
   * any in-flight chunks; otherwise walks the range in chunk-sized strides,
   * keeping at most {@link MAX_CHUNKS_IN_FLIGHT} requests outstanding.
   *
   * The pacing is the point. This used to dispatch every chunk in the clip at
   * once: a ten-minute 30fps clip is 300 simultaneous POSTs to the same origin
   * the `<video>` element is pulling its bytes from, so the video's own range
   * requests queued behind them and the picture buffered slowly. The total
   * bytes are unchanged — this is still a whole-clip read — but they now
   * arrive over a handful of connections instead of seizing the pool.
   *
   * Still expensive over long clips by construction; used for one-shot
   * full-clip analyses and for the engine consumers that walk every frame
   * (propagation, interpolation, track ops). A read-only surface should not
   * call it at all — see `seedWholeClip`.
   */
  async warmupAll(): Promise<void> {
    this.warmupCancelled = false;

    const coalesced: Promise<void>[] = [];
    let f = 1;

    while (f <= this.frameCount) {
      if (this.warmupCancelled) {
        return;
      }

      if (this.cache.has(f)) {
        f++;
        continue;
      }

      const inflight = this.inflight.get(f);
      if (inflight) {
        coalesced.push(inflight);
        f += this.chunkSize;
        continue;
      }

      // Yield until the shared budget has room. `prefetch` dispatches
      // synchronously and never awaits, so it takes capacity ahead of this
      // loop whenever the playhead needs a window — deliberate: a stalled
      // clock is visible and a slower background seed is not.
      await this.awaitChunkCapacity(WARMUP_MAX_CHUNKS_IN_FLIGHT);

      // Re-test after the await: a prefetch may have claimed this frame, or
      // the surface may have torn down, while we waited.
      if (this.warmupCancelled) {
        return;
      }

      if (this.cache.has(f) || this.isInflight(f)) {
        continue;
      }

      coalesced.push(this.fetchChunk(f));
      f += this.chunkSize;
    }

    await Promise.all(coalesced);
  }

  /**
   * Abandon an in-progress {@link warmupAll}.
   *
   * Unbounded warmup was self-limiting — it had issued everything before a
   * modal could close. A paced one outlives the surface that asked for it, so
   * the teardown has to say stop, or closing a long video keeps fetching its
   * labels into a store nothing reads. Requests already in flight are left to
   * settle into the cache; only the dispatch loop stops.
   */
  cancelWarmup(): void {
    this.warmupCancelled = true;
  }

  /**
   * Resolve once the shared chunk budget is below `limit`, leaving room for
   * another request. Callers pass their own ceiling so background work can
   * hold less of the budget than the playhead is allowed to.
   */
  private async awaitChunkCapacity(limit: number): Promise<void> {
    while (this.liveChunks.size >= limit) {
      // `fetchChunk` never rejects (`doFetch` swallows and logs), so racing
      // the live set cannot throw here.
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
   * re-runs as chunks land.
   */
  cachedFrames(): FrameDoc[] {
    return [...this.cache.values()];
  }

  /**
   * The cached documents within `[startFrame, endFrame]` — the incremental
   * counterpart to {@link cachedFrames}, for seeding just the range a fetch
   * reported. Walks the range rather than the cache, so its cost is the
   * window's size and not the clip's.
   *
   * Frames in the range with no cached document are simply absent; the seed
   * writes the whole range, so a frame that genuinely has no labels still
   * reads as empty downstream.
   */
  cachedFramesIn(range: [number, number]): FrameDoc[] {
    const [startFrame, endFrame] = range;
    const frames: FrameDoc[] = [];

    for (let f = Math.max(1, startFrame); f <= endFrame; f++) {
      const doc = this.cache.get(f);

      if (doc) {
        frames.push(doc);
      }
    }

    return frames;
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
      // mid-decode, must not become held — its borrows would never be released,
      // and holding the old document's masks would report the frame ready
      // while the new document's are undecoded.
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

      this.maskHeld.set(frame, borrowed);
    });
  }

  /**
   * Whether `frame` still wants the hold pass it started: inside the window,
   * not already held, and — because a document replaced mid-decode carries
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
    // Bounded by `MAX_CHUNKS_IN_FLIGHT` rather than unbounded, which is what
    // made `warmupAll` pathological: it dispatched every chunk in the clip at
    // once and crowded the <video>'s own byte fetch off the connection pool.
    // The point here is to stay a few chunks ahead of the playhead, not to
    // load the clip.
    //
    // Counted against `liveChunks` — the budget the whole stream shares —
    // rather than against requests issued by THIS call. A local count would
    // let a nudge add four on top of whatever `warmupAll` already had open,
    // which is the pool exhaustion this cap exists to prevent.
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
  subscribeToEdits(listener: FrameLabelsEditListener): () => void {
    this.editListeners.add(listener);
    return () => {
      this.editListeners.delete(listener);
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

  private async fetchChunk(startFrame: number): Promise<void> {
    const numFrames = Math.min(
      this.chunkSize,
      this.frameCount - startFrame + 1,
    );

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

    // One entry per REQUEST — this is what the shared budget counts.
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
        // The SERVER-clamped range, not the frames we happened to write: a
        // frame inside it with no labels is absent from the payload but is
        // still news, and the seed has to see it as honestly empty rather
        // than as not-yet-fetched.
        this.notifyEdits(result.range);
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
