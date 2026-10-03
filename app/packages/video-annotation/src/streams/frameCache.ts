/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The one memory budget for a video surface, counted in frames.
 *
 * A frame's cost is everything held to show it: its label documents, its
 * decoded video bitmap, and its decoded masks. Each holder is a {@link FramePart}
 * that reports what it holds per frame; when the total passes the budget, whole
 * frames are evicted — every part drops the frame together — farthest from the
 * playhead first. The playhead frame stays whole. A frame held by an operation
 * keeps its label documents, which the operation reads and writes, but its
 * decoded parts (bitmap, masks) can still go, least recently loaded first:
 * they are rebuilt on demand, and an operation spanning thousands of frames
 * would otherwise pin a bitmap for every one.
 *
 * Streams size their lookahead from {@link aheadFrames}, the frames that fit in
 * part of the budget at the observed cost of a full frame, so prefetched frames
 * are not evicted before the playhead reaches them.
 */

/** A holder of per-frame data. */
export interface FramePart {
  /** The frame is evicted: drop everything held for it. */
  evict(frame: number): void;
  /**
   * The frame is held but over budget: drop only what can be decoded again
   * from its documents or media. A part without this keeps held frames whole.
   */
  shed?(frame: number): void;
}

/** Loads frames into the parts, resolving once they are held. */
export type FrameLoader = (frames: readonly number[]) => Promise<void>;

export interface FrameCacheOptions {
  /** Frames in the clip. */
  frameCount: number;
  /** @default 1e9, or the `fo:frameCacheBytes` override */
  budgetBytes?: number;
}

/** 1 GB, matching looker's frame cache. */
export const DEFAULT_FRAME_CACHE_BYTES = 1e9;

/** Share of the budget lookahead may claim, leaving the rest for frames behind. */
const AHEAD_SHARE = 0.5;

/** A frame behind the playhead counts as this many frames ahead of it. */
const BEHIND_WEIGHT = 2;

/** localStorage key + Vite env var for the budget override. */
const BUDGET_LOCALSTORAGE_KEY = "fo:frameCacheBytes";

/**
 * Shrink the budget to exercise eviction on a dev machine:
 *
 *   localStorage.setItem("fo:frameCacheBytes", "50000000")  // then reload
 */
const readBudgetOverride = (): number | null => {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage?.getItem(BUDGET_LOCALSTORAGE_KEY);
      const parsed = stored === null ? Number.NaN : Number(stored);

      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    } catch {
      // localStorage can throw in locked-down contexts; fall through to env.
    }
  }

  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  const parsed = Number(env?.VITE_FRAME_CACHE_BYTES);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export class FrameCache {
  readonly budgetBytes: number;
  private readonly frameCount: number;
  private readonly parts = new Map<string, FramePart>();
  private readonly loaders = new Set<FrameLoader>();
  /** frame → part name → bytes */
  private readonly frames = new Map<number, Map<string, number>>();
  /** part name → bytes held across every frame, and frames holding any */
  private readonly partBytes = new Map<string, number>();
  private readonly partFrames = new Map<string, number>();
  private totalBytes = 0;
  private playhead = 1;
  /** frame → live holds */
  private readonly holds = new Map<number, number>();
  /** frame → when a part last reported it, for dropping decoded parts */
  private readonly lastSet = new Map<number, number>();
  private setCount = 0;

  constructor(options: FrameCacheOptions) {
    this.frameCount = options.frameCount;
    this.budgetBytes =
      options.budgetBytes ?? readBudgetOverride() ?? DEFAULT_FRAME_CACHE_BYTES;
  }

  /** Register a part under a unique name; returns the unregister. */
  register(name: string, part: FramePart): () => void {
    this.parts.set(name, part);

    return () => {
      if (this.parts.get(name) !== part) {
        return;
      }

      this.parts.delete(name);

      for (const frame of [...this.frames.keys()]) {
        this.forget(name, frame);
      }
    };
  }

  /** Register what {@link hold} calls to bring frames in; returns the unregister. */
  registerLoader(loader: FrameLoader): () => void {
    this.loaders.add(loader);

    return () => {
      this.loaders.delete(loader);
    };
  }

  /**
   * Record that `name` holds `bytes` for `frame`, replacing what it reported
   * before, then evict to fit.
   */
  set(name: string, frame: number, bytes: number): void {
    this.forget(name, frame);

    let entry = this.frames.get(frame);

    if (!entry) {
      entry = new Map();
      this.frames.set(frame, entry);
    }

    const size = Math.max(0, bytes);
    entry.set(name, size);
    this.lastSet.set(frame, ++this.setCount);
    this.totalBytes += size;
    this.partBytes.set(name, (this.partBytes.get(name) ?? 0) + size);
    this.partFrames.set(name, (this.partFrames.get(name) ?? 0) + 1);

    this.enforce();
  }

  /** `name` dropped `frame` itself; stop counting it. */
  delete(name: string, frame: number): void {
    this.forget(name, frame);
  }

  /** Whether any part holds `frame`. */
  has(frame: number): boolean {
    return this.frames.has(frame);
  }

  /** The frame on screen: never evicted, and the anchor eviction ranks from. */
  setPlayhead(frame: number): void {
    this.playhead = frame;
  }

  /**
   * Frames lookahead may cover: what fits in part of the budget at the observed
   * cost of a full frame. Unbounded until a cost is measured, so a stream's own
   * lookahead governs until then.
   */
  aheadFrames(): number {
    const cost = this.frameCost();

    if (cost <= 0) {
      return Number.POSITIVE_INFINITY;
    }

    return Math.max(1, Math.floor((this.budgetBytes * AHEAD_SHARE) / cost));
  }

  /**
   * Load `frames` and keep them until the returned release runs, so an
   * operation can read and write frames away from the playhead.
   */
  async hold(frames: readonly number[]): Promise<() => void> {
    const held = [...new Set(frames)].filter(
      (frame) => frame >= 1 && frame <= this.frameCount,
    );

    for (const frame of held) {
      this.holds.set(frame, (this.holds.get(frame) ?? 0) + 1);
    }

    let released = false;
    const release = () => {
      if (released) {
        return;
      }

      released = true;

      for (const frame of held) {
        const count = (this.holds.get(frame) ?? 1) - 1;

        if (count > 0) {
          this.holds.set(frame, count);
        } else {
          this.holds.delete(frame);
        }
      }

      this.enforce();
    };

    try {
      await Promise.all([...this.loaders].map((load) => load(held)));
    } catch (error) {
      release();
      throw error;
    }

    return release;
  }

  stats(): {
    frames: number;
    bytes: number;
    budgetBytes: number;
    held: number;
    aheadFrames: number;
  } {
    return {
      frames: this.frames.size,
      bytes: this.totalBytes,
      budgetBytes: this.budgetBytes,
      held: this.holds.size,
      aheadFrames: this.aheadFrames(),
    };
  }

  /** Evict every frame. */
  clear(): void {
    for (const frame of [...this.frames.keys()]) {
      this.evict(frame);
    }
  }

  /** Sum of each part's average bytes per frame it holds. */
  private frameCost(): number {
    let cost = 0;

    for (const [name, bytes] of this.partBytes) {
      const count = this.partFrames.get(name) ?? 0;

      if (count > 0) {
        cost += bytes / count;
      }
    }

    return cost;
  }

  private forget(name: string, frame: number): void {
    const entry = this.frames.get(frame);
    const bytes = entry?.get(name);

    if (entry === undefined || bytes === undefined) {
      return;
    }

    entry.delete(name);
    this.totalBytes -= bytes;
    this.partBytes.set(name, (this.partBytes.get(name) ?? 0) - bytes);
    this.partFrames.set(name, (this.partFrames.get(name) ?? 0) - 1);

    if (entry.size === 0) {
      this.frames.delete(frame);
      this.lastSet.delete(frame);
    }
  }

  private evictable(frame: number): boolean {
    return frame !== this.playhead && !this.holds.has(frame);
  }

  private distance(frame: number): number {
    return frame >= this.playhead
      ? frame - this.playhead
      : (this.playhead - frame) * BEHIND_WEIGHT;
  }

  private enforce(): void {
    if (this.totalBytes <= this.budgetBytes) {
      return;
    }

    const candidates = [...this.frames.keys()]
      .filter((frame) => this.evictable(frame))
      .sort((a, b) => this.distance(b) - this.distance(a));

    for (const frame of candidates) {
      if (this.totalBytes <= this.budgetBytes) {
        return;
      }

      this.evict(frame);
    }

    // still over: held frames give up what can be decoded again
    const held = [...this.frames.keys()]
      .filter((frame) => frame !== this.playhead && this.holds.has(frame))
      .sort((a, b) => (this.lastSet.get(a) ?? 0) - (this.lastSet.get(b) ?? 0));

    for (const frame of held) {
      if (this.totalBytes <= this.budgetBytes) {
        return;
      }

      this.evictDecoded(frame);
    }
  }

  private evictDecoded(frame: number): void {
    const entry = this.frames.get(frame);

    if (!entry) {
      return;
    }

    for (const name of [...entry.keys()]) {
      const part = this.parts.get(name);

      if (part?.shed) {
        this.forget(name, frame);
        part.shed(frame);
      }
    }
  }

  private evict(frame: number): void {
    const entry = this.frames.get(frame);

    if (!entry) {
      return;
    }

    for (const name of [...entry.keys()]) {
      this.forget(name, frame);
      this.parts.get(name)?.evict(frame);
    }
  }
}
