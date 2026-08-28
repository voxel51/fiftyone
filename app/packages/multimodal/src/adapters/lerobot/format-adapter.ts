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
  STREAM_CATEGORY,
  STREAM_COUNT_NOUN,
  STREAM_KIND,
  STREAM_METADATA,
  VISUALIZATION_KIND,
  recordingSupportFactsFromStreams,
  type DecodedFrame,
  type DecodedOutput,
  type EncodedVideoVisualization,
  type EpisodeManifest,
  type EpisodePreviewNativeVideo,
  type EpisodePosterFrame,
  type EpisodePreviewReadResult,
  type RawObjectNode,
  type RawRecordIndexWindow,
  type RawRecordPruneBudgets,
  type RawRecordResult,
  type RawValueNode,
  type StreamDescriptor,
  type StreamCategory,
  type SynchronizedFrameWindow,
  type TimeWindow,
} from "../../ir";
import {
  EpisodeExactCursorError,
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
  type StateActionCapability,
  type StateActionDimensionExtreme,
  type StateActionEpisodeProfile,
  type StateActionFeatureProfile,
  type StateActionFeatureSchema,
  type StateActionFeatureStats,
  type StateActionRow,
  type StateActionSchema,
  type StateActionStats,
  type StateActionTimingGap,
  type StateActionTimingProfile,
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
const TASKS_ROLE = "tasks-metadata";
const STATISTICS_ROLE = "dataset-statistics";
const VIDEO_ROLE = "video-stream";
const RAW_STREAM_ID = "lerobot:rows";
const STATE_FEATURE_NAME = "observation.state";
const ACTION_FEATURE_NAME = "action";
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

/** Byte ceilings that switch the state/action slab to bounded block reads. */
export interface StateActionSlabLimits {
  /** Rows-per-block read budget once the whole slab exceeds the ceiling. */
  readonly blockBytes: number;
  /** Largest estimated slab decoded as one physical read. */
  readonly maxSingleSlabBytes: number;
}

const DEFAULT_STATE_ACTION_SLAB_LIMITS: StateActionSlabLimits = {
  blockBytes: 8 * 1024 * 1024,
  maxSingleSlabBytes: 32 * 1024 * 1024,
};

/** Test seams for the browser-native LeRobot readers. */
export interface CreateLeRobotFormatAdapterOptions {
  readonly readParquetObjects?: ParquetReader;
  readonly stateActionSlabLimits?: StateActionSlabLimits;
}

/**
 * Declared dimension names as LeRobot writes them: a flat list, a nested
 * per-axis list, or a dict of axis lists (DROID-style `{"axes": [...]}`).
 */
type LeRobotFeatureNames =
  | readonly (string | null | readonly string[])[]
  | Readonly<Record<string, unknown>>;

interface LeRobotFeature {
  readonly dtype: string;
  readonly info?: Readonly<Record<string, unknown>>;
  readonly names?: LeRobotFeatureNames | null;
  readonly shape?: readonly number[];
}

interface LeRobotInfo {
  readonly codebase_version?: string;
  readonly features: Readonly<Record<string, LeRobotFeature>>;
  readonly fps: number;
  readonly robot_type?: string;
}

type LeRobotRawStreamBinding = {
  readonly schemaName: string;
  readonly sourceName: string;
  readonly streamId: string;
} & (
  | { readonly kind: "row" }
  | {
      readonly feature: LeRobotFeature;
      readonly featureName: string;
      readonly kind: "feature";
    }
);

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
  const stateActionSlabLimits =
    options.stateActionSlabLimits ?? DEFAULT_STATE_ACTION_SLAB_LIMITS;
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
      stateActionSlabLimits,
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
      .filter(isPreviewableCameraStream)
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
    const readDurationNs = request.decodeLookaheadNs
      ? maxOfBigInts([
          frameDurationNs,
          request.decodeLookaheadNs + frameDurationNs,
        ])
      : frameDurationNs;
    let frames: readonly DecodedFrame[] = [];
    if (isGridFrameDecoderCameraStream(selected)) {
      for await (const batch of this.session.read({
        priority: options.priority,
        signal: options.signal,
        streams: [selected.id],
        window: {
          endNs: minBigInt(selected.timeRange.endNs, startNs + readDurationNs),
          startNs,
        },
      })) {
        frames = batch.frames;
        break;
      }
    }
    const nativeVideo = await this.session.resolveNativePreviewVideo(
      selected.id,
      options.signal,
    );
    this.ensureOpen();
    throwIfAborted(options.signal);
    const decoded = firstFrameAtOrAfter(frames, startNs);
    const frame = decoded ? posterFrame(decoded) : null;
    const videoDecodeRunway = request.decodeLookaheadNs
      ? frames.flatMap((candidate) => {
          const poster = posterFrame(candidate);
          return poster?.kind === "image" &&
            poster.image.kind === "encoded-video"
            ? [poster]
            : [];
        })
      : undefined;
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
      ...(nativeVideo ? { nativeVideo } : {}),
      nextStartTimeNs:
        nextStartTimeNs !== undefined &&
        nextStartTimeNs <= selected.timeRange.endNs
          ? nextStartTimeNs
          : undefined,
      streamId: selected.id,
      streamSourceName: selected.sourceName,
      streamSourceNames,
      status: frame || nativeVideo ? "ready" : "empty",
      ...(videoDecodeRunway?.length ? { videoDecodeRunway } : {}),
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
  readonly rawStreamBindings: readonly LeRobotRawStreamBinding[];
  readonly scalarFeatures: ReadonlyMap<string, LeRobotFeature>;
  readonly stateAction?: StateActionCapability;
  readonly videoBindings: ReadonlyMap<string, VideoBinding>;
  private readonly rowCache = new Map<
    string,
    Promise<readonly Record<string, unknown>[]>
  >();
  private readonly stateActionBlocks = new Map<
    number,
    Promise<readonly Record<string, unknown>[]>
  >();
  private stateActionProfile: Promise<StateActionEpisodeProfile> | null = null;
  private stateActionStats: Promise<StateActionStats | null> | null = null;
  private stateActionTasks: Promise<ReadonlyMap<number, string> | null> | null =
    null;
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
      readonly stateActionSlabLimits: StateActionSlabLimits;
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
          return [
            imageStream(
              name,
              feature,
              timeRange,
              state.info.fps,
              state.episodeRows.rows.length,
            ),
          ];
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
    this.rawStreamBindings = [
      {
        kind: "row",
        schemaName: "LeRobotDataset v3 row",
        sourceName: "Episode rows",
        streamId: RAW_STREAM_ID,
      },
      ...[...scalarFeatures.entries()].map(([streamId, feature]) => ({
        feature,
        featureName: featureNameForStream(streamId),
        kind: "feature" as const,
        schemaName: `${feature.dtype}${shapeSuffix(feature.shape)}`,
        sourceName: featureNameForStream(streamId),
        streamId,
      })),
    ];
    this.manifest = {
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
      recordingFacts: leRobotRecordingFacts({
        episode: state.episodeRows.episode,
        fps: state.info.fps,
        streams,
        features: state.info.features,
        rowCount: state.episodeRows.rows.length,
        codebaseVersion: state.info.codebase_version,
        robotType: state.info.robot_type,
        timeRange,
      }),
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
    this.stateAction = this.createStateActionCapability();
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
    this.stateActionBlocks.clear();
    this.stateActionProfile = null;
    this.stateActionStats = null;
    this.stateActionTasks = null;
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

  async resolveNativePreviewVideo(
    streamId: string,
    signal?: AbortSignal,
  ): Promise<EpisodePreviewNativeVideo | undefined> {
    const binding = this.videoBindings.get(streamId);
    if (!binding) return undefined;
    const index = await this.readVideoIndex(binding, signal);
    const codecString = index.track.codec;
    const codec = codecFamily(codecString);
    if (codec === "unknown") return undefined;
    const source = await this.state.source.assets.resolve(binding.asset.id, {
      signal,
    });
    throwIfAborted(signal);
    return {
      codec,
      codecString,
      endTimeSeconds: binding.toSeconds,
      source,
      startTimeSeconds: binding.fromSeconds,
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
    const declaredCodec = codecFamily(videoCodec(binding.feature));
    if (declaredCodec !== "h264" && declaredCodec !== "av1") return [];
    const index = await this.readVideoIndex(binding, request.signal);
    const containerCodec = codecFamily(index.track.codec);
    if (containerCodec !== declaredCodec) {
      throw new Error(
        `LeRobot video codec mismatch: manifest '${videoCodec(binding.feature)}', MP4 '${index.track.codec}'`,
      );
    }
    const samples = selectVideoSamples(index, binding, request.window);
    if (!samples.length) return [];
    const bytes = await this.readSampleSpan(
      binding.asset,
      samples,
      request.signal,
    );
    const avc =
      declaredCodec === "h264"
        ? (samples[0].description as Mp4SampleDescription).avcC
        : undefined;
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
          declaredCodec === "h264"
            ? mp4SampleToAnnexB(
                bytes.subarray(offset, offset + sample.size),
                lengthSize,
              )
            : bytes.slice(offset, offset + sample.size),
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
    const baseTimeNs = this.manifest.timeRange.startNs;
    const timesSec = frames.map((frame) =>
      nsDeltaToSeconds(frame.timestampNs - baseTimeNs),
    );
    let truncated = false;
    return {
      baseTimeNs,
      // Decimation is per field: each signal keeps its own extremes, so a
      // budgeted read never aliases one field's spikes away to fit another.
      fields: request.fields.map((path) => {
        const values = frames.map(
          (frame) =>
            frame.output.scalars?.find((scalar) => scalar.field === path)
              ?.value ?? Number.NaN,
        );
        const picked = minMaxSampledIndexes(values, request.maxPointsPerField);
        truncated ||= picked.length < values.length;
        return {
          path,
          timesSec: Float64Array.from(picked.map((index) => timesSec[index])),
          values: Float64Array.from(picked.map((index) => values[index])),
        };
      }),
      sampleCount: frames.length,
      streamId: request.stream,
      truncated,
    };
  }

  private createRawRecordCapability(): RawRecordCapability {
    const rows = this.state.episodeRows.rows;
    const streamBindings = this.rawStreamBindings;
    const requireStream = (stream: string) => {
      const binding = streamBindings.find(
        (candidate) => candidate.streamId === stream,
      );
      if (!binding) {
        throw new Error(`Unknown LeRobot raw-record stream '${stream}'`);
      }
      return binding;
    };
    const readAt = async (
      rowOffset: number,
      binding: LeRobotRawStreamBinding,
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
        binding.kind === "feature"
          ? ["timestamp", "frame_index", binding.featureName]
          : undefined,
        options.signal,
        rowOffset,
        rowOffset + 1,
      );
      const row = selected[0];
      const timeline = rows[rowOffset];
      if (!row || !timeline) {
        return emptyRawRecord(this.manifest.timeRange, binding);
      }
      const record =
        binding.kind === "feature"
          ? scalarRawRecord(
              binding.featureName,
              binding.feature,
              row[binding.featureName],
            )
          : row;
      const pruned = pruneRawRecord(record, options.prune);
      const next = rows[rowOffset + 1]?.localTimeNs;
      return {
        cursor: rawCursor(rowOffset),
        encoding: "parquet",
        ...(options.includeFullJson
          ? { fullJson: boundedJson(record, options.prune) }
          : {}),
        root: pruned.root,
        schemaName: binding.schemaName,
        sequence: timeline.frameIndex,
        sourceName: binding.sourceName,
        sourceTimestamps: {
          lerobot: secondsToNs(timeline.sourceTimeSeconds),
        },
        status: "ok",
        streamId: binding.streamId,
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
        return streamBindings.map((binding) => ({
          encoding: "parquet",
          sampleCount: rows.length,
          schemaName: binding.schemaName,
          sourceName: binding.sourceName,
          streamId: binding.streamId,
          supportsExactBrowsing: true,
        }));
      },
      readRawRecord: async (request) => {
        const binding = requireStream(request.stream);
        const offset = rowAtOrBefore(rows, request.timestampNs);
        return offset === null
          ? emptyRawRecord(this.manifest.timeRange, binding)
          : readAt(offset, binding, request);
      },
      readRawRecordAtCursor: async (request) => {
        const binding = requireStream(request.stream);
        return readAt(
          parseRawCursor(request.cursor, rows.length),
          binding,
          request,
        );
      },
      readRawRecordIndexWindow: async (request) => {
        requireStream(request.stream);
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

  private createStateActionCapability(): StateActionCapability | undefined {
    const stateFeature = this.scalarFeatures.get(
      streamIdForFeature(STATE_FEATURE_NAME),
    );
    const actionFeature = this.scalarFeatures.get(
      streamIdForFeature(ACTION_FEATURE_NAME),
    );
    if (!stateFeature && !actionFeature) return undefined;
    const rows = this.state.episodeRows.rows;
    const config: StateActionReadConfig = {
      action: actionFeature,
      blockRows: stateActionBlockRowCount(
        rows.length,
        [stateFeature, actionFeature].filter(
          (feature): feature is LeRobotFeature => feature !== undefined,
        ),
        this.state.stateActionSlabLimits,
      ),
      columns: [
        "timestamp",
        "frame_index",
        "task_index",
        ...(stateFeature ? [STATE_FEATURE_NAME] : []),
        ...(actionFeature ? [ACTION_FEATURE_NAME] : []),
      ],
      state: stateFeature,
    };
    const schema: StateActionSchema = {
      ...(actionFeature
        ? {
            action: stateActionFeatureSchema(
              ACTION_FEATURE_NAME,
              actionFeature,
            ),
          }
        : {}),
      rowCount: rows.length,
      ...(stateFeature
        ? { state: stateActionFeatureSchema(STATE_FEATURE_NAME, stateFeature) }
        : {}),
    };
    return {
      schema,
      readAtCursor: async (request) => {
        this.ensureOpen();
        throwIfAborted(request.signal);
        return this.readStateActionRow(
          parseStateActionCursor(request.cursor, rows.length),
          config,
          request.signal,
        );
      },
      readAtTime: async (request) => {
        this.ensureOpen();
        throwIfAborted(request.signal);
        if (request.timestampNs > this.manifest.timeRange.endNs) return null;
        const offset = rowAtOrBefore(rows, request.timestampNs);
        return offset === null
          ? null
          : this.readStateActionRow(offset, config, request.signal);
      },
      readDimensionStats: async (options) => {
        this.ensureOpen();
        throwIfAborted(options?.signal);
        const stats = await waitForSharedRead(
          this.stateActionStatsFill(stateFeature, actionFeature),
          options?.signal,
        );
        throwIfAborted(options?.signal);
        this.ensureOpen();
        return stats;
      },
      readEpisodeProfile: async (options) => {
        this.ensureOpen();
        throwIfAborted(options?.signal);
        const profile = await waitForSharedRead(
          this.stateActionProfileFill(config, schema),
          options?.signal,
        );
        throwIfAborted(options?.signal);
        this.ensureOpen();
        return profile;
      },
      readIndexWindow: async (request) => {
        this.ensureOpen();
        throwIfAborted(request.signal);
        const selected =
          request.anchorCursor !== undefined
            ? parseStateActionCursor(request.anchorCursor, rows.length)
            : (rowAtOrBefore(rows, request.anchorTimestampNs) ?? 0);
        const start = Math.max(0, selected - Math.max(0, request.before));
        const end = Math.min(
          rows.length,
          selected + Math.max(0, request.after) + 1,
        );
        return {
          entries: rows.slice(start, end).map((row) => ({
            cursor: rawCursor(row.rowOffset),
            timestampNs: row.localTimeNs,
          })),
          hasNext: end < rows.length,
          hasPrevious: start > 0,
          selectedCursor: rawCursor(selected),
        };
      },
    };
  }

  private async readStateActionRow(
    offset: number,
    config: StateActionReadConfig,
    signal?: AbortSignal,
  ): Promise<StateActionRow> {
    const blockIndex = Math.floor(offset / config.blockRows);
    const [block, taskLabels] = await Promise.all([
      waitForSharedRead(this.stateActionBlock(blockIndex, config), signal),
      waitForSharedRead(this.stateActionTaskLabels(), signal),
    ]);
    throwIfAborted(signal);
    this.ensureOpen();
    const timeline = this.state.episodeRows.rows[offset];
    const row = block[offset - blockIndex * config.blockRows];
    if (!row || !timeline) {
      throw new Error("LeRobot state/action row is unavailable");
    }
    const state = config.state
      ? stateActionVector(STATE_FEATURE_NAME, config.state, row)
      : undefined;
    const action = config.action
      ? stateActionVector(ACTION_FEATURE_NAME, config.action, row)
      : undefined;
    const taskIndex = optionalInteger(row.task_index);
    const label =
      taskIndex !== null
        ? (taskLabels?.get(taskIndex) ??
          singleEpisodeTask(this.state.episodeRows.episode))
        : undefined;
    return {
      ...(action?.values ? { action: action.values } : {}),
      cursor: rawCursor(offset),
      ...(state?.error || action?.error
        ? {
            featureErrors: {
              ...(action?.error ? { action: action.error } : {}),
              ...(state?.error ? { state: state.error } : {}),
            },
          }
        : {}),
      frameIndex: timeline.frameIndex,
      ...(state?.values ? { state: state.values } : {}),
      ...(taskIndex !== null
        ? {
            task: {
              index: taskIndex,
              ...(label !== undefined ? { label } : {}),
            },
          }
        : {}),
      timestampNs: timeline.localTimeNs,
    };
  }

  private stateActionBlock(blockIndex: number, config: StateActionReadConfig) {
    let cached = this.stateActionBlocks.get(blockIndex);
    if (!cached) {
      const rowCount = this.state.episodeRows.rows.length;
      const start = blockIndex * config.blockRows;
      // The shared block fill is deliberately unbound from caller signals so
      // an aborted trigger cannot poison the session-lifetime cache.
      cached = readSelectedParquetRows(
        this.state.source,
        this.state.io,
        this.state.episodeRows.dataAsset,
        this.state.readObjects,
        [...config.columns],
        undefined,
        start,
        Math.min(rowCount, start + config.blockRows),
      );
      this.stateActionBlocks.set(blockIndex, cached);
      void cached.catch(() => {
        if (this.stateActionBlocks.get(blockIndex) === cached) {
          this.stateActionBlocks.delete(blockIndex);
        }
      });
    }
    return cached;
  }

  private stateActionStatsFill(
    stateFeature: LeRobotFeature | undefined,
    actionFeature: LeRobotFeature | undefined,
  ) {
    if (!this.stateActionStats) {
      const asset = this.state.assets.find(
        (candidate) => candidate.role === STATISTICS_ROLE,
      );
      // Statistics are reference context; a missing or unreadable stats
      // asset must never block row inspection.
      this.stateActionStats = asset
        ? readStateActionStats(
            this.state.source,
            this.state.io,
            asset,
            stateFeature,
            actionFeature,
          ).catch(() => null)
        : Promise.resolve(null);
    }
    return this.stateActionStats;
  }

  private stateActionProfileFill(
    config: StateActionReadConfig,
    schema: StateActionSchema,
  ) {
    if (!this.stateActionProfile) {
      // The shared profile fill is deliberately unbound from caller signals
      // so an aborted trigger cannot poison the session-lifetime cache.
      const started = this.computeStateActionProfile(config, schema);
      this.stateActionProfile = started;
      void started.catch(() => {
        if (this.stateActionProfile === started) {
          this.stateActionProfile = null;
        }
      });
    }
    return this.stateActionProfile;
  }

  private async computeStateActionProfile(
    config: StateActionReadConfig,
    schema: StateActionSchema,
  ): Promise<StateActionEpisodeProfile> {
    const rows = this.state.episodeRows.rows;
    // Declared statistics only bound the out-of-range counts; their
    // absence must never block the episode-computed profile.
    const declared = await this.stateActionStatsFill(
      config.state,
      config.action,
    );
    const state = schema.state
      ? createStateActionAggregator(
          schema.state.dimensions.length,
          declared?.state,
        )
      : null;
    const action = schema.action
      ? createStateActionAggregator(
          schema.action.dimensions.length,
          declared?.action,
        )
      : null;
    const tracking =
      schema.state &&
      schema.action &&
      schema.state.dimensions.length === schema.action.dimensions.length
        ? createStateActionTrackingAggregator(schema.state.dimensions.length)
        : null;
    const blockCount = Math.ceil(rows.length / config.blockRows);
    for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
      const block = await this.stateActionBlock(blockIndex, config);
      this.ensureOpen();
      for (let inBlock = 0; inBlock < block.length; inBlock += 1) {
        const timeline = rows[blockIndex * config.blockRows + inBlock];
        if (!timeline) continue;
        const raw = block[inBlock];
        const stateValues =
          config.state && raw[STATE_FEATURE_NAME] !== undefined
            ? flattenStateActionSource(raw[STATE_FEATURE_NAME])
            : undefined;
        const actionValues =
          config.action && raw[ACTION_FEATURE_NAME] !== undefined
            ? flattenStateActionSource(raw[ACTION_FEATURE_NAME])
            : undefined;
        if (stateValues) {
          state?.accumulate(
            stateValues,
            timeline.frameIndex,
            timeline.localTimeNs,
          );
        }
        if (actionValues) {
          action?.accumulate(
            actionValues,
            timeline.frameIndex,
            timeline.localTimeNs,
          );
        }
        if (stateValues && actionValues) {
          tracking?.accumulate(stateValues, actionValues);
        }
      }
    }
    const trackingError = tracking?.finish();
    return {
      ...(action ? { action: action.finish() } : {}),
      rowCount: rows.length,
      ...(state ? { state: state.finish() } : {}),
      timing: stateActionTimingProfile(rows),
      ...(trackingError ? { trackingError } : {}),
    };
  }

  private stateActionTaskLabels() {
    if (!this.stateActionTasks) {
      const asset = this.state.assets.find(
        (candidate) => candidate.role === TASKS_ROLE,
      );
      // Task labels are a fallback ladder rung; a missing or unreadable
      // tasks asset must never block state/action inspection.
      this.stateActionTasks = asset
        ? readTaskLabels(
            this.state.source,
            this.state.io,
            asset,
            this.state.readObjects,
          ).catch(() => null)
        : Promise.resolve(null);
    }
    return this.stateActionTasks;
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
  let compositionOffsetSeconds = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    compositionOffsetSeconds = Math.min(
      compositionOffsetSeconds,
      sample.cts / videoTrack.timescale,
    );
  }
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
    metadata: streamMetadata(feature.dtype, feature.dtype, "decodable", {
      [STREAM_METADATA.CATEGORY]: leRobotCategory(name),
      [STREAM_METADATA.COUNT_NOUN]: STREAM_COUNT_NOUN.SAMPLES,
      [STREAM_METADATA.INSPECTABLE]: "true",
    }),
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
  count: number,
): StreamDescriptor {
  return {
    approxRateHz: fps,
    count,
    id: streamIdForFeature(name),
    kind: STREAM_KIND.IMAGE,
    metadata: {
      ...streamMetadata("parquet-image", feature.dtype, "decodable"),
      [STREAM_METADATA.CATEGORY]: leRobotCategory(name),
      [STREAM_METADATA.COUNT_NOUN]: STREAM_COUNT_NOUN.FRAMES,
      [STREAM_METADATA.INSPECTABLE]: "false",
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
  const family = codecFamily(codec);
  const supported = family === "h264" || family === "av1";
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
      [STREAM_METADATA.CATEGORY]: leRobotCategory(name),
      [STREAM_METADATA.INSPECTABLE]: "false",
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
      {
        [STREAM_METADATA.CATEGORY]: leRobotCategory(name),
        [STREAM_METADATA.INSPECTABLE]: "false",
      },
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
  additional: Readonly<Record<string, string>> = {},
) {
  return {
    ...additional,
    [STREAM_METADATA.DECODE_STATUS]: status,
    [STREAM_METADATA.ENCODING]: encoding,
    [STREAM_METADATA.SCHEMA_NAME]: schema,
  };
}

function leRobotCategory(name: string): StreamCategory {
  if (name === "action" || name.startsWith("action.")) {
    return STREAM_CATEGORY.ACTIONS;
  }
  if (name.startsWith("observation.")) {
    return STREAM_CATEGORY.OBSERVATIONS;
  }
  if (
    /(?:^|[._/])(instruction|language|task|prompt|text)(?:[._/]|$)/i.test(name)
  ) {
    return STREAM_CATEGORY.INSTRUCTIONS;
  }
  return STREAM_CATEGORY.CUSTOM;
}

function leRobotRecordingFacts({
  codebaseVersion,
  episode,
  features,
  fps,
  robotType,
  rowCount,
  streams,
  timeRange,
}: {
  readonly codebaseVersion?: string;
  readonly episode: Record<string, unknown>;
  readonly features: Readonly<Record<string, LeRobotFeature>>;
  readonly fps: number;
  readonly robotType?: string;
  readonly rowCount: number;
  readonly streams: readonly StreamDescriptor[];
  readonly timeRange: TimeWindow;
}) {
  const tasks = Array.isArray(episode.tasks)
    ? episode.tasks.filter((task): task is string => typeof task === "string")
    : [];
  const codecs = [
    ...new Set(
      Object.values(features)
        .filter((feature) => feature.dtype === "video")
        .map(videoCodec)
        .filter((codec) => codec !== "unknown"),
    ),
  ];
  const mediaFeatureCount = Object.values(features).filter(
    (feature) => feature.dtype === "image" || feature.dtype === "video",
  ).length;
  const episodeIndex = integer(episode.episode_index, "episode_index");
  return {
    applicationSupport: recordingSupportFactsFromStreams(streams),
    durationNs: (timeRange.endNs - timeRange.startNs).toString(),
    format: "lerobot",
    lerobot: {
      ...(codebaseVersion ? { codebaseVersion } : {}),
      ...(episodeIndex >= 0n ? { episodeIndex: episodeIndex.toString() } : {}),
      featureCount: Object.keys(features).length,
      fps,
      logicalRowCount: rowCount,
      mediaFeatureCount,
      ...(robotType ? { robotType } : {}),
      ...(tasks.length ? { taskLabels: tasks } : {}),
      ...(codecs.length ? { videoCodecs: codecs } : {}),
    },
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

function isGridFrameDecoderCameraStream(stream: StreamDescriptor) {
  return (
    stream.metadata?.[SCENE_SOURCE_METADATA.TYPE] === SCENE_SOURCE_TYPE.IMAGE &&
    stream.metadata?.[STREAM_METADATA.DECODE_STATUS] === "decodable" &&
    (stream.kind !== STREAM_KIND.VIDEO ||
      codecFamily(stream.metadata?.["lerobot.codec"] ?? "") === "h264")
  );
}

/**
 * The AV1 grid path deliberately stays browser-native even though the shared
 * synchronized decoder supports AV1 in the modal. Keep that policy local to
 * previews so grid reads do not start a redundant WebCodecs pipeline.
 */
function isPreviewableCameraStream(stream: StreamDescriptor) {
  if (isGridFrameDecoderCameraStream(stream)) return true;
  return (
    stream.kind === STREAM_KIND.VIDEO &&
    stream.metadata?.[SCENE_SOURCE_METADATA.TYPE] === SCENE_SOURCE_TYPE.IMAGE &&
    codecFamily(stream.metadata?.["lerobot.codec"] ?? "") === "av1"
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
  const names = featureDimensionNames(feature);
  return names.map((name, index) => {
    return name
      ? `${featureName}.${name}`
      : names.length === 1
        ? featureName
        : `${featureName}[${index}]`;
  });
}

/**
 * Declared per-dimension names in row-major order. A flat list stays
 * positional (a shorter list leaves trailing dimensions unnamed); nested
 * lists and axis dicts are used only when they flatten to exactly one
 * string per dimension, never realigned by guesswork.
 */
function featureDimensionNames(
  feature: LeRobotFeature,
): readonly (string | undefined)[] {
  const count = Math.max(1, numericElementCount(feature.shape));
  const names = feature.names;
  if (
    Array.isArray(names) &&
    names.every((entry) => typeof entry === "string" || entry === null)
  ) {
    return Array.from({ length: count }, (_, index) => {
      const name = names[index];
      return typeof name === "string" ? name : undefined;
    });
  }
  const flattened = flattenDeclaredNames(names);
  if (
    flattened.length === count &&
    flattened.every((name) => typeof name === "string")
  ) {
    return flattened;
  }
  return Array.from({ length: count }, () => undefined);
}

function flattenDeclaredNames(names: unknown): readonly (string | undefined)[] {
  if (Array.isArray(names)) {
    return names.flatMap((entry) =>
      typeof entry === "string" ? [entry] : flattenDeclaredNames(entry),
    );
  }
  if (names && typeof names === "object") {
    return Object.values(names).flatMap((value) => flattenDeclaredNames(value));
  }
  return [];
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

/**
 * Peak-preserving decimation: every bucket keeps its extreme samples in
 * time order, so a budgeted series never aliases spikes away the way a
 * uniform stride does. An all-gap bucket keeps one sample so decoded gap
 * markers stay visible.
 */
function minMaxSampledIndexes(
  values: readonly number[],
  maxPoints: number | undefined,
): readonly number[] {
  const length = values.length;
  if (!maxPoints || maxPoints <= 0 || length <= maxPoints) {
    return Array.from({ length }, (_, index) => index);
  }
  if (maxPoints === 1) return [0];
  const buckets = Math.max(1, Math.floor(maxPoints / 2));
  const picked: number[] = [];
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = Math.floor((bucket * length) / buckets);
    const end = Math.max(
      start + 1,
      Math.floor(((bucket + 1) * length) / buckets),
    );
    let minIndex = -1;
    let maxIndex = -1;
    for (let index = start; index < end && index < length; index += 1) {
      const value = values[index];
      if (!Number.isFinite(value)) continue;
      if (minIndex < 0 || value < values[minIndex]) minIndex = index;
      if (maxIndex < 0 || value > values[maxIndex]) maxIndex = index;
    }
    if (minIndex < 0) {
      picked.push(start);
      continue;
    }
    const first = Math.min(minIndex, maxIndex);
    const second = Math.max(minIndex, maxIndex);
    picked.push(first);
    if (second !== first) picked.push(second);
  }
  return picked;
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

interface StateActionReadConfig {
  readonly action?: LeRobotFeature;
  readonly blockRows: number;
  readonly columns: readonly string[];
  readonly state?: LeRobotFeature;
}

function stateActionFeatureSchema(
  featureName: string,
  feature: LeRobotFeature,
): StateActionFeatureSchema {
  const names = featureDimensionNames(feature);
  const fieldPaths = scalarFieldNames(featureName, feature);
  return {
    dimensions: names.map((name, index) => {
      return {
        index,
        ...(typeof name === "string" ? { name } : {}),
        ...(fieldPaths[index] ? { numericFieldPath: fieldPaths[index] } : {}),
      };
    }),
    dtype: feature.dtype,
    featureName,
    numericStreamId: streamIdForFeature(featureName),
    shape: feature.shape ?? [],
  };
}

function stateActionVector(
  featureName: string,
  feature: LeRobotFeature,
  row: Record<string, unknown>,
): { readonly error?: string; readonly values?: readonly unknown[] } {
  if (!(featureName in row) || row[featureName] === undefined) {
    return { error: `'${featureName}' column is missing from this row` };
  }
  const values = flattenStateActionSource(row[featureName]);
  const expected = Math.max(1, numericElementCount(feature.shape));
  if (values.length === expected) return { values };
  return {
    error: `'${featureName}' row has ${values.length} values but declares shape [${(
      feature.shape ?? []
    ).join(",")}]`,
    values,
  };
}

function flattenStateActionSource(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenStateActionSource(entry));
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return [...(value as unknown as Iterable<unknown>)];
  }
  return [value];
}

function stateActionBlockRowCount(
  rowCount: number,
  features: readonly LeRobotFeature[],
  limits: StateActionSlabLimits,
): number {
  const rowBytes = features.reduce(
    (total, feature) =>
      total +
      Math.max(1, numericElementCount(feature.shape)) *
        stateActionDtypeBytes(feature.dtype),
    24,
  );
  if (rowBytes * rowCount <= limits.maxSingleSlabBytes) {
    return Math.max(1, rowCount);
  }
  return Math.max(1, Math.floor(limits.blockBytes / rowBytes));
}

function stateActionDtypeBytes(dtype: string): number {
  if (/64/.test(dtype)) return 8;
  if (/32/.test(dtype)) return 4;
  if (/16/.test(dtype)) return 2;
  if (/^(?:bool|int8|uint8)/.test(dtype)) return 1;
  return 8;
}

/** Largest-first gap samples kept on a timing profile. */
const STATE_ACTION_TIMING_GAP_CAP = 8;

function createStateActionAggregator(
  dimensionCount: number,
  declared: StateActionFeatureStats | undefined,
): {
  accumulate(
    values: readonly unknown[],
    frameIndex: number,
    timestampNs: bigint,
  ): void;
  finish(): StateActionFeatureProfile;
} {
  const min: (StateActionDimensionExtreme | null)[] = Array.from(
    { length: dimensionCount },
    () => null,
  );
  const max: (StateActionDimensionExtreme | null)[] = Array.from(
    { length: dimensionCount },
    () => null,
  );
  const sums = new Array<number>(dimensionCount).fill(0);
  const counts = new Array<number>(dimensionCount).fill(0);
  const outOfRange = declared
    ? new Array<number>(dimensionCount).fill(0)
    : null;
  const declaredBound = (index: number) => {
    const low = declared?.min?.[index];
    const high = declared?.max?.[index];
    return Number.isFinite(low) && Number.isFinite(high)
      ? { high: high as number, low: low as number }
      : null;
  };
  const bounds = Array.from({ length: dimensionCount }, (_, index) =>
    declaredBound(index),
  );
  return {
    accumulate(values, frameIndex, timestampNs) {
      for (let index = 0; index < dimensionCount; index += 1) {
        const value = values[index];
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        sums[index] += value;
        counts[index] += 1;
        const currentMin = min[index];
        if (currentMin === null || value < currentMin.value) {
          min[index] = { frameIndex, timestampNs, value };
        }
        const currentMax = max[index];
        if (currentMax === null || value > currentMax.value) {
          max[index] = { frameIndex, timestampNs, value };
        }
        const bound = bounds[index];
        if (outOfRange && bound && (value < bound.low || value > bound.high)) {
          outOfRange[index] += 1;
        }
      }
    },
    finish() {
      return {
        max,
        mean: counts.map((count, index) =>
          count > 0 ? sums[index] / count : null,
        ),
        min,
        outOfRangeCounts: outOfRange
          ? outOfRange.map((count, index) =>
              bounds[index] !== null ? count : null,
            )
          : null,
      };
    },
  };
}

function createStateActionTrackingAggregator(dimensionCount: number): {
  accumulate(state: readonly unknown[], action: readonly unknown[]): void;
  finish(): readonly (number | null)[];
} {
  const sums = new Array<number>(dimensionCount).fill(0);
  const counts = new Array<number>(dimensionCount).fill(0);
  return {
    accumulate(state, action) {
      for (let index = 0; index < dimensionCount; index += 1) {
        const stateValue = state[index];
        const actionValue = action[index];
        if (
          typeof stateValue !== "number" ||
          !Number.isFinite(stateValue) ||
          typeof actionValue !== "number" ||
          !Number.isFinite(actionValue)
        ) {
          continue;
        }
        sums[index] += Math.abs(actionValue - stateValue);
        counts[index] += 1;
      }
    },
    finish() {
      return counts.map((count, index) =>
        count > 0 ? sums[index] / count : null,
      );
    },
  };
}

/**
 * Recorded-cadence facts from the already-loaded timeline rows: median
 * inter-row interval plus the intervals exceeding 1.5× that median, so a
 * single dropped frame at a steady rate registers while jitter does not.
 */
function stateActionTimingProfile(
  rows: readonly TimelineRow[],
): StateActionTimingProfile {
  if (rows.length < 2) {
    return { gapCount: 0, gaps: [], medianIntervalNs: 0n };
  }
  const intervals = rows.slice(1).map((row, index) => ({
    beforeFrameIndex: rows[index].frameIndex,
    durationNs: row.localTimeNs - rows[index].localTimeNs,
    timestampNs: row.localTimeNs,
  }));
  const sorted = intervals
    .map((interval) => interval.durationNs)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const medianIntervalNs =
    (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2n;
  const gaps: StateActionTimingGap[] = intervals
    .filter(
      (interval) =>
        medianIntervalNs > 0n &&
        interval.durationNs * 2n > medianIntervalNs * 3n,
    )
    .sort((a, b) =>
      a.durationNs < b.durationNs ? 1 : a.durationNs > b.durationNs ? -1 : 0,
    );
  return {
    gapCount: gaps.length,
    gaps: gaps.slice(0, STATE_ACTION_TIMING_GAP_CAP),
    medianIntervalNs,
  };
}

function parseStateActionCursor(cursor: string, rowCount: number): number {
  try {
    return parseRawCursor(cursor, rowCount);
  } catch {
    throw new EpisodeExactCursorError(
      "Unknown LeRobot state/action row cursor for this episode",
    );
  }
}

function singleEpisodeTask(
  episode: Record<string, unknown>,
): string | undefined {
  const tasks = episode.tasks;
  return Array.isArray(tasks) &&
    tasks.length === 1 &&
    typeof tasks[0] === "string"
    ? tasks[0]
    : undefined;
}

async function readTaskLabels(
  source: EpisodeSource,
  io: ByteResources,
  asset: AssetDescriptor,
  readObjects: ParquetReader,
): Promise<ReadonlyMap<number, string>> {
  const rows = await readObjects({
    columns: ["task_index", "task"],
    file: asyncBufferForSource(asset, source, io),
  });
  const labels = new Map<number, string>();
  for (const row of rows) {
    const index = optionalInteger(row.task_index);
    if (index !== null && typeof row.task === "string") {
      labels.set(index, row.task);
    }
  }
  return labels;
}

const STATE_ACTION_STAT_KEYS = [
  "max",
  "mean",
  "min",
  "q01",
  "q50",
  "q99",
  "std",
] as const;

/**
 * Reads the source-declared `meta/stats.json` and keeps only the stat
 * vectors that flatten to exactly one finite number per declared
 * dimension; anything else is omitted rather than realigned.
 */
async function readStateActionStats(
  source: EpisodeSource,
  io: ByteResources,
  asset: AssetDescriptor,
  stateFeature: LeRobotFeature | undefined,
  actionFeature: LeRobotFeature | undefined,
): Promise<StateActionStats | null> {
  const buffer = asyncBufferForSource(asset, source, io);
  const bytes = new Uint8Array(await buffer.slice(0, buffer.byteLength));
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<
    string,
    unknown
  >;
  const state = stateFeature
    ? statsForFeature(parsed[STATE_FEATURE_NAME], stateFeature)
    : undefined;
  const action = actionFeature
    ? statsForFeature(parsed[ACTION_FEATURE_NAME], actionFeature)
    : undefined;
  if (!state && !action) return null;
  const sampleCount = statsSampleCount(
    parsed[STATE_FEATURE_NAME] ?? parsed[ACTION_FEATURE_NAME],
  );
  return {
    ...(action ? { action } : {}),
    ...(sampleCount !== undefined ? { sampleCount } : {}),
    ...(state ? { state } : {}),
  };
}

function statsSampleCount(entry: unknown): number | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const flattened = flattenStateActionSource(
    (entry as Record<string, unknown>).count,
  );
  const count = flattened[0];
  return typeof count === "number" && Number.isFinite(count) && count > 0
    ? count
    : undefined;
}

function statsForFeature(
  entry: unknown,
  feature: LeRobotFeature,
): StateActionFeatureStats | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const count = Math.max(1, numericElementCount(feature.shape));
  const record = entry as Record<string, unknown>;
  const stats: Record<string, readonly number[]> = {};
  for (const key of STATE_ACTION_STAT_KEYS) {
    const values = flattenStateActionSource(record[key]);
    if (
      values.length === count &&
      values.every((value) => typeof value === "number")
    ) {
      stats[key] = values as readonly number[];
    }
  }
  return Object.keys(stats).length > 0
    ? (stats as StateActionFeatureStats)
    : undefined;
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

function emptyRawRecord(
  timeRange: TimeWindow,
  binding: LeRobotRawStreamBinding,
): RawRecordResult {
  return {
    encoding: "parquet",
    schemaName: binding.schemaName,
    sourceName: binding.sourceName,
    status: "empty",
    streamId: binding.streamId,
    validFromNs: timeRange.startNs,
    validUntilNs: timeRange.endNs,
  };
}

function scalarRawRecord(
  featureName: string,
  feature: LeRobotFeature,
  value: unknown,
): Record<string, unknown> {
  const values = Array.isArray(value) ? value.flat(Infinity) : [value];
  return Object.fromEntries(
    scalarFieldNames(featureName, feature).map((field, index) => [
      field,
      values[index],
    ]),
  );
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
