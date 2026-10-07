import {
  NANOSECONDS_PER_SECOND,
  SCENE_SOURCE_METADATA,
  STREAM_SYNC_MODE,
  type DecodedFrame,
  type DecodedOutput,
  type EpisodeManifest,
  type ResolvedStreamSyncPolicy,
  type SceneSourceType,
  type StreamDescriptor,
  type StreamKind,
  type SynchronizedFrameWindow,
} from "../../ir";
import {
  EpisodeReadCancelledError,
  type EpisodeSession,
  type FrameBatch,
  type PlaybackReadCapability,
  type ReadRequest,
  type SourceStats,
  type SynchronizedPlaybackBatchReadRequest,
  type SynchronizedPlaybackReadRequest,
} from "../../ports";
import { resolvePlaybackWindow } from "../../ports/playback-policy";
import { throwIfAborted } from "../../utils/cancellation";

// Presentation keys read by `views/episode/playback/timeline-mode.ts`. They
// carry an MCAP prefix today because that is where the convention started;
// the view only looks at the key, not at where the stream came from.
const TIMELINE_MODE_METADATA_KEY = "mcap.channel_metadata.timeline_mode";
const TIMELINE_FPS_METADATA_KEY = "mcap.channel_metadata.timeline_fps";

/** One stream of an indexed sequence: one value per element, or a gap. */
export interface IndexedSequenceStream {
  readonly id: string;
  readonly kind: StreamKind;
  readonly sceneSourceType: SceneSourceType;
  readonly sourceName: string;
}

/**
 * Decoded values for one contiguous run of elements. Entry `i` holds the
 * element at `startIndex + i`, keyed by stream id; a stream absent from an
 * entry has no value for that element.
 */
export type IndexedSequencePage = readonly ReadonlyMap<string, DecodedOutput>[];

/** Inputs for a session over an ordered list of elements. */
export interface IndexedSequenceSessionOptions {
  readonly episodeId: string;
  /** Number of elements; element `i` is presented at `i / fps` seconds. */
  readonly elementCount: number;
  readonly fps: number;
  readonly loadPage: (
    startIndex: number,
    count: number,
    signal: AbortSignal,
  ) => Promise<IndexedSequencePage>;
  /**
   * Bytes of loaded pages kept at once, from each output's
   * `resourceHints.sizeBytes`. Least recently read pages are dropped first
   * and refetched when needed again. Large images reach this long before
   * `maxResidentPages`.
   */
  readonly maxResidentBytes?: number;
  /** Pages kept at once, whatever their size. */
  readonly maxResidentPages?: number;
  readonly pageSize?: number;
  readonly streams: readonly IndexedSequenceStream[];
}

const DEFAULT_PAGE_SIZE = 30;
const DEFAULT_MAX_RESIDENT_PAGES = 12;
const DEFAULT_MAX_RESIDENT_BYTES = 192 * 1024 * 1024;
/** Pages this close to the playhead's page are never evicted. */
const PROTECTED_PAGE_DISTANCE = 1;
/** Pages behind the playhead count as this much farther away when evicting. */
const BEHIND_PENALTY = 2;

interface ResidentPage {
  readonly abort: AbortController;
  readonly promise: Promise<readonly (readonly DecodedFrame[])[]>;
  bytes: number;
  frames: readonly (readonly DecodedFrame[])[] | null;
}

/**
 * An episode session over a list of elements with no clock of their own:
 * element `i` sits at exactly `i` frame steps, every stream has at most one
 * value per element, and elements are fetched a page at a time on demand.
 *
 * Because positions are exact, a synchronized read is an index lookup: the
 * session answers `readSynchronized` itself instead of letting the runtime
 * emulate it over `read()`, which would scan from the first element for every
 * "latest value" lookup.
 */
export function createIndexedSequenceSession(
  options: IndexedSequenceSessionOptions,
): EpisodeSession {
  return new IndexedSequenceSession(options);
}

class IndexedSequenceSession implements EpisodeSession {
  readonly manifest: EpisodeManifest;
  readonly playback: PlaybackReadCapability;

  private readonly elementCount: number;
  private readonly maxResidentBytes: number;
  private readonly maxResidentPages: number;
  private readonly pageSize: number;
  private readonly pages = new Map<number, ResidentPage>();
  private readonly sourceNames: ReadonlyMap<string, string>;
  private readonly stepNs: bigint;
  private readonly streamIds: ReadonlySet<string>;
  private readonly streamsById: ReadonlyMap<string, StreamDescriptor>;
  private disposed = false;
  private residentBytes = 0;
  /** Page under the most recent single-time (current-tick) read. */
  private playheadPage = 0;
  private decodedFrames = 0;
  private readRequests = 0;
  private returnedBatches = 0;

  constructor(private readonly options: IndexedSequenceSessionOptions) {
    this.elementCount = Math.max(0, Math.trunc(options.elementCount));
    this.pageSize = Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE);
    this.maxResidentPages = Math.max(
      2 * PROTECTED_PAGE_DISTANCE + 1,
      options.maxResidentPages ?? DEFAULT_MAX_RESIDENT_PAGES,
    );
    this.maxResidentBytes =
      options.maxResidentBytes ?? DEFAULT_MAX_RESIDENT_BYTES;
    const fps = options.fps > 0 ? options.fps : 1;
    this.stepNs = BigInt(Math.round(Number(NANOSECONDS_PER_SECOND) / fps));
    const timeRange = {
      startNs: 0n,
      endNs: BigInt(Math.max(0, this.elementCount - 1)) * this.stepNs,
    };
    const streams: StreamDescriptor[] = options.streams.map((stream) => ({
      approxRateHz: fps,
      count: this.elementCount,
      id: stream.id,
      kind: stream.kind,
      metadata: {
        [SCENE_SOURCE_METADATA.SOURCE_NAME]: stream.sourceName,
        [SCENE_SOURCE_METADATA.TYPE]: stream.sceneSourceType,
        [TIMELINE_MODE_METADATA_KEY]: "sequence",
        [TIMELINE_FPS_METADATA_KEY]: String(fps),
      },
      payload: { encoding: "indexed-sequence" },
      sourceName: stream.sourceName,
      timeRange,
    }));
    this.manifest = {
      episodeId: options.episodeId,
      streams,
      timeDomain: { id: "sequence", kind: "sequence", originNs: 0n },
      timeRange,
    };
    this.streamsById = new Map(streams.map((stream) => [stream.id, stream]));
    this.streamIds = new Set(this.streamsById.keys());
    this.sourceNames = new Map(
      streams.map((stream) => [stream.id, stream.sourceName]),
    );
    this.playback = {
      timeline: {
        endNs: timeRange.endNs,
        startNs: timeRange.startNs,
        timeDomainId: "sequence",
      },
      readStreamTimeBounds: async (ids) =>
        ids.map((streamId) => ({
          firstTimestampNs: this.streamsById.has(streamId)
            ? timeRange.startNs
            : null,
          lastTimestampNs: this.streamsById.has(streamId)
            ? timeRange.endNs
            : null,
          streamId,
        })),
      readSynchronized: (request) => this.readSynchronized(request),
      readSynchronizedBatch: (request, readOptions) =>
        this.readSynchronizedBatch(request, readOptions?.signal),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const page of this.pages.values()) page.abort.abort();
    this.pages.clear();
    this.residentBytes = 0;
  }

  cancelRunway(): void {
    // Pages still loading for a region the playhead left are wasted work.
    for (const [index, page] of this.pages) {
      if (page.frames === null) this.drop(index);
    }
  }

  async *read(request: ReadRequest): AsyncIterable<FrameBatch> {
    this.ensureOpen();
    throwIfAborted(request.signal);
    this.readRequests += 1;
    const first = this.indexAtOrAfter(request.window.startNs);
    const last = this.indexAtOrBefore(request.window.endNs);
    const streams = request.streams.filter((id) => this.streamIds.has(id));
    const limit = request.limit ?? Number.POSITIVE_INFINITY;
    const remaining = new Map(streams.map((id) => [id, limit]));

    for (
      let pageIndex = this.pageOf(first);
      first <= last && pageIndex <= this.pageOf(last);
      pageIndex += 1
    ) {
      if (![...remaining.values()].some((left) => left > 0)) return;
      const page = await this.loadPage(pageIndex);
      throwIfAborted(request.signal);
      this.ensureOpen();
      const pageStart = pageIndex * this.pageSize;
      for (const stream of streams) {
        const left = remaining.get(stream) ?? 0;
        if (left <= 0) continue;
        const frames: DecodedFrame[] = [];
        for (let offset = 0; offset < page.length; offset += 1) {
          const index = pageStart + offset;
          if (index < first || index > last) continue;
          const frame = page[offset]?.find(
            (candidate) => candidate.streamId === stream,
          );
          if (frame) frames.push(frame);
          if (frames.length >= left) break;
        }
        if (frames.length === 0) continue;
        remaining.set(stream, left - frames.length);
        this.decodedFrames += frames.length;
        this.returnedBatches += 1;
        yield { frames, stream };
      }
    }
  }

  stats(): SourceStats {
    return {
      capturedAtMs: Date.now(),
      decodedFrames: this.decodedFrames,
      readRequests: this.readRequests,
      returnedBatches: this.returnedBatches,
    };
  }

  private async readSynchronized(
    request: SynchronizedPlaybackReadRequest,
  ): Promise<SynchronizedFrameWindow> {
    const [window] = await this.readSynchronizedBatch(
      { ...request, timeNs: [request.timeNs] },
      request.signal,
    );
    if (request.onStreamSettlement || request.onStreamSettlements) {
      const settlements = request.streams.map((stream) => ({
        stream,
        window: {
          ...window,
          frames: window.framesByStream[stream] ?? [],
          framesByStream: { [stream]: window.framesByStream[stream] ?? [] },
        },
      }));
      request.onStreamSettlements?.(settlements);
      for (const settlement of settlements) {
        request.onStreamSettlement?.(settlement);
      }
    }
    return window;
  }

  private async readSynchronizedBatch(
    request: SynchronizedPlaybackBatchReadRequest,
    signal?: AbortSignal,
  ): Promise<readonly SynchronizedFrameWindow[]> {
    this.ensureOpen();
    throwIfAborted(signal);
    this.readRequests += 1;
    const streams = request.streams.filter((id) => this.streamIds.has(id));
    // A single-time read is the current tick; multi-time reads are runway.
    if (request.timeNs.length === 1 && this.elementCount > 0) {
      this.playheadPage = this.pageOf(this.indexAtOrBefore(request.timeNs[0]));
    }
    return Promise.all(
      request.timeNs.map(async (timeNs) => {
        const resolved = resolvePlaybackWindow(
          this.manifest.timeRange.startNs,
          this.streamsById,
          { ...request, streams, timeNs },
        );
        const framesByStream: Record<string, readonly DecodedFrame[]> = {};
        const frames: DecodedFrame[] = [];
        for (const stream of streams) {
          const selected = await this.selectFrames(
            timeNs,
            resolved.streamPolicies[stream],
            stream,
          );
          throwIfAborted(signal);
          framesByStream[stream] = selected;
          frames.push(...selected);
        }
        frames.sort(
          (left, right) =>
            (left.timestampNs < right.timestampNs
              ? -1
              : left.timestampNs > right.timestampNs
                ? 1
                : 0) ||
            (this.sourceNames.get(left.streamId) ?? "").localeCompare(
              this.sourceNames.get(right.streamId) ?? "",
            ),
        );
        return {
          endNs: resolved.endNs,
          frames,
          framesByStream,
          startNs: resolved.startNs,
          streamPolicies: resolved.streamPolicies,
          timeNs,
        };
      }),
    );
  }

  /**
   * Frames a policy selects at `timeNs`. "Latest" looks only at the element
   * under the playhead: a slice with no sample there shows nothing rather
   * than an older element's media as if it were current.
   */
  private async selectFrames(
    timeNs: bigint,
    policy: ResolvedStreamSyncPolicy,
    stream: string,
  ): Promise<readonly DecodedFrame[]> {
    if (this.elementCount === 0) return [];
    const under = this.indexAtOrBefore(timeNs);
    let first = under;
    let last = under;
    if (policy.mode === STREAM_SYNC_MODE.NEAREST) {
      first = this.indexAtOrAfter(policy.startNs ?? timeNs);
      last = this.indexAtOrBefore(policy.endNs);
    } else if (policy.mode === STREAM_SYNC_MODE.STRICT) {
      if (BigInt(under) * this.stepNs !== timeNs) return [];
    }
    if (first > last) return [];

    const candidates: DecodedFrame[] = [];
    for (let index = first; index <= last; index += 1) {
      const page = await this.loadPage(this.pageOf(index));
      const frame = page[index - this.pageOf(index) * this.pageSize]?.find(
        (candidate) => candidate.streamId === stream,
      );
      if (frame) candidates.push(frame);
    }
    if (policy.mode === STREAM_SYNC_MODE.NEAREST) {
      candidates.sort((left, right) => {
        const leftDistance = absBigInt(left.timestampNs - timeNs);
        const rightDistance = absBigInt(right.timestampNs - timeNs);
        return leftDistance < rightDistance
          ? -1
          : leftDistance > rightDistance
            ? 1
            : 0;
      });
    }
    return candidates.slice(0, policy.limit);
  }

  private loadPage(
    pageIndex: number,
  ): Promise<readonly (readonly DecodedFrame[])[]> {
    this.ensureOpen();
    const resident = this.pages.get(pageIndex);
    if (resident) {
      return resident.promise;
    }

    const startIndex = pageIndex * this.pageSize;
    const count = Math.min(this.pageSize, this.elementCount - startIndex);
    const abort = new AbortController();
    const entry: ResidentPage = {
      abort,
      bytes: 0,
      frames: null,
      promise: this.options
        .loadPage(startIndex, Math.max(0, count), abort.signal)
        .then((page) => {
          const frames = page.map((values, offset) =>
            this.framesForElement(startIndex + offset, values),
          );
          entry.frames = frames;
          if (this.pages.get(pageIndex) === entry) {
            entry.bytes = frames.reduce(
              (total, element) =>
                total +
                element.reduce(
                  (sum, frame) =>
                    sum + (frame.output.resourceHints?.sizeBytes ?? 0),
                  0,
                ),
              0,
            );
            this.residentBytes += entry.bytes;
            this.evict();
          }
          return frames;
        }),
    };
    // A failed page is forgotten so the next read retries it.
    entry.promise.catch(() => {
      if (this.pages.get(pageIndex) === entry) this.drop(pageIndex);
    });
    this.pages.set(pageIndex, entry);
    this.evict();
    return entry.promise;
  }

  private framesForElement(
    index: number,
    values: ReadonlyMap<string, DecodedOutput>,
  ): readonly DecodedFrame[] {
    const timestampNs = BigInt(index) * this.stepNs;
    const frames: DecodedFrame[] = [];
    for (const [streamId, output] of values) {
      if (!this.streamIds.has(streamId)) continue;
      frames.push({ output, sequence: index, streamId, timestampNs });
    }
    return frames;
  }

  /**
   * Drops the pages farthest from the playhead until both budgets hold.
   * Pages next to the playhead are kept, so lookahead can never evict the
   * page being shown; a far-ahead page that does not fit is dropped again
   * and refetched once the playhead gets near it.
   */
  private evict(): void {
    while (
      this.pages.size > this.maxResidentPages ||
      this.residentBytes > this.maxResidentBytes
    ) {
      let farthest: number | null = null;
      let farthestDistance = PROTECTED_PAGE_DISTANCE;
      for (const [pageIndex, page] of this.pages) {
        // A page still loading is someone's pending read; let it land.
        if (page.frames === null) continue;
        const offset = pageIndex - this.playheadPage;
        const distance = offset < 0 ? -offset * BEHIND_PENALTY : offset;
        if (distance > farthestDistance) {
          farthest = pageIndex;
          farthestDistance = distance;
        }
      }
      if (farthest === null) return;
      this.drop(farthest);
    }
  }

  private drop(pageIndex: number): void {
    const page = this.pages.get(pageIndex);
    if (!page) return;
    this.pages.delete(pageIndex);
    this.residentBytes -= page.bytes;
    if (page.frames === null) page.abort.abort();
  }

  private pageOf(index: number): number {
    return Math.floor(index / this.pageSize);
  }

  private indexAtOrBefore(timeNs: bigint): number {
    if (timeNs <= 0n) return 0;
    const index = Number(timeNs / this.stepNs);
    return Math.min(this.elementCount - 1, index);
  }

  private indexAtOrAfter(timeNs: bigint): number {
    if (timeNs <= 0n) return 0;
    const index = Number((timeNs + this.stepNs - 1n) / this.stepNs);
    return Math.min(this.elementCount - 1, index);
  }

  private ensureOpen(): void {
    if (this.disposed) throw new EpisodeReadCancelledError();
  }
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}
