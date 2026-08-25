import { parquetReadObjects, type AsyncBuffer } from "hyparquet";
import {
  createFile,
  MP4BoxBuffer,
  type ISOFile,
  type Sample,
  type Track,
} from "mp4box";

import {
  SCENE_SOURCE_METADATA,
  SCENE_SOURCE_TYPE,
  STREAM_KIND,
  STREAM_METADATA,
  VISUALIZATION_KIND,
  type DecodedFrame,
  type DecodedOutput,
  type EncodedVideoVisualization,
  type EpisodeManifest,
  type EpisodePosterFrame,
  type EpisodePreviewReadResult,
  type RawObjectNode,
  type RawRecordIndexWindow,
  type RawRecordPruneBudgets,
  type RawRecordResult,
  type RawValueNode,
  type StreamDescriptor,
  type SynchronizedFrameWindow,
  type TimeWindow,
} from "../../ir";
import {
  EpisodeReadCancelledError,
  type AssetDescriptor,
  type ByteResources,
  type EpisodeOpenOptions,
  type EpisodePreviewReadOptions,
  type EpisodePreviewReadRequest,
  type EpisodePreviewSession,
  type EpisodeSession,
  type EpisodeSource,
  type FormatAdapter,
  type FrameBatch,
  type NumericSeriesCapability,
  type PlaybackReadCapability,
  type RawRecordCapability,
  type ReadRequest,
  type SynchronizedPlaybackBatchReadRequest,
  type SynchronizedPlaybackReadOptions,
  type SynchronizedPlaybackReadRequest,
  type SourceStats,
} from "../../ports";
import {
  emptyPlaybackWindow,
  prioritizedStreams,
  resolvePlaybackWindow,
  selectPlaybackWindow,
  streamTimeBoundsFromManifest,
  type ResolvedPlaybackWindow,
} from "../../ports/playback-policy";
import { throwIfAborted } from "../../utils/cancellation";
import {
  maxBigInt as maxOfBigInts,
  minBigInt as minOfBigInts,
} from "../../utils/bigint";
import { nsDeltaToSeconds } from "../../utils/nanoseconds";

const INFO_ROLE = "dataset-info";
const EPISODE_METADATA_ROLE = "episode-metadata";
const DATA_ROLE = "tabular-frame-data";
const IMAGE_ROLE = "image-payload";
const VIDEO_ROLE = "video-stream";
const RAW_STREAM_ID = "lerobot:rows";
const NS_PER_SECOND = 1_000_000_000;
const MP4_INDEX_CHUNK_BYTES = 1024 * 1024;
const MAX_VIDEO_SPAN_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_VIDEO_SPAN_CACHE_ENTRIES = 16;

interface ParquetReaderOptions {
  readonly columns?: string[];
  readonly file: AsyncBuffer;
  readonly rowEnd?: number;
  readonly rowStart?: number;
}

type ParquetReader = (
  options: ParquetReaderOptions,
) => Promise<Record<string, unknown>[]>;

/** Test seams for the browser-native LeRobot readers. */
export interface CreateLeRobotFormatAdapterOptions {
  readonly readParquetObjects?: ParquetReader;
}

interface LeRobotFeature {
  readonly dtype: string;
  readonly info?: Readonly<Record<string, unknown>>;
  readonly names?: readonly string[] | null;
  readonly shape?: readonly number[];
}

interface LeRobotInfo {
  readonly codebase_version?: string;
  readonly features: Readonly<Record<string, LeRobotFeature>>;
  readonly fps: number;
  readonly robot_type?: string;
}

interface TimelineRow {
  readonly frameIndex: number;
  readonly localTimeNs: bigint;
  readonly rowOffset: number;
  readonly sourceTimeSeconds: number;
}

interface EpisodeRows {
  readonly dataAsset: AssetDescriptor;
  readonly episode: Record<string, unknown>;
  readonly originSeconds: number;
  readonly rows: readonly TimelineRow[];
}

interface VideoBinding {
  readonly asset: AssetDescriptor;
  readonly feature: LeRobotFeature;
  readonly fromSeconds: number;
  readonly streamId: string;
  readonly toSeconds: number;
}

interface ImageBinding {
  readonly asset: AssetDescriptor;
  readonly feature: LeRobotFeature;
  readonly streamId: string;
}

interface VideoIndex {
  readonly compositionOffsetSeconds: number;
  readonly file: ISOFile;
  readonly presentationSamples: readonly IndexedVideoSample[];
  readonly samples: readonly Sample[];
  readonly track: Track;
}

interface IndexedVideoSample {
  readonly decodeIndex: number;
  readonly presentationSeconds: number;
  readonly sample: Sample;
}

interface CachedVideoSpan {
  readonly bytes: Uint8Array;
  readonly end: number;
}

interface VideoSpanCacheEntry {
  bytes: number;
  readonly promise: Promise<CachedVideoSpan>;
  span: CachedVideoSpan | null;
}

interface AvcConfiguration {
  readonly lengthSizeMinusOne?: number;
  readonly PPS?: readonly { readonly data?: ArrayLike<number> }[];
  readonly SPS?: readonly { readonly data?: ArrayLike<number> }[];
}

interface Mp4SampleDescription {
  readonly avcC?: AvcConfiguration;
}

/** Creates the Parquet + range-addressed MP4 LeRobot v3 episode adapter. */
export function createLeRobotFormatAdapter(
  options: CreateLeRobotFormatAdapterOptions = {},
): FormatAdapter {
  const readObjects = options.readParquetObjects ?? parquetReadObjects;
  const open = async (
    source: EpisodeSource,
    io: ByteResources,
    openOptions?: EpisodeOpenOptions,
  ) => {
    throwIfAborted(openOptions?.signal);
    const assets = await source.assets.list(openOptions);
    const infoAsset = requireSingleRole(assets, INFO_ROLE);
    const episodeAsset = requireSingleRole(assets, EPISODE_METADATA_ROLE);
    const dataAsset = requireSingleRole(assets, DATA_ROLE);
    const [info, episodeRows] = await Promise.all([
      readInfo(source, io, infoAsset, openOptions?.signal),
      readSelectedParquetRows(
        source,
        io,
        episodeAsset,
        readObjects,
        undefined,
        openOptions?.signal,
      ),
    ]);
    if (episodeRows.length !== 1) {
      throw new Error(
        "LeRobot episode metadata selector must resolve exactly one row",
      );
    }
    const episode = await readEpisodeRows(
      source,
      io,
      dataAsset,
      episodeRows[0],
      readObjects,
      openOptions?.signal,
    );
    throwIfAborted(openOptions?.signal);
    return new LeRobotEpisodeSession({
      assets,
      episodeRows: episode,
      info,
      io,
      readObjects,
      source,
    });
  };

  return {
    id: "lerobot-v3",
    open,
    async openPreview(source, io, openOptions) {
      return new LeRobotEpisodePreviewSession(
        await open(source, io, openOptions),
      );
    },
  };
}

class LeRobotEpisodePreviewSession implements EpisodePreviewSession {
  private readonly initializedStreams = new Set<string>();
  private disposed = false;

  constructor(private readonly session: LeRobotEpisodeSession) {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.session.dispose();
  }

  async read(
    request: EpisodePreviewReadRequest = {},
    options: EpisodePreviewReadOptions = {},
  ): Promise<EpisodePreviewReadResult> {
    this.ensureOpen();
    throwIfAborted(options.signal);
    const previewStreams = this.session.manifest.streams
      .filter(isRenderableCameraStream)
      .sort(comparePreviewStreams);
    const selected = request.sourceName
      ? previewStreams.find(
          (stream) => stream.sourceName === request.sourceName,
        )
      : previewStreams[0];
    const streamSourceNames = previewStreams.map((stream) => stream.sourceName);
    if (!selected) {
      return {
        frame: null,
        streamId: null,
        streamSourceName: null,
        streamSourceNames,
        status: previewStreams.length ? "empty" : "unavailable",
      };
    }

    const startNs = request.startTimeNs ?? selected.timeRange.startNs;
    const frameDurationNs = secondsToNs(
      1 / (selected.approxRateHz ?? this.session.info.fps),
    );
    let frames: readonly DecodedFrame[] = [];
    for await (const batch of this.session.read({
      priority: options.priority,
      signal: options.signal,
      streams: [selected.id],
      window: {
        endNs: minBigInt(selected.timeRange.endNs, startNs + frameDurationNs),
        startNs,
      },
    })) {
      frames = batch.frames;
      break;
    }
    this.ensureOpen();
    throwIfAborted(options.signal);
    const initialized = this.initializedStreams.has(selected.id);
    const decoded = initialized
      ? firstFrameAtOrAfter(frames, startNs)
      : frames[0];
    if (decoded) this.initializedStreams.add(selected.id);
    const frame = decoded ? posterFrame(decoded) : null;
    const nextStartTimeNs = decoded
      ? decoded.timestampNs + frameDurationNs
      : undefined;
    return {
      bootstrapManifest: this.session.manifest,
      bootstrapTimeline: {
        endNs: this.session.manifest.timeRange.endNs,
        startNs: this.session.manifest.timeRange.startNs,
        timeDomainId: this.session.manifest.timeDomain.id,
      },
      bootstrapTimeRange: this.session.manifest.timeRange,
      frame,
      frameTimeNs: decoded?.timestampNs,
      nextStartTimeNs:
        nextStartTimeNs !== undefined &&
        nextStartTimeNs <= selected.timeRange.endNs
          ? nextStartTimeNs
          : undefined,
      streamId: selected.id,
      streamSourceName: selected.sourceName,
      streamSourceNames,
      status: frame ? "ready" : "empty",
    };
  }

  private ensureOpen() {
    if (this.disposed) throw new EpisodeReadCancelledError();
  }
}

class LeRobotEpisodeSession implements EpisodeSession {
  readonly imageBindings: ReadonlyMap<string, ImageBinding>;
  readonly info: LeRobotInfo;
  readonly manifest: EpisodeManifest;
  readonly numericSeries: NumericSeriesCapability;
  readonly playback: PlaybackReadCapability;
  readonly rawRecords: RawRecordCapability;
  readonly scalarFeatures: ReadonlyMap<string, LeRobotFeature>;
  readonly videoBindings: ReadonlyMap<string, VideoBinding>;
  private readonly rowCache = new Map<
    string,
    Promise<readonly Record<string, unknown>[]>
  >();
  private readonly videoIndexCache = new Map<string, Promise<VideoIndex>>();
  private readonly videoSpanCache = new Map<string, VideoSpanCacheEntry>();
  private decodedFrames = 0;
  private disposed = false;
  private generation = 0;
  private idleGeneration = 0;
  private readRequests = 0;
  private returnedBatches = 0;
  private transferredBytes = 0;

  constructor(
    private readonly state: {
      readonly assets: readonly AssetDescriptor[];
      readonly episodeRows: EpisodeRows;
      readonly info: LeRobotInfo;
      readonly io: ByteResources;
      readonly readObjects: ParquetReader;
      readonly source: EpisodeSource;
    },
  ) {
    this.info = state.info;
    const scalarFeatures = new Map<string, LeRobotFeature>();
    const videoBindings = new Map<string, VideoBinding>();
    const imageBindings = new Map<string, ImageBinding>();
    const timeRange = episodeTimeRange(state.episodeRows, state.assets);
    const streams = Object.entries(state.info.features).flatMap(
      ([name, feature]): StreamDescriptor[] => {
        const streamId = streamIdForFeature(name);
        if (feature.dtype === "video") {
          const asset = findFeatureAsset(state.assets, VIDEO_ROLE, name);
          const selector = asset?.selector;
          if (
            !asset ||
            !selector ||
            selector.kind !== "video-timestamp-interval"
          ) {
            return [unsupportedStream(name, feature, timeRange)];
          }
          const binding = {
            asset,
            feature,
            fromSeconds: selector.fromTimestamp,
            streamId,
            toSeconds: selector.toTimestamp,
          };
          videoBindings.set(streamId, binding);
          return [
            videoStream(name, feature, binding, timeRange, state.info.fps),
          ];
        }
        if (feature.dtype === "image") {
          const asset = findFeatureAsset(state.assets, IMAGE_ROLE, name);
          if (!asset) return [unsupportedStream(name, feature, timeRange)];
          imageBindings.set(streamId, { asset, feature, streamId });
          return [imageStream(name, feature, timeRange, state.info.fps)];
        }
        if (isNumericFeature(name, feature)) {
          scalarFeatures.set(streamId, feature);
          return [
            scalarStream(
              name,
              feature,
              timeRange,
              state.info.fps,
              state.episodeRows.rows.length,
            ),
          ];
        }
        return isStandardField(name)
          ? []
          : [unsupportedStream(name, feature, timeRange)];
      },
    );
    this.scalarFeatures = scalarFeatures;
    this.videoBindings = videoBindings;
    this.imageBindings = imageBindings;
    this.manifest = state.source.manifestHint ?? {
      episodeId: state.source.episodeId,
      metadata: {
        "lerobot.codebaseVersion": state.info.codebase_version ?? "unknown",
        "lerobot.episodeIndex": integer(
          state.episodeRows.episode.episode_index,
          "episode_index",
        ).toString(),
        "lerobot.fps": state.info.fps.toString(),
        "lerobot.robotType": state.info.robot_type ?? "unknown",
        "lerobot.tasks": JSON.stringify(state.episodeRows.episode.tasks ?? []),
      },
      streams,
      timeDomain: { id: "episode", kind: "duration", originNs: 0n },
      timeRange,
    };
    this.numericSeries = {
      enumerateNumericFields: async (requested) =>
        this.enumerateNumericFields(requested),
      readNumericSeries: async (request) => this.readNumericSeries(request),
    };
    this.rawRecords = this.createRawRecordCapability();
    this.playback = this.createPlaybackCapability();
  }

  activate(): void {
    this.ensureOpen();
  }

  cancelIdle(): void {
    this.ensureOpen();
    this.idleGeneration += 1;
  }

  deactivate(): void {
    if (!this.disposed) this.generation += 1;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.rowCache.clear();
    this.videoIndexCache.clear();
    this.videoSpanCache.clear();
  }

  async *read(request: ReadRequest): AsyncIterable<FrameBatch> {
    this.activate();
    throwIfAborted(request.signal);
    const generation = this.generation;
    const idleGeneration = this.idleGeneration;
    const priority = request.priority ?? "playback";
    this.readRequests += 1;
    for (const stream of request.streams) {
      const scalar = this.scalarFeatures.get(stream);
      const image = this.imageBindings.get(stream);
      const video = this.videoBindings.get(stream);
      const frames = scalar
        ? await this.readScalarFrames(stream, scalar, request)
        : image
          ? await this.readImageFrames(stream, image, request)
          : video
            ? await this.readVideoFrames(stream, video, request)
            : [];
      this.ensureReadable(generation, idleGeneration, priority, request.signal);
      if (!frames.length) continue;
      const limited =
        request.limit && request.limit > 0
          ? frames.slice(0, request.limit)
          : frames;
      this.recordBatch(limited.length);
      yield { frames: limited, stream };
    }
  }

  stats(): SourceStats {
    return {
      capturedAtMs: Date.now(),
      decodedFrames: this.decodedFrames,
      readRequests: this.readRequests,
      returnedBatches: this.returnedBatches,
      transferredBytes: this.transferredBytes,
    };
  }

  private async readScalarFrames(
    streamId: string,
    feature: LeRobotFeature,
    request: ReadRequest,
  ) {
    const featureName = featureNameForStream(streamId);
    const range = rowRangeForWindow(
      this.state.episodeRows.rows,
      request.window,
    );
    if (!range) return [];
    const rows = await this.readRows(
      ["timestamp", "frame_index", featureName],
      request.signal,
      this.state.episodeRows.dataAsset,
      range,
    );
    return rows
      .map((row) =>
        scalarFrame(
          streamId,
          featureName,
          feature,
          row,
          this.state.episodeRows.originSeconds,
        ),
      )
      .filter(
        (frame): frame is DecodedFrame =>
          frame !== null && inWindow(frame.timestampNs, request.window),
      );
  }

  private async readImageFrames(
    streamId: string,
    binding: ImageBinding,
    request: ReadRequest,
  ) {
    const featureName = featureNameForStream(streamId);
    const range = rowRangeForWindow(
      this.state.episodeRows.rows,
      request.window,
    );
    if (!range) return [];
    const rows = await this.readRows(
      ["timestamp", "frame_index", featureName],
      request.signal,
      binding.asset,
      range,
    );
    return rows
      .map((row) =>
        imageFrame(
          streamId,
          featureName,
          row,
          this.state.episodeRows.originSeconds,
        ),
      )
      .filter(
        (frame): frame is DecodedFrame =>
          frame !== null && inWindow(frame.timestampNs, request.window),
      );
  }

  private async readVideoFrames(
    streamId: string,
    binding: VideoBinding,
    request: ReadRequest,
  ) {
    if (codecFamily(videoCodec(binding.feature)) !== "h264") return [];
    const index = await this.readVideoIndex(binding, request.signal);
    const samples = selectVideoSamples(index, binding, request.window);
    if (!samples.length) return [];
    const bytes = await this.readSampleSpan(
      binding.asset,
      samples,
      request.signal,
    );
    const avc = (samples[0].description as Mp4SampleDescription).avcC;
    const lengthSize = (avc?.lengthSizeMinusOne ?? 3) + 1;
    const parameterSets = avcParameterSets(avc);
    return samples
      .map((sample) => {
        const offset = sample.offset - samples[0].offset;
        return videoFrame(
          streamId,
          binding,
          index,
          sample,
          mp4SampleToAnnexB(
            bytes.subarray(offset, offset + sample.size),
            lengthSize,
          ),
          parameterSets,
        );
      })
      .filter((frame): frame is DecodedFrame => frame !== null);
  }

  private createPlaybackCapability(): PlaybackReadCapability {
    const streamsById = new Map(
      this.manifest.streams.map((stream) => [stream.id, stream]),
    );
    const sourceNames = new Map(
      this.manifest.streams.map((stream) => [stream.id, stream.sourceName]),
    );
    const readBatch = (
      request: SynchronizedPlaybackBatchReadRequest,
      options?: SynchronizedPlaybackReadOptions,
    ) => this.readPlaybackBatch(request, streamsById, sourceNames, options);
    return {
      timeline: {
        endNs: this.manifest.timeRange.endNs,
        startNs: this.manifest.timeRange.startNs,
        timeDomainId: this.manifest.timeDomain.id,
      },
      readStreamTimeBounds: async (streams) => {
        this.ensureOpen();
        return streamTimeBoundsFromManifest(this.manifest, streams);
      },
      readSynchronized: async (request) => {
        const windows = await readBatch(
          { ...request, timeNs: [request.timeNs] },
          { priority: "current", signal: request.signal },
        );
        const window = windows[0] ?? emptyPlaybackWindow(request.timeNs);
        this.publishPlaybackSettlements(request, window);
        return window;
      },
      readSynchronizedBatch: readBatch,
    };
  }

  private async readPlaybackBatch(
    request: SynchronizedPlaybackBatchReadRequest,
    streamsById: ReadonlyMap<string, StreamDescriptor>,
    sourceNames: ReadonlyMap<string, string>,
    options: SynchronizedPlaybackReadOptions = {},
  ): Promise<readonly SynchronizedFrameWindow[]> {
    this.ensureOpen();
    throwIfAborted(options.signal);
    if (request.timeNs.length === 0) return [];
    if (request.streams.length === 0) {
      return request.timeNs.map(emptyPlaybackWindow);
    }
    const streams = [...new Set(request.streams)];
    const resolved = request.timeNs.map((timeNs) =>
      resolvePlaybackWindow(this.manifest.timeRange.startNs, streamsById, {
        ...request,
        streams,
        timeNs,
      }),
    );
    const batches = (
      await Promise.all(
        streams.map(async (stream) => {
          const windows = resolved.map((window) =>
            this.playbackReadWindow(stream, streamsById, window),
          );
          const streamBatches: FrameBatch[] = [];
          for await (const batch of this.read({
            priority: options.priority,
            signal: options.signal,
            streams: [stream],
            window: {
              endNs: maxOfBigInts(windows.map((window) => window.endNs)),
              startNs: minOfBigInts(windows.map((window) => window.startNs)),
            },
          })) {
            streamBatches.push(batch);
          }
          return streamBatches;
        }),
      )
    ).flat();
    throwIfAborted(options.signal);
    const framesByStream = collectLeRobotFramesByStream(batches, streams);
    return resolved.map((window) =>
      selectPlaybackWindow(framesByStream, streams, sourceNames, window),
    );
  }

  private playbackReadWindow(
    streamId: string,
    streamsById: ReadonlyMap<string, StreamDescriptor>,
    window: ResolvedPlaybackWindow,
  ): TimeWindow {
    const policy = window.streamPolicies[streamId];
    const stream = streamsById.get(streamId);
    const streamStartNs =
      stream?.timeRange.startNs ?? this.manifest.timeRange.startNs;
    const rateHz =
      stream?.approxRateHz && stream.approxRateHz > 0
        ? stream.approxRateHz
        : this.info.fps;
    const frameStepNs = BigInt(Math.ceil(NS_PER_SECOND / rateHz));
    const predecessorStartNs =
      window.timeNs - frameStepNs * BigInt(policy.limit);
    return {
      endNs: policy.endNs,
      startNs:
        policy.startNs ??
        (predecessorStartNs > streamStartNs
          ? predecessorStartNs
          : streamStartNs),
    };
  }

  private publishPlaybackSettlements(
    request: SynchronizedPlaybackReadRequest,
    window: SynchronizedFrameWindow,
  ): void {
    if (!request.onStreamSettlement && !request.onStreamSettlements) return;
    const settlements = prioritizedStreams(
      request.streams,
      request.settlementPriorityStreams,
    ).map((stream) => ({
      stream,
      window: {
        ...window,
        frames: window.framesByStream[stream] ?? [],
        framesByStream: {
          [stream]: window.framesByStream[stream] ?? [],
        },
        streamPolicies: { [stream]: window.streamPolicies[stream] },
      },
    }));
    request.onStreamSettlements?.(settlements);
    for (const settlement of settlements) {
      request.onStreamSettlement?.(settlement);
    }
  }

  private async readSampleSpan(
    asset: AssetDescriptor,
    samples: readonly Sample[],
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const start = samples[0].offset;
    const end = Math.max(
      ...samples.map((sample) => sample.offset + sample.size),
    );
    const key = `${asset.id}:${start}`;
    const previous = this.videoSpanCache.get(key);
    if (previous) {
      this.videoSpanCache.delete(key);
      this.videoSpanCache.set(key, previous);
      if (previous.span && previous.span.end >= end) {
        return previous.span.bytes.subarray(0, end - start);
      }
    }
    const promise = (async (): Promise<CachedVideoSpan> => {
      const cached = await previous?.promise;
      if (cached && cached.end >= end) return cached;
      const readStart = cached?.end ?? start;
      const result = await this.state.io.readBytes({
        range: {
          length: BigInt(end - readStart),
          offset: BigInt(readStart),
        },
        source: await this.state.source.assets.resolve(asset.id),
      });
      this.transferredBytes += result.bytes.byteLength;
      const bytes = new Uint8Array(
        (cached?.bytes.byteLength ?? 0) + result.bytes.byteLength,
      );
      if (cached) bytes.set(cached.bytes);
      bytes.set(result.bytes, cached?.bytes.byteLength ?? 0);
      return { bytes, end: readStart + result.bytes.byteLength };
    })();
    const entry: VideoSpanCacheEntry = { bytes: 0, promise, span: null };
    this.videoSpanCache.set(key, entry);
    void promise.then(
      (span) => {
        entry.bytes = span.bytes.byteLength;
        entry.span = span;
        this.evictVideoSpans();
      },
      () => {
        if (this.videoSpanCache.get(key) === entry) {
          this.videoSpanCache.delete(key);
        }
      },
    );
    const span = await waitForSharedRead(promise, signal);
    throwIfAborted(signal);
    return span.bytes.subarray(0, end - start);
  }

  private evictVideoSpans(): void {
    let retainedBytes = [...this.videoSpanCache.values()].reduce(
      (total, entry) => total + entry.bytes,
      0,
    );
    while (
      this.videoSpanCache.size > MAX_VIDEO_SPAN_CACHE_ENTRIES ||
      retainedBytes > MAX_VIDEO_SPAN_CACHE_BYTES
    ) {
      const oldest = this.videoSpanCache.entries().next().value as
        | readonly [string, VideoSpanCacheEntry]
        | undefined;
      if (!oldest) return;
      this.videoSpanCache.delete(oldest[0]);
      retainedBytes -= oldest[1].bytes;
    }
  }

  private async readRows(
    columns: readonly string[],
    signal?: AbortSignal,
    asset = this.state.episodeRows.dataAsset,
    range?: { readonly end: number; readonly start: number },
  ) {
    const key = `${asset.id}\n${range?.start ?? "all"}:${
      range?.end ?? "all"
    }\n${[...columns].sort().join("\n")}`;
    let cached = this.rowCache.get(key);
    if (!cached) {
      cached = readSelectedParquetRows(
        this.state.source,
        this.state.io,
        asset,
        this.state.readObjects,
        [...columns],
        undefined,
        range?.start,
        range?.end,
      );
      if (this.rowCache.size >= 32) {
        const oldest = this.rowCache.keys().next().value;
        if (oldest !== undefined) this.rowCache.delete(oldest);
      }
      this.rowCache.set(key, cached);
      void cached.catch(() => {
        if (this.rowCache.get(key) === cached) this.rowCache.delete(key);
      });
    }
    throwIfAborted(signal);
    const rows = await cached;
    throwIfAborted(signal);
    return rows;
  }

  private async readVideoIndex(binding: VideoBinding, signal?: AbortSignal) {
    let cached = this.videoIndexCache.get(binding.asset.id);
    if (!cached) {
      cached = parseVideoIndex(
        binding.asset,
        this.state.source,
        this.state.io,
        (bytes) => {
          this.transferredBytes += bytes;
        },
      );
      this.videoIndexCache.set(binding.asset.id, cached);
      void cached.catch(() => {
        if (this.videoIndexCache.get(binding.asset.id) === cached) {
          this.videoIndexCache.delete(binding.asset.id);
        }
      });
    }
    throwIfAborted(signal);
    const index = await cached;
    throwIfAborted(signal);
    return index;
  }

  private enumerateNumericFields(streams: readonly string[] | undefined) {
    const requested = streams ? new Set(streams) : null;
    return Promise.resolve(
      [...this.scalarFeatures.entries()]
        .filter(([stream]) => !requested || requested.has(stream))
        .map(([streamId, feature]) => ({
          availability: "ready" as const,
          encoding: feature.dtype,
          fields: scalarFieldNames(featureNameForStream(streamId), feature).map(
            (path) => ({ path, valueType: feature.dtype }),
          ),
          sourceName: featureNameForStream(streamId),
          streamId,
        })),
    );
  }

  private async readNumericSeries(
    request: Parameters<NumericSeriesCapability["readNumericSeries"]>[0],
  ) {
    throwIfAborted(request.signal);
    const feature = this.scalarFeatures.get(request.stream);
    if (!feature) {
      throw new Error(`Unknown LeRobot numeric stream '${request.stream}'`);
    }
    const featureName = featureNameForStream(request.stream);
    const range = rowRangeForWindow(
      this.state.episodeRows.rows,
      request.window,
    );
    if (!range) {
      return {
        baseTimeNs: this.manifest.timeRange.startNs,
        fields: request.fields.map((path) => ({
          path,
          timesSec: new Float64Array(),
          values: new Float64Array(),
        })),
        sampleCount: 0,
        streamId: request.stream,
        truncated: false,
      };
    }
    const rows = await this.readRows(
      ["timestamp", "frame_index", featureName],
      request.signal,
      this.state.episodeRows.dataAsset,
      range,
    );
    const frames = rows
      .map((row) =>
        scalarFrame(
          request.stream,
          featureName,
          feature,
          row,
          this.state.episodeRows.originSeconds,
        ),
      )
      .filter(
        (frame): frame is DecodedFrame =>
          frame !== null && inWindow(frame.timestampNs, request.window),
      );
    const selected = sampledIndexes(
      frames.length,
      request.maxPointsPerField,
    ).map((index) => frames[index]);
    const baseTimeNs = this.manifest.timeRange.startNs;
    return {
      baseTimeNs,
      fields: request.fields.map((path) => ({
        path,
        timesSec: Float64Array.from(
          selected.map((frame) =>
            nsDeltaToSeconds(frame.timestampNs - baseTimeNs),
          ),
        ),
        values: Float64Array.from(
          selected.map(
            (frame) =>
              frame.output.scalars?.find((scalar) => scalar.field === path)
                ?.value ?? Number.NaN,
          ),
        ),
      })),
      sampleCount: frames.length,
      streamId: request.stream,
      truncated: selected.length < frames.length,
    };
  }

  private createRawRecordCapability(): RawRecordCapability {
    const rows = this.state.episodeRows.rows;
    const readAt = async (
      rowOffset: number,
      options: {
        readonly includeFullJson?: boolean;
        readonly prune?: RawRecordPruneBudgets;
        readonly signal?: AbortSignal;
      },
    ): Promise<RawRecordResult> => {
      const selected = await readSelectedParquetRows(
        this.state.source,
        this.state.io,
        this.state.episodeRows.dataAsset,
        this.state.readObjects,
        undefined,
        options.signal,
        rowOffset,
        rowOffset + 1,
      );
      const row = selected[0];
      const timeline = rows[rowOffset];
      if (!row || !timeline) return emptyRawRecord(this.manifest.timeRange);
      const pruned = pruneRawRecord(row, options.prune);
      const next = rows[rowOffset + 1]?.localTimeNs;
      return {
        cursor: rawCursor(rowOffset),
        encoding: "parquet",
        ...(options.includeFullJson
          ? { fullJson: boundedJson(row, options.prune) }
          : {}),
        root: pruned.root,
        schemaName: "LeRobotDataset v3 row",
        sequence: timeline.frameIndex,
        sourceName: "Episode rows",
        sourceTimestamps: {
          lerobot: secondsToNs(timeline.sourceTimeSeconds),
        },
        status: "ok",
        streamId: RAW_STREAM_ID,
        timestampNs: timeline.localTimeNs,
        truncated: pruned.truncated,
        validFromNs: timeline.localTimeNs,
        validUntilNs:
          next !== undefined && next > timeline.localTimeNs
            ? next - 1n
            : this.manifest.timeRange.endNs,
      };
    };

    return {
      listRawRecordStreams: async ({ signal } = {}) => {
        throwIfAborted(signal);
        return [
          {
            encoding: "parquet",
            sampleCount: rows.length,
            schemaName: "LeRobotDataset v3 row",
            sourceName: "Episode rows",
            streamId: RAW_STREAM_ID,
            supportsExactBrowsing: true,
          },
        ];
      },
      readRawRecord: async (request) => {
        requireRawStream(request.stream);
        const offset = rowAtOrBefore(rows, request.timestampNs);
        return offset === null
          ? emptyRawRecord(this.manifest.timeRange)
          : readAt(offset, request);
      },
      readRawRecordAtCursor: async (request) => {
        requireRawStream(request.stream);
        return readAt(parseRawCursor(request.cursor, rows.length), request);
      },
      readRawRecordIndexWindow: async (request) => {
        requireRawStream(request.stream);
        throwIfAborted(request.signal);
        const selected =
          request.anchorCursor !== undefined
            ? parseRawCursor(request.anchorCursor, rows.length)
            : (rowAtOrBefore(rows, request.anchorTimestampNs) ?? 0);
        const start = Math.max(0, selected - Math.max(0, request.before));
        const end = Math.min(
          rows.length,
          selected + Math.max(0, request.after) + 1,
        );
        const result: RawRecordIndexWindow = {
          entries: rows.slice(start, end).map((row) => ({
            cursor: rawCursor(row.rowOffset),
            timestampNs: row.localTimeNs,
          })),
          hasNext: end < rows.length,
          hasPrevious: start > 0,
          selectedCursor: rawCursor(selected),
        };
        return result;
      },
    };
  }

  private ensureReadable(
    generation: number,
    idleGeneration: number,
    priority: ReadRequest["priority"],
    signal?: AbortSignal,
  ) {
    this.ensureOpen();
    throwIfAborted(signal);
    if (generation !== this.generation) throw new EpisodeReadCancelledError();
    if (
      (priority === "bulk" || priority === "idle") &&
      idleGeneration !== this.idleGeneration
    ) {
      throw new EpisodeReadCancelledError();
    }
  }

  private ensureOpen() {
    if (this.disposed) throw new EpisodeReadCancelledError();
  }

  private recordBatch(frameCount: number) {
    this.decodedFrames += frameCount;
    this.returnedBatches += 1;
  }
}

async function readInfo(
  source: EpisodeSource,
  io: ByteResources,
  asset: AssetDescriptor,
  signal?: AbortSignal,
): Promise<LeRobotInfo> {
  const buffer = asyncBufferForSource(asset, source, io, signal);
  const bytes = new Uint8Array(await buffer.slice(0, buffer.byteLength));
  throwIfAborted(signal);
  const value = JSON.parse(new TextDecoder().decode(bytes)) as LeRobotInfo;
  if (!value.features || !Number.isFinite(value.fps) || value.fps <= 0) {
    throw new Error("Invalid LeRobot meta/info.json");
  }
  const version = value.codebase_version?.trim();
  const match = version?.match(
    /^v?(\d+)(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/i,
  );
  if (!match || Number(match[1]) !== 3) {
    throw new Error(
      `This viewer supports LeRobotDataset format v3.x; the source declares '${
        version ?? "missing"
      }'`,
    );
  }
  return value;
}

async function readEpisodeRows(
  source: EpisodeSource,
  io: ByteResources,
  dataAsset: AssetDescriptor,
  episode: Record<string, unknown>,
  readObjects: ParquetReader,
  signal?: AbortSignal,
): Promise<EpisodeRows> {
  const interval = requireRowInterval(dataAsset);
  const rows = await readSelectedParquetRows(
    source,
    io,
    dataAsset,
    readObjects,
    ["timestamp", "frame_index", "episode_index", "index", "task_index"],
    signal,
  );
  const expectedLength = integer(episode.length, "length");
  if (
    rows.length !== expectedLength ||
    interval.end - interval.start !== expectedLength
  ) {
    throw new Error("LeRobot selected data rows do not match episode length");
  }
  const expectedEpisode = integer(episode.episode_index, "episode_index");
  const expectedGlobalStart = integer(
    episode.dataset_from_index,
    "dataset_from_index",
  );
  const sourceTimes = rows.map((row, rowOffset) => {
    const timestamp = number(row.timestamp, "timestamp");
    if (integer(row.episode_index, "episode_index") !== expectedEpisode) {
      throw new Error(
        "LeRobot data selector contains rows from another episode",
      );
    }
    if (integer(row.index, "index") !== expectedGlobalStart + rowOffset) {
      throw new Error("LeRobot global index must be contiguous");
    }
    if (integer(row.task_index, "task_index") < 0) {
      throw new Error("LeRobot task_index must be nonnegative");
    }
    return {
      frameIndex: integer(row.frame_index, "frame_index"),
      rowOffset,
      sourceTimeSeconds: timestamp,
    };
  });
  const originSeconds = sourceTimes[0]?.sourceTimeSeconds ?? 0;
  const timeline = sourceTimes.map((row) => ({
    ...row,
    localTimeNs: secondsToNs(row.sourceTimeSeconds - originSeconds),
  }));
  for (let index = 0; index < timeline.length; index += 1) {
    if (timeline[index].frameIndex !== index) {
      throw new Error(
        "LeRobot frame_index must be contiguous within an episode",
      );
    }
    if (
      index > 0 &&
      timeline[index].localTimeNs < timeline[index - 1].localTimeNs
    ) {
      throw new Error("LeRobot row timestamps must be monotonic");
    }
  }
  return {
    dataAsset,
    episode,
    originSeconds,
    rows: timeline,
  };
}

async function readSelectedParquetRows(
  source: EpisodeSource,
  io: ByteResources,
  asset: AssetDescriptor,
  readObjects: ParquetReader,
  columns?: string[],
  signal?: AbortSignal,
  relativeStart?: number,
  relativeEnd?: number,
): Promise<Record<string, unknown>[]> {
  const interval = requireRowInterval(asset);
  const rowStart = interval.start + (relativeStart ?? 0);
  const rowEnd =
    relativeEnd === undefined ? interval.end : interval.start + relativeEnd;
  if (
    rowStart < interval.start ||
    rowEnd > interval.end ||
    rowStart >= rowEnd
  ) {
    throw new Error("LeRobot row request exceeds the resolved selector");
  }
  throwIfAborted(signal);
  const rows = await readObjects({
    ...(columns ? { columns } : {}),
    file: asyncBufferForSource(asset, source, io, signal),
    rowEnd,
    rowStart,
  });
  throwIfAborted(signal);
  return rows;
}

function asyncBufferForSource(
  asset: AssetDescriptor,
  source: EpisodeSource,
  io: ByteResources,
  signal?: AbortSignal,
  onBytes?: (bytes: number) => void,
): AsyncBuffer {
  let resolved: ReturnType<EpisodeSource["assets"]["resolve"]> | undefined;
  const resolve = () =>
    (resolved ??= source.assets.resolve(asset.id, { signal }));
  const byteLength = safeByteLength(asset.metadata?.sizeBytes);
  if (byteLength === null) {
    throw new Error(
      `LeRobot asset '${asset.id}' is missing metadata.sizeBytes`,
    );
  }
  return {
    byteLength,
    async slice(start: number, end = byteLength) {
      if (start < 0 || end < start || end > byteLength) {
        throw new RangeError(`Invalid byte range ${start}:${end}`);
      }
      throwIfAborted(signal);
      const result = await io.readBytes({
        range: { length: BigInt(end - start), offset: BigInt(start) },
        signal,
        source: await resolve(),
      });
      throwIfAborted(signal);
      onBytes?.(result.bytes.byteLength);
      return exactArrayBuffer(result.bytes);
    },
  };
}

async function parseVideoIndex(
  asset: AssetDescriptor,
  source: EpisodeSource,
  io: ByteResources,
  onBytes: (bytes: number) => void,
): Promise<VideoIndex> {
  const byteLength = safeByteLength(asset.metadata?.sizeBytes);
  if (byteLength === null) throw new Error("LeRobot video asset has no size");
  const file = createFile(false);
  let track: Track | null = null;
  let failure: Error | null = null;
  file.onError = (message) => {
    failure = new Error(`LeRobot MP4 index parse failed: ${message}`);
  };
  file.onReady = (info) => {
    track = info.videoTracks[0] ?? null;
  };
  const descriptor = await source.assets.resolve(asset.id);
  let offset = 0;
  while (!track && !failure && offset < byteLength) {
    const end = Math.min(byteLength, offset + MP4_INDEX_CHUNK_BYTES);
    const result = await io.readBytes({
      range: { length: BigInt(end - offset), offset: BigInt(offset) },
      source: descriptor,
    });
    onBytes(result.bytes.byteLength);
    const next = file.appendBuffer(
      MP4BoxBuffer.fromArrayBuffer(exactArrayBuffer(result.bytes), offset),
      end === byteLength,
    );
    offset = Number.isSafeInteger(next) && next > offset ? next : end;
  }
  if (failure) throw failure;
  const videoTrack = track as Track | null;
  if (!videoTrack)
    throw new Error("LeRobot video asset has no readable video track");
  const samples = file.getTrackSamplesInfo(videoTrack.id);
  if (!samples.length) throw new Error("LeRobot video track has no samples");
  const compositionOffsetSeconds = Math.min(
    ...samples.map((sample) => sample.cts / videoTrack.timescale),
  );
  const presentationSamples = samples
    .map((sample, decodeIndex) => ({
      decodeIndex,
      presentationSeconds:
        sample.cts / videoTrack.timescale - compositionOffsetSeconds,
      sample,
    }))
    .sort((left, right) =>
      left.presentationSeconds !== right.presentationSeconds
        ? left.presentationSeconds - right.presentationSeconds
        : left.decodeIndex - right.decodeIndex,
    );
  return {
    compositionOffsetSeconds,
    file,
    presentationSamples,
    samples,
    track: videoTrack,
  };
}

function selectVideoSamples(
  index: VideoIndex,
  binding: VideoBinding,
  window: TimeWindow,
): readonly Sample[] {
  const startSeconds = Math.max(
    binding.fromSeconds,
    binding.fromSeconds + nsToSeconds(window.startNs),
  );
  const endSeconds = Math.min(
    binding.toSeconds,
    binding.fromSeconds + nsToSeconds(window.endNs),
  );
  const startIndex = lowerBoundPresentation(
    index.presentationSamples,
    startSeconds,
  );
  const endIndex = upperBoundPresentation(
    index.presentationSamples,
    endSeconds,
  );
  const requested = index.presentationSamples.slice(startIndex, endIndex);
  if (!requested.length) return [];
  const firstDecode = Math.min(...requested.map((entry) => entry.decodeIndex));
  const lastDecode = Math.max(...requested.map((entry) => entry.decodeIndex));
  let startDecode = firstDecode;
  for (let decodeIndex = firstDecode; decodeIndex >= 0; decodeIndex -= 1) {
    if (index.samples[decodeIndex].is_sync) {
      startDecode = decodeIndex;
      break;
    }
  }
  return index.samples.slice(startDecode, lastDecode + 1);
}

function videoFrame(
  streamId: string,
  binding: VideoBinding,
  index: VideoIndex,
  sample: Sample,
  bytes: Uint8Array,
  parameterSets: { readonly pps?: Uint8Array; readonly sps?: Uint8Array },
): DecodedFrame | null {
  if (index.track.timescale <= 0) return null;
  const presentationSeconds = videoPresentationSeconds(index, sample);
  // MP4 timestamps and v3 selectors can represent the same frame boundary
  // with slightly different floats. Compare them in the IR's nanosecond
  // domain so the opening keyframe is not mistaken for out-of-episode preroll.
  const timestampNs = secondsToNs(presentationSeconds - binding.fromSeconds);
  const episodeDurationNs = secondsToNs(
    binding.toSeconds - binding.fromSeconds,
  );
  if (timestampNs < 0n || timestampNs >= episodeDurationNs) {
    return null;
  }
  const decodeTimestampNs = secondsToNs(
    sample.dts / index.track.timescale - binding.fromSeconds,
  );
  const visualization = encodedVideo(
    index.track.codec,
    bytes,
    sample.is_sync,
    timestampNs,
    decodeTimestampNs,
    parameterSets,
  );
  const output: DecodedOutput = {
    resourceHints: {
      sizeBytes: bytes.byteLength,
      transferables: [bytes.buffer],
    },
    timing: { timeRange: { startNs: timestampNs } },
    visualization,
  };
  return {
    output,
    sequence: sample.number,
    sourceTimestamps: {
      lerobotShard: secondsToNs(presentationSeconds),
    },
    streamId,
    timestampNs,
  };
}

function encodedVideo(
  codecString: string,
  bytes: Uint8Array,
  keyframe: boolean,
  timestampNs: bigint,
  decodeTimestampNs: bigint,
  parameterSets: { readonly pps?: Uint8Array; readonly sps?: Uint8Array },
): EncodedVideoVisualization {
  const codec = codecFamily(codecString);
  if (codec === "h264") {
    return {
      bytes,
      codec,
      decodeTimestampNs,
      format: codecString,
      h264: {
        codecString,
        hasFrame: true,
        ...(keyframe && parameterSets.pps ? { pps: parameterSets.pps } : {}),
        ...(keyframe && parameterSets.sps ? { sps: parameterSets.sps } : {}),
      },
      keyframe,
      kind: VISUALIZATION_KIND.ENCODED_VIDEO,
      timestampNs,
    };
  }
  if (codec === "unknown") {
    throw new Error(`Unsupported LeRobot video codec '${codecString}'`);
  }
  return {
    bytes,
    codec,
    decodeTimestampNs,
    format: codecString,
    keyframe,
    kind: VISUALIZATION_KIND.ENCODED_VIDEO,
    timestampNs,
  };
}

function videoPresentationSeconds(index: VideoIndex, sample: Sample) {
  return sample.cts / index.track.timescale - index.compositionOffsetSeconds;
}

function lowerBoundPresentation(
  samples: readonly IndexedVideoSample[],
  timeSeconds: number,
): number {
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (samples[middle].presentationSeconds < timeSeconds) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBoundPresentation(
  samples: readonly IndexedVideoSample[],
  timeSeconds: number,
): number {
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (samples[middle].presentationSeconds <= timeSeconds) low = middle + 1;
    else high = middle;
  }
  return low;
}

function waitForSharedRead<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      try {
        throwIfAborted(signal);
      } catch (error) {
        reject(error);
      }
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function collectLeRobotFramesByStream(
  batches: readonly FrameBatch[],
  streams: readonly string[],
): ReadonlyMap<string, readonly DecodedFrame[]> {
  const requested = new Set(streams);
  const framesByStream = new Map<string, DecodedFrame[]>(
    streams.map((stream) => [stream, []]),
  );
  for (const batch of batches) {
    if (!requested.has(batch.stream)) continue;
    const frames = framesByStream.get(batch.stream);
    if (!frames) continue;
    for (const frame of batch.frames) {
      if (frame.streamId === batch.stream) frames.push(frame);
    }
  }
  return framesByStream;
}

function mp4SampleToAnnexB(bytes: Uint8Array, lengthSize: number): Uint8Array {
  const units: Uint8Array[] = [];
  let offset = 0;
  let total = 0;
  while (offset + lengthSize <= bytes.byteLength) {
    let length = 0;
    for (let index = 0; index < lengthSize; index += 1) {
      length = length * 256 + bytes[offset + index];
    }
    offset += lengthSize;
    if (length <= 0 || offset + length > bytes.byteLength) {
      throw new Error("Malformed H.264 sample in LeRobot MP4 asset");
    }
    const unit = bytes.subarray(offset, offset + length);
    units.push(unit);
    total += 4 + unit.byteLength;
    offset += length;
  }
  if (offset !== bytes.byteLength || !units.length) {
    throw new Error("Malformed H.264 access unit in LeRobot MP4 asset");
  }
  const output = new Uint8Array(total);
  offset = 0;
  for (const unit of units) {
    output.set([0, 0, 0, 1], offset);
    offset += 4;
    output.set(unit, offset);
    offset += unit.byteLength;
  }
  return output;
}

function avcParameterSets(avc: AvcConfiguration | undefined) {
  const bytes = (value: ArrayLike<number> | undefined) =>
    value ? Uint8Array.from(value) : undefined;
  return {
    pps: bytes(avc?.PPS?.[0]?.data),
    sps: bytes(avc?.SPS?.[0]?.data),
  };
}

function scalarFrame(
  streamId: string,
  featureName: string,
  feature: LeRobotFeature,
  row: Record<string, unknown>,
  originSeconds: number,
): DecodedFrame | null {
  const seconds = optionalNumber(row.timestamp);
  if (seconds === null) return null;
  const timestampNs = secondsToNs(seconds - originSeconds);
  const values = numericValues(row[featureName]);
  const names = scalarFieldNames(featureName, feature);
  const scalars = values.flatMap((value, index) =>
    Number.isFinite(value)
      ? [
          {
            field: names[index] ?? `${featureName}[${index}]`,
            timestampNs,
            value,
          },
        ]
      : [],
  );
  return {
    output: {
      attributes: { frameIndex: optionalBigInt(row.frame_index) },
      resourceHints: { transferables: [] },
      scalars,
      timing: { timeRange: { startNs: timestampNs } },
    },
    sequence: optionalInteger(row.frame_index) ?? undefined,
    sourceTimestamps: { lerobot: secondsToNs(seconds) },
    streamId,
    timestampNs,
  };
}

function imageFrame(
  streamId: string,
  featureName: string,
  row: Record<string, unknown>,
  originSeconds: number,
): DecodedFrame | null {
  const seconds = optionalNumber(row.timestamp);
  const sourceBytes = imageBytes(row[featureName]);
  if (seconds === null || !sourceBytes) return null;
  const bytes = Uint8Array.from(sourceBytes);
  const timestampNs = secondsToNs(seconds - originSeconds);
  return {
    output: {
      attributes: { frameIndex: optionalBigInt(row.frame_index) },
      resourceHints: {
        sizeBytes: bytes.byteLength,
        transferables: [bytes.buffer],
      },
      timing: { timeRange: { startNs: timestampNs } },
      visualization: {
        bytes,
        kind: VISUALIZATION_KIND.ENCODED_IMAGE,
        mimeType: sniffImageMimeType(bytes),
      },
    },
    sequence: optionalInteger(row.frame_index) ?? undefined,
    sourceTimestamps: { lerobot: secondsToNs(seconds) },
    streamId,
    timestampNs,
  };
}

function scalarStream(
  name: string,
  feature: LeRobotFeature,
  timeRange: TimeWindow,
  fps: number,
  count: number,
): StreamDescriptor {
  return {
    approxRateHz: fps,
    count,
    id: streamIdForFeature(name),
    kind: STREAM_KIND.SCALAR,
    metadata: streamMetadata(feature.dtype, feature.dtype, "decodable"),
    payload: {
      encoding: "parquet",
      schema: `${feature.dtype}${shapeSuffix(feature.shape)}`,
    },
    sourceName: name,
    timeRange,
  };
}

function imageStream(
  name: string,
  feature: LeRobotFeature,
  timeRange: TimeWindow,
  fps: number,
): StreamDescriptor {
  return {
    approxRateHz: fps,
    id: streamIdForFeature(name),
    kind: STREAM_KIND.IMAGE,
    metadata: {
      ...streamMetadata("parquet-image", feature.dtype, "decodable"),
      [SCENE_SOURCE_METADATA.SOURCE_NAME]: name,
      [SCENE_SOURCE_METADATA.TYPE]: SCENE_SOURCE_TYPE.IMAGE,
    },
    payload: { encoding: "parquet-image", schema: feature.dtype },
    sourceName: name,
    timeRange,
  };
}

function videoStream(
  name: string,
  feature: LeRobotFeature,
  binding: VideoBinding,
  timeRange: TimeWindow,
  fps: number,
): StreamDescriptor {
  const codec = videoCodec(feature);
  const supported = codecFamily(codec) === "h264";
  return {
    approxRateHz: optionalNumber(feature.info?.["video.fps"]) ?? fps,
    id: binding.streamId,
    kind: STREAM_KIND.VIDEO,
    metadata: {
      ...streamMetadata(
        "mp4",
        codec,
        supported ? "decodable" : "unsupported-encoding",
      ),
      [SCENE_SOURCE_METADATA.SOURCE_NAME]: name,
      [SCENE_SOURCE_METADATA.TYPE]: SCENE_SOURCE_TYPE.IMAGE,
      "lerobot.assetId": binding.asset.id,
      "lerobot.codec": codec,
    },
    payload: { encoding: "mp4", schema: codec },
    sourceName: name,
    timeRange,
  };
}

function unsupportedStream(
  name: string,
  feature: LeRobotFeature,
  timeRange: TimeWindow,
): StreamDescriptor {
  return {
    id: streamIdForFeature(name),
    kind: STREAM_KIND.UNKNOWN,
    metadata: streamMetadata(
      feature.dtype,
      feature.dtype,
      "unsupported-encoding",
    ),
    payload: { encoding: feature.dtype, schema: shapeSuffix(feature.shape) },
    sourceName: name,
    timeRange,
  };
}

function streamMetadata(
  encoding: string,
  schema: string,
  status: "decodable" | "unsupported-encoding",
) {
  return {
    [STREAM_METADATA.DECODE_STATUS]: status,
    [STREAM_METADATA.ENCODING]: encoding,
    [STREAM_METADATA.SCHEMA_NAME]: schema,
  };
}

function episodeTimeRange(
  episodeRows: EpisodeRows,
  assets: readonly AssetDescriptor[],
): TimeWindow {
  const rowEnd = episodeRows.rows.at(-1)?.localTimeNs ?? 0n;
  const videoEnd = assets.reduce((end, asset) => {
    const selector = asset.selector;
    return selector?.kind === "video-timestamp-interval"
      ? Math.max(end, selector.toTimestamp - selector.fromTimestamp)
      : end;
  }, 0);
  return { endNs: maxBigInt(rowEnd, secondsToNs(videoEnd)), startNs: 0n };
}

function requireSingleRole(
  assets: readonly AssetDescriptor[],
  role: string,
): AssetDescriptor {
  const matches = assets.filter((asset) => asset.role === role);
  if (matches.length !== 1) {
    throw new Error(`LeRobot source requires exactly one '${role}' asset`);
  }
  return matches[0];
}

function findFeatureAsset(
  assets: readonly AssetDescriptor[],
  role: string,
  featureName: string,
) {
  return assets.find(
    (asset) => asset.role === role && asset.featureName === featureName,
  );
}

function requireRowInterval(asset: AssetDescriptor) {
  const selector = asset.selector;
  if (
    selector?.kind !== "row-interval" ||
    selector.coordinateSystem !== "parquet-file-row" ||
    !Number.isSafeInteger(selector.start) ||
    !Number.isSafeInteger(selector.end) ||
    selector.start < 0 ||
    selector.start >= selector.end
  ) {
    throw new Error(
      `LeRobot asset '${asset.id}' needs a valid parquet-file-row selector`,
    );
  }
  return selector;
}

function isRenderableCameraStream(stream: StreamDescriptor) {
  return (
    stream.metadata?.[SCENE_SOURCE_METADATA.TYPE] === SCENE_SOURCE_TYPE.IMAGE &&
    stream.metadata?.[STREAM_METADATA.DECODE_STATUS] === "decodable"
  );
}

function comparePreviewStreams(
  left: StreamDescriptor,
  right: StreamDescriptor,
) {
  const preference = (stream: StreamDescriptor) =>
    /(?:^|[._/-])(primary|front)(?:$|[._/-])/i.test(stream.sourceName) ? 0 : 1;
  return (
    preference(left) - preference(right) ||
    left.sourceName.localeCompare(right.sourceName)
  );
}

function posterFrame(frame: DecodedFrame): EpisodePosterFrame | null {
  const visualization = frame.output.visualization;
  if (
    visualization?.kind === VISUALIZATION_KIND.ENCODED_IMAGE ||
    visualization?.kind === VISUALIZATION_KIND.RAW_IMAGE ||
    visualization?.kind === VISUALIZATION_KIND.ENCODED_VIDEO
  ) {
    return { image: visualization, kind: "image" };
  }
  return null;
}

function firstFrameAtOrAfter(
  frames: readonly DecodedFrame[],
  timestampNs: bigint,
) {
  return (
    frames
      .filter((frame) => frame.timestampNs >= timestampNs)
      .sort((left, right) =>
        left.timestampNs < right.timestampNs
          ? -1
          : left.timestampNs > right.timestampNs
            ? 1
            : 0,
      )[0] ?? frames[0]
  );
}

function isNumericFeature(name: string, feature: LeRobotFeature) {
  return (
    !isStandardField(name) && /^(?:bool|float|int|uint)/.test(feature.dtype)
  );
}

function isStandardField(name: string) {
  return [
    "timestamp",
    "frame_index",
    "episode_index",
    "index",
    "task_index",
  ].includes(name);
}

function scalarFieldNames(featureName: string, feature: LeRobotFeature) {
  const count = Math.max(1, numericElementCount(feature.shape));
  return Array.from({ length: count }, (_, index) => {
    const name = feature.names?.[index];
    return name
      ? `${featureName}.${name}`
      : count === 1
        ? featureName
        : `${featureName}[${index}]`;
  });
}

function numericElementCount(shape: readonly number[] | undefined) {
  return (shape ?? []).reduce((product, value) => product * value, 1);
}

function numericValues(value: unknown): readonly number[] {
  if (typeof value === "boolean") return [value ? 1 : 0];
  if (typeof value === "number") return [value];
  if (!Array.isArray(value)) return [];
  return value
    .flat(Infinity)
    .map((entry) =>
      typeof entry === "boolean" ? (entry ? 1 : 0) : optionalNumber(entry),
    )
    .filter((entry): entry is number => entry !== null);
}

function imageBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value && typeof value === "object" && "bytes" in value) {
    return imageBytes((value as { readonly bytes?: unknown }).bytes);
  }
  return null;
}

function sniffImageMimeType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
}

function videoCodec(feature: LeRobotFeature) {
  return stringValue(feature.info?.["video.codec"]) ?? "unknown";
}

function codecFamily(
  codec: string,
): "av1" | "h264" | "h265" | "unknown" | "vp9" {
  const normalized = codec.toLowerCase();
  if (/^(?:av01|av1)/.test(normalized)) return "av1";
  if (/^(?:hvc1|hev1|h265|hevc)/.test(normalized)) return "h265";
  if (/^(?:vp09|vp9)/.test(normalized)) return "vp9";
  if (/^(?:avc1|avc3|h264)/.test(normalized)) return "h264";
  return "unknown";
}

function streamIdForFeature(feature: string) {
  return `lerobot:${feature}`;
}

function featureNameForStream(stream: string) {
  return stream.startsWith("lerobot:")
    ? stream.slice("lerobot:".length)
    : stream;
}

function shapeSuffix(shape: readonly number[] | undefined) {
  return shape?.length ? `[${shape.join(",")}]` : "";
}

function sampledIndexes(length: number, maxPoints: number | undefined) {
  if (!maxPoints || maxPoints <= 0 || length <= maxPoints) {
    return Array.from({ length }, (_, index) => index);
  }
  if (maxPoints === 1) return [0];
  return Array.from({ length: maxPoints }, (_, index) =>
    Math.round((index * (length - 1)) / (maxPoints - 1)),
  );
}

function inWindow(timestampNs: bigint, window: TimeWindow) {
  return timestampNs >= window.startNs && timestampNs <= window.endNs;
}

function rowRangeForWindow(
  rows: readonly TimelineRow[],
  window: TimeWindow,
): { readonly end: number; readonly start: number } | null {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle].localTimeNs < window.startNs) low = middle + 1;
    else high = middle;
  }
  const start = low;
  high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle].localTimeNs <= window.endNs) low = middle + 1;
    else high = middle;
  }
  return start < low ? { end: low, start } : null;
}

function secondsToNs(seconds: number) {
  if (!Number.isFinite(seconds)) throw new Error("Invalid LeRobot timestamp");
  return BigInt(Math.round(seconds * NS_PER_SECOND));
}

function nsToSeconds(timestampNs: bigint) {
  return Number(timestampNs) / NS_PER_SECOND;
}

function integer(value: unknown, field: string) {
  const parsed = optionalInteger(value);
  if (parsed === null) throw new Error(`Invalid LeRobot ${field}`);
  return parsed;
}

function number(value: unknown, field: string) {
  const parsed = optionalNumber(value);
  if (parsed === null) throw new Error(`Invalid LeRobot ${field}`);
  return parsed;
}

function optionalInteger(value: unknown): number | null {
  if (typeof value === "bigint") {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function optionalBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  return typeof value === "number" && Number.isSafeInteger(value)
    ? BigInt(value)
    : null;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "bigint") {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length ? value : null;
}

function safeByteLength(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const size = Number(value);
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function maxBigInt(left: bigint, right: bigint) {
  return left > right ? left : right;
}

function minBigInt(left: bigint, right: bigint) {
  return left < right ? left : right;
}

function rawCursor(rowOffset: number) {
  return `row:${rowOffset}`;
}

function parseRawCursor(cursor: string, rowCount: number) {
  const match = /^row:(\d+)$/.exec(cursor);
  const value = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 0 || value >= rowCount) {
    throw new Error("Invalid LeRobot raw-record cursor");
  }
  return value;
}

function requireRawStream(stream: string) {
  if (stream !== RAW_STREAM_ID) {
    throw new Error(`Unknown LeRobot raw-record stream '${stream}'`);
  }
}

function rowAtOrBefore(rows: readonly TimelineRow[], timestampNs: bigint) {
  if (!rows.length) return null;
  if (timestampNs < rows[0].localTimeNs) return null;
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle].localTimeNs <= timestampNs) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

function emptyRawRecord(timeRange: TimeWindow): RawRecordResult {
  return {
    encoding: "parquet",
    schemaName: "LeRobotDataset v3 row",
    sourceName: "Episode rows",
    status: "empty",
    streamId: RAW_STREAM_ID,
    validFromNs: timeRange.startNs,
    validUntilNs: timeRange.endNs,
  };
}

interface PruneState {
  readonly budgets: Required<RawRecordPruneBudgets>;
  nodes: number;
  truncated: boolean;
}

function pruneRawRecord(
  record: Record<string, unknown>,
  requested: RawRecordPruneBudgets = {},
) {
  const state: PruneState = {
    budgets: {
      maxArrayLength: requested.maxArrayLength ?? 64,
      maxDepth: requested.maxDepth ?? 6,
      maxStringLength: requested.maxStringLength ?? 1_000,
      maxTotalNodes: requested.maxTotalNodes ?? 2_000,
    },
    nodes: 0,
    truncated: false,
  };
  const root = pruneObject(record, 0, state);
  return { root, truncated: state.truncated };
}

function pruneValue(
  value: unknown,
  depth: number,
  state: PruneState,
): RawValueNode {
  if (state.nodes >= state.budgets.maxTotalNodes) {
    state.truncated = true;
    return { kind: "truncated", reason: "nodes" };
  }
  state.nodes += 1;
  if (depth > state.budgets.maxDepth) {
    state.truncated = true;
    return { kind: "truncated", reason: "depth" };
  }
  const bytes = imageBytes(value);
  if (bytes) {
    return {
      byteLength: bytes.byteLength,
      kind: "bytes",
      preview: [...bytes.subarray(0, 16)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" "),
    };
  }
  if (Array.isArray(value)) {
    const count = Math.min(value.length, state.budgets.maxArrayLength);
    if (count < value.length) state.truncated = true;
    return {
      items: value
        .slice(0, count)
        .map((item) => pruneValue(item, depth + 1, state)),
      kind: "array",
      totalLength: value.length,
    };
  }
  if (value && typeof value === "object") {
    return pruneObject(value as Record<string, unknown>, depth, state);
  }
  if (typeof value === "string") {
    const truncated = value.length > state.budgets.maxStringLength;
    if (truncated) state.truncated = true;
    return {
      kind: "scalar",
      truncated,
      value: value.slice(0, state.budgets.maxStringLength),
      valueType: "string",
    };
  }
  const valueType =
    value === null
      ? "null"
      : value === undefined
        ? "undefined"
        : typeof value === "bigint"
          ? "bigint"
          : typeof value === "boolean"
            ? "boolean"
            : "number";
  return { kind: "scalar", value: String(value), valueType };
}

function pruneObject(
  record: Record<string, unknown>,
  depth: number,
  state: PruneState,
): RawObjectNode {
  const entries: (readonly [string, RawValueNode])[] = [];
  const sourceEntries = Object.entries(record);
  for (const [key, value] of sourceEntries) {
    if (state.nodes >= state.budgets.maxTotalNodes) {
      state.truncated = true;
      break;
    }
    entries.push([key, pruneValue(value, depth + 1, state)]);
  }
  return {
    ...(entries.length < sourceEntries.length
      ? { droppedEntries: sourceEntries.length - entries.length }
      : {}),
    entries,
    kind: "object",
  };
}

function boundedJson(
  value: Record<string, unknown>,
  prune: RawRecordPruneBudgets | undefined,
) {
  return JSON.stringify(
    rawNodeToJson(pruneRawRecord(value, prune).root),
    null,
    2,
  );
}

function rawNodeToJson(node: RawValueNode): unknown {
  switch (node.kind) {
    case "scalar":
      if (node.valueType === "number") return Number(node.value);
      if (node.valueType === "boolean") return node.value === "true";
      if (node.valueType === "null" || node.valueType === "undefined") {
        return null;
      }
      return node.truncated ? `${node.value}…` : node.value;
    case "bytes":
      return `<${node.byteLength} bytes: ${node.preview}>`;
    case "array":
      return node.items.map(rawNodeToJson);
    case "object":
      return Object.fromEntries(
        node.entries.map(([key, value]) => [key, rawNodeToJson(value)]),
      );
    case "truncated":
      return "…";
  }
}
