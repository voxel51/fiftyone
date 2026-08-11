import { parquetReadObjects } from "hyparquet";
import { createFile, MP4BoxBuffer, type Sample, type Track } from "mp4box";

import {
  STREAM_KIND,
  VISUALIZATION_KIND,
  type DecodedFrame,
  type DecodedOutput,
  type EncodedVideoVisualization,
  type EpisodeManifest,
  type StreamDescriptor,
  type TimeWindow,
} from "../../ir";
import {
  EpisodeReadCancelledError,
  type AssetDescriptor,
  type ByteResources,
  type EpisodeSession,
  type EpisodeSource,
  type FormatAdapter,
  type FrameBatch,
  type NumericSeriesCapability,
  type ReadRequest,
  type SourceStats,
} from "../../ports";
import { nsDeltaToSeconds } from "../../utils/nanoseconds";
import { throwIfAborted } from "../../utils/cancellation";
import { toError } from "../../utils/errors";

const INFO_ROLE = "metadata";
const EPISODE_INDEX_ROLE = "episode-index";
const DATA_ROLE = "data";
const VIDEO_ROLE = "video";
const NS_PER_SECOND = 1_000_000_000;

// hyparquet's published AsyncBuffer alias resolves through a `.d.ts` import
// that TypeScript 4.9 treats as `any`. Keep the small structural contract local
// until multimodal's TypeScript version can consume that declaration directly.
interface AsyncBuffer {
  readonly byteLength: number;
  slice(start: number, end?: number): ArrayBuffer | Promise<ArrayBuffer>;
}

interface ParquetReaderOptions {
  readonly columns?: string[];
  readonly file: AsyncBuffer;
  readonly rowEnd?: number;
  readonly rowStart?: number;
}

type ParquetReader = (
  options: ParquetReaderOptions,
) => Promise<Record<string, unknown>[]>;

/** Test seam for the browser-native Parquet reader. */
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

interface EpisodeRows {
  readonly dataAsset: AssetDescriptor;
  readonly end: number;
  readonly episode: Record<string, unknown>;
  readonly start: number;
}

interface VideoBinding {
  readonly asset: AssetDescriptor;
  readonly fromSeconds: number;
  readonly streamId: string;
  readonly toSeconds: number;
}

interface DemuxedVideo {
  readonly samples: readonly Sample[];
  readonly track: Track;
}

/** Creates the Parquet + MP4 LeRobot implementation of the episode port. */
export function createLeRobotFormatAdapter(
  options: CreateLeRobotFormatAdapterOptions = {},
): FormatAdapter {
  const readObjects = options.readParquetObjects ?? parquetReadObjects;
  let activeSession: LeRobotEpisodeSession | null = null;

  return {
    id: "lerobot",
    async open(source, io) {
      const assets = await source.assets.list();
      const infoAsset = requireSingleRole(assets, INFO_ROLE);
      const episodeIndexAsset = requireSingleRole(assets, EPISODE_INDEX_ROLE);
      const [info, episodeRows] = await Promise.all([
        readInfo(source, io, infoAsset),
        readEpisodeRows(source, io, assets, episodeIndexAsset, readObjects),
      ]);
      const session = new LeRobotEpisodeSession({
        assets,
        episodeRows,
        info,
        io,
        onActivate: () => {
          if (activeSession && activeSession !== session) {
            activeSession.deactivate();
          }
          activeSession = session;
        },
        readObjects,
        source,
      });
      return session;
    },
  };
}

class LeRobotEpisodeSession implements EpisodeSession {
  readonly manifest: EpisodeManifest;
  readonly numericSeries: NumericSeriesCapability;
  private readonly dataBuffer: AsyncBuffer;
  private readonly scalarFeatures: ReadonlyMap<string, LeRobotFeature>;
  private readonly scalarRowsCache = new Map<
    string,
    Promise<Record<string, unknown>[]>
  >();
  private readonly videoBindings: ReadonlyMap<string, VideoBinding>;
  private readonly videoCache = new Map<string, Promise<DemuxedVideo>>();
  private disposed = false;
  private generation = 0;
  private idleGeneration = 0;
  private decodedFrames = 0;
  private readRequests = 0;
  private returnedBatches = 0;
  private transferredBytes = 0;

  constructor(
    private readonly state: {
      readonly assets: readonly AssetDescriptor[];
      readonly episodeRows: EpisodeRows;
      readonly info: LeRobotInfo;
      readonly io: ByteResources;
      readonly onActivate: () => void;
      readonly readObjects: ParquetReader;
      readonly source: EpisodeSource;
    },
  ) {
    const duration = episodeDuration(state.episodeRows.episode, state.info.fps);
    const timeRange = {
      endNs: secondsToNs(duration.end),
      startNs: secondsToNs(duration.start),
    };
    const scalarFeatures = new Map<string, LeRobotFeature>();
    const videoBindings = new Map<string, VideoBinding>();
    const streams = Object.entries(state.info.features).flatMap(
      ([name, feature]): StreamDescriptor[] => {
        const streamId = streamIdForFeature(name);
        if (feature.dtype === "video") {
          const binding = resolveVideoBinding(
            state.assets,
            state.episodeRows.episode,
            name,
            streamId,
          );
          if (!binding) return [];
          videoBindings.set(streamId, binding);
          return [videoStream(name, feature, binding, timeRange)];
        }
        if (!isScalarFeature(name, feature)) return [];
        scalarFeatures.set(streamId, feature);
        return [scalarStream(name, feature, timeRange)];
      },
    );
    this.scalarFeatures = scalarFeatures;
    this.videoBindings = videoBindings;
    this.manifest = state.source.manifestHint ?? {
      episodeId: state.source.episodeId,
      metadata: {
        "lerobot.codebaseVersion": state.info.codebase_version ?? "unknown",
        "lerobot.episodeIndex": episodeIndex(state.source).toString(),
        "lerobot.robotType": state.info.robot_type ?? "unknown",
      },
      streams,
      timeDomain: { id: "episode", kind: "duration", originNs: 0n },
      timeRange,
    };
    this.dataBuffer = asyncBufferForSource(
      state.episodeRows.dataAsset,
      state.source,
      state.io,
      (bytes) => {
        this.transferredBytes += bytes;
      },
    );
    this.numericSeries = {
      enumerateNumericFields: async (streams) =>
        this.enumerateNumericFields(streams),
      readNumericSeries: async (request) => this.readNumericSeries(request),
    };
  }

  activate(): void {
    this.ensureOpen();
    this.state.onActivate();
  }

  cancelIdle(): void {
    this.ensureOpen();
    this.idleGeneration += 1;
  }

  deactivate(): void {
    if (this.disposed) return;
    this.generation += 1;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.scalarRowsCache.clear();
    this.videoCache.clear();
  }

  async *read(request: ReadRequest): AsyncIterable<FrameBatch> {
    this.activate();
    throwIfAborted(request.signal);
    const generation = this.generation;
    const idleGeneration = this.idleGeneration;
    const priority = request.priority ?? "playback";
    this.readRequests += 1;

    const scalarStreams = request.streams.filter((stream) =>
      this.scalarFeatures.has(stream),
    );
    if (scalarStreams.length > 0) {
      const rows = await this.readScalarRows(scalarStreams);
      this.ensureReadable(generation, idleGeneration, priority, request.signal);
      for (const stream of scalarStreams) {
        const featureName = featureNameForStream(stream);
        const feature = this.scalarFeatures.get(stream);
        if (!feature) continue;
        const frames = rows
          .map((row) => scalarFrame(stream, featureName, feature, row))
          .filter(
            (frame): frame is DecodedFrame =>
              frame !== null && inWindow(frame.timestampNs, request.window),
          );
        if (frames.length === 0) continue;
        this.recordBatch(frames.length);
        yield { frames, stream };
      }
    }

    for (const stream of request.streams) {
      const binding = this.videoBindings.get(stream);
      if (!binding) continue;
      const video = await this.readVideo(binding);
      this.ensureReadable(generation, idleGeneration, priority, request.signal);
      const frames = video.samples
        .filter((sample) =>
          videoSampleInWindow(binding, video.track, sample, request.window),
        )
        .map((sample) => videoFrame(stream, binding, video.track, sample))
        .filter(
          (frame): frame is DecodedFrame =>
            frame !== null && inWindow(frame.timestampNs, request.window),
        );
      if (frames.length === 0) continue;
      this.recordBatch(frames.length);
      yield { frames, stream };
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

  private async readScalarRows(
    streams: readonly string[],
  ): Promise<Record<string, unknown>[]> {
    const featureNames = [...new Set(streams.map(featureNameForStream))].sort();
    const key = featureNames.join("\n");
    const cached = this.scalarRowsCache.get(key);
    if (cached) return cached;
    const promise = this.state.readObjects({
      columns: ["timestamp", "frame_index", ...featureNames],
      file: this.dataBuffer,
      rowEnd: this.state.episodeRows.end,
      rowStart: this.state.episodeRows.start,
    });
    this.scalarRowsCache.set(key, promise);
    try {
      return await promise;
    } catch (error) {
      this.scalarRowsCache.delete(key);
      throw error;
    }
  }

  private async readVideo(binding: VideoBinding): Promise<DemuxedVideo> {
    const cached = this.videoCache.get(binding.asset.id);
    if (cached) return cached;
    const promise = (async () => {
      const buffer = asyncBufferForSource(
        binding.asset,
        this.state.source,
        this.state.io,
        (bytes) => {
          this.transferredBytes += bytes;
        },
      );
      const bytes = new Uint8Array(await buffer.slice(0, buffer.byteLength));
      return demuxVideo(bytes);
    })();
    this.videoCache.set(binding.asset.id, promise);
    try {
      return await promise;
    } catch (error) {
      this.videoCache.delete(binding.asset.id);
      throw error;
    }
  }

  private enumerateNumericFields(
    streams: readonly string[] | undefined,
  ): ReturnType<NumericSeriesCapability["enumerateNumericFields"]> {
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
  ): ReturnType<NumericSeriesCapability["readNumericSeries"]> {
    const frames: DecodedFrame[] = [];
    for await (const batch of this.read({
      streams: [request.stream],
      window: request.window,
    })) {
      frames.push(...batch.frames);
    }
    const baseTimeNs = this.manifest.timeRange.startNs;
    return {
      baseTimeNs,
      fields: request.fields.map((path) => ({
        path,
        timesSec: Float64Array.from(
          frames.map((frame) =>
            nsDeltaToSeconds(frame.timestampNs - baseTimeNs),
          ),
        ),
        values: Float64Array.from(
          frames.map(
            (frame) =>
              frame.output.scalars?.find((scalar) => scalar.field === path)
                ?.value ?? Number.NaN,
          ),
        ),
      })),
      sampleCount: frames.length,
      streamId: request.stream,
      truncated: false,
    };
  }

  private ensureReadable(
    generation: number,
    idleGeneration: number,
    priority: ReadRequest["priority"],
    signal: AbortSignal | undefined,
  ): void {
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

  private ensureOpen(): void {
    if (this.disposed) throw new EpisodeReadCancelledError();
  }

  private recordBatch(frameCount: number): void {
    this.decodedFrames += frameCount;
    this.returnedBatches += 1;
  }
}

async function readInfo(
  source: EpisodeSource,
  io: ByteResources,
  asset: AssetDescriptor,
): Promise<LeRobotInfo> {
  const buffer = asyncBufferForSource(asset, source, io);
  const bytes = new Uint8Array(await buffer.slice(0, buffer.byteLength));
  const value = JSON.parse(new TextDecoder().decode(bytes)) as LeRobotInfo;
  if (!value.features || !Number.isFinite(value.fps) || value.fps <= 0) {
    throw new Error("Invalid LeRobot meta/info.json");
  }
  return value;
}

async function readEpisodeRows(
  source: EpisodeSource,
  io: ByteResources,
  assets: readonly AssetDescriptor[],
  indexAsset: AssetDescriptor,
  readObjects: ParquetReader,
): Promise<EpisodeRows> {
  const index = episodeIndex(source);
  const rows = await readObjects({
    file: asyncBufferForSource(indexAsset, source, io),
  });
  const episode = rows.find(
    (row) => integer(row.episode_index, "episode_index") === index,
  );
  if (!episode) throw new Error(`LeRobot episode ${index} was not found`);
  const chunkIndex = integer(episode["data/chunk_index"], "data/chunk_index");
  const fileIndex = integer(episode["data/file_index"], "data/file_index");
  const dataAsset = requireIndexedAsset(
    assets,
    DATA_ROLE,
    chunkIndex,
    fileIndex,
  );
  return {
    dataAsset,
    end: integer(episode.dataset_to_index, "dataset_to_index"),
    episode,
    start: integer(episode.dataset_from_index, "dataset_from_index"),
  };
}

function asyncBufferForSource(
  asset: AssetDescriptor,
  source: EpisodeSource,
  io: ByteResources,
  onBytes?: (bytes: number) => void,
): AsyncBuffer {
  let resolved: ReturnType<EpisodeSource["assets"]["resolve"]> | undefined;
  const resolve = () => (resolved ??= source.assets.resolve(asset.id));
  const sizeText = asset.metadata?.sizeBytes;
  const byteLength = safeByteLength(sizeText);
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
      const descriptor = await resolve();
      const result = await io.readBytes({
        range: { length: BigInt(end - start), offset: BigInt(start) },
        source: descriptor,
      });
      onBytes?.(result.bytes.byteLength);
      return result.bytes.buffer.slice(
        result.bytes.byteOffset,
        result.bytes.byteOffset + result.bytes.byteLength,
      );
    },
  };
}

function safeByteLength(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const size = Number(value);
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
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

function requireIndexedAsset(
  assets: readonly AssetDescriptor[],
  role: string,
  chunkIndex: number,
  fileIndex: number,
): AssetDescriptor {
  const matches = assets.filter(
    (asset) =>
      asset.role === role &&
      integerMetadata(asset, "chunkIndex") === chunkIndex &&
      integerMetadata(asset, "fileIndex") === fileIndex,
  );
  if (matches.length !== 1) {
    throw new Error(
      `LeRobot source requires '${role}' asset ${chunkIndex}/${fileIndex}`,
    );
  }
  return matches[0];
}

function integerMetadata(asset: AssetDescriptor, key: string): number | null {
  const value = asset.metadata?.[key];
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function resolveVideoBinding(
  assets: readonly AssetDescriptor[],
  episode: Record<string, unknown>,
  featureName: string,
  streamId: string,
): VideoBinding | null {
  const prefix = `videos/${featureName}/`;
  const chunk = optionalInteger(episode[`${prefix}chunk_index`]);
  const file = optionalInteger(episode[`${prefix}file_index`]);
  const fromSeconds = optionalNumber(episode[`${prefix}from_timestamp`]);
  const toSeconds = optionalNumber(episode[`${prefix}to_timestamp`]);
  if (
    chunk === null ||
    file === null ||
    fromSeconds === null ||
    toSeconds === null
  ) {
    return null;
  }
  const asset = assets.find(
    (candidate) =>
      candidate.role === VIDEO_ROLE &&
      candidate.metadata?.stream === featureName &&
      integerMetadata(candidate, "chunkIndex") === chunk &&
      integerMetadata(candidate, "fileIndex") === file,
  );
  return asset ? { asset, fromSeconds, streamId, toSeconds } : null;
}

function episodeIndex(source: EpisodeSource): number {
  const hinted = source.manifestHint?.metadata?.["lerobot.episodeIndex"];
  const candidate = hinted ?? source.episodeId.match(/(?:^|[^\d])(\d+)$/)?.[1];
  if (!candidate || !/^\d+$/.test(candidate)) {
    throw new Error(
      "LeRobot source needs a numeric episodeId or lerobot.episodeIndex hint",
    );
  }
  const index = Number(candidate);
  if (!Number.isSafeInteger(index))
    throw new Error("Invalid LeRobot episode index");
  return index;
}

function episodeDuration(
  episode: Record<string, unknown>,
  fps: number,
): { start: number; end: number } {
  const min = firstNumber(episode["stats/timestamp/min"]) ?? 0;
  const max =
    firstNumber(episode["stats/timestamp/max"]) ??
    Math.max(0, (integer(episode.length, "length") - 1) / fps);
  return { end: Math.max(min, max), start: min };
}

function scalarStream(
  name: string,
  feature: LeRobotFeature,
  timeRange: TimeWindow,
): StreamDescriptor {
  return {
    approxRateHz: undefined,
    id: streamIdForFeature(name),
    kind: STREAM_KIND.SCALAR,
    metadata: {
      "lerobot.dtype": feature.dtype,
      "lerobot.names": JSON.stringify(feature.names ?? []),
      "lerobot.shape": JSON.stringify(feature.shape ?? []),
    },
    payload: {
      encoding: "parquet",
      schema: `${feature.dtype}${shapeSuffix(feature.shape)}`,
    },
    sourceName: name,
    timeRange,
  };
}

function videoStream(
  name: string,
  feature: LeRobotFeature,
  binding: VideoBinding,
  timeRange: TimeWindow,
): StreamDescriptor {
  const codec = stringValue(feature.info?.["video.codec"]) ?? "unknown";
  return {
    approxRateHz: optionalNumber(feature.info?.["video.fps"]) ?? undefined,
    id: binding.streamId,
    kind: STREAM_KIND.VIDEO,
    metadata: {
      "lerobot.assetId": binding.asset.id,
      "lerobot.codec": codec,
    },
    payload: { encoding: "mp4", schema: codec },
    sourceName: name,
    timeRange,
  };
}

function isScalarFeature(name: string, feature: LeRobotFeature): boolean {
  return (
    ![
      "timestamp",
      "frame_index",
      "episode_index",
      "index",
      "task_index",
    ].includes(name) && /^(?:bool|float|int|uint)/.test(feature.dtype)
  );
}

function scalarFrame(
  streamId: string,
  featureName: string,
  feature: LeRobotFeature,
  row: Record<string, unknown>,
): DecodedFrame | null {
  const seconds = optionalNumber(row.timestamp);
  if (seconds === null) return null;
  const timestampNs = secondsToNs(seconds);
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
  const output: DecodedOutput = {
    attributes: {
      frameIndex: optionalBigInt(row.frame_index),
    },
    resourceHints: { transferables: [] },
    scalars,
    timing: { timeRange: { startNs: timestampNs } },
  };
  return {
    output,
    sequence: optionalInteger(row.frame_index) ?? undefined,
    sourceTimestamps: { lerobot: timestampNs },
    streamId,
    timestampNs,
  };
}

function videoFrame(
  streamId: string,
  binding: VideoBinding,
  track: Track,
  sample: Sample,
): DecodedFrame | null {
  if (!sample.data || track.timescale <= 0) return null;
  const shardSeconds = sample.cts / track.timescale;
  if (shardSeconds < binding.fromSeconds || shardSeconds >= binding.toSeconds) {
    return null;
  }
  const timestampNs = secondsToNs(shardSeconds - binding.fromSeconds);
  const bytes = new Uint8Array(sample.data);
  const visualization = encodedVideo(
    track.codec,
    bytes,
    sample.is_sync,
    timestampNs,
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
    sourceTimestamps: { lerobotShard: secondsToNs(shardSeconds) },
    streamId,
    timestampNs,
  };
}

function videoSampleInWindow(
  binding: VideoBinding,
  track: Track,
  sample: Sample,
  window: TimeWindow,
): boolean {
  if (!sample.data || track.timescale <= 0) return false;
  const shardSeconds = sample.cts / track.timescale;
  if (shardSeconds < binding.fromSeconds || shardSeconds >= binding.toSeconds) {
    return false;
  }
  return inWindow(secondsToNs(shardSeconds - binding.fromSeconds), window);
}

function encodedVideo(
  codecString: string,
  bytes: Uint8Array,
  keyframe: boolean,
  timestampNs: bigint,
): EncodedVideoVisualization {
  const codec = codecFamily(codecString);
  if (codec === "h264") {
    return {
      bytes,
      codec,
      format: codecString,
      h264: { codecString, hasFrame: true },
      keyframe,
      kind: VISUALIZATION_KIND.ENCODED_VIDEO,
      timestampNs,
    };
  }
  return {
    bytes,
    codec,
    format: codecString,
    keyframe,
    kind: VISUALIZATION_KIND.ENCODED_VIDEO,
    timestampNs,
  };
}

function codecFamily(codec: string): "av1" | "h264" | "h265" | "vp9" {
  const normalized = codec.toLowerCase();
  if (/^(?:av01|av1)/.test(normalized)) return "av1";
  if (/^(?:hvc1|hev1|h265|hevc)/.test(normalized)) return "h265";
  if (/^(?:vp09|vp9)/.test(normalized)) return "vp9";
  if (/^(?:avc1|avc3|h264)/.test(normalized)) return "h264";
  throw new Error(`Unsupported LeRobot video codec '${codec}'`);
}

function demuxVideo(bytes: Uint8Array): Promise<DemuxedVideo> {
  return new Promise((resolve, reject) => {
    const file = createFile(true);
    let track: Track | undefined;
    const samples: Sample[] = [];
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(toError(error));
    };
    file.onError = (error) => fail(new Error(`MP4 demux failed: ${error}`));
    file.onReady = (info) => {
      track = info.videoTracks[0];
      if (!track) {
        fail(new Error("LeRobot video asset has no video track"));
        return;
      }
      file.setExtractionOptions(track.id, undefined, {
        nbSamples: Math.max(1, track.nb_samples),
      });
      file.start();
    };
    file.onSamples = (_id, _user, next) => {
      if (settled || !track) return;
      for (const sample of next) samples.push(sample);
      if (samples.length >= track.nb_samples) {
        settled = true;
        file.stop();
        resolve({ samples, track });
      }
    };
    try {
      const data = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
      file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(data, 0), true);
      file.flush();
      queueMicrotask(() => {
        if (settled) return;
        if (!track) {
          fail(new Error("LeRobot video asset has no readable video track"));
          return;
        }
        settled = true;
        file.stop();
        resolve({ samples, track });
      });
    } catch (error) {
      fail(error);
    }
  });
}

function scalarFieldNames(
  featureName: string,
  feature: LeRobotFeature,
): readonly string[] {
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

function numericElementCount(shape: readonly number[] | undefined): number {
  return (shape ?? []).reduce((product, value) => product * value, 1);
}

function numericValues(value: unknown): readonly number[] {
  if (typeof value === "number") return [value];
  if (!Array.isArray(value)) return [];
  return value
    .flat(Infinity)
    .filter((entry): entry is number => typeof entry === "number");
}

function streamIdForFeature(feature: string): string {
  return `lerobot:${feature}`;
}

function featureNameForStream(stream: string): string {
  return stream.startsWith("lerobot:")
    ? stream.slice("lerobot:".length)
    : stream;
}

function shapeSuffix(shape: readonly number[] | undefined): string {
  return shape && shape.length > 0 ? `[${shape.join(",")}]` : "";
}

function inWindow(timestampNs: bigint, window: TimeWindow): boolean {
  return timestampNs >= window.startNs && timestampNs <= window.endNs;
}

function secondsToNs(seconds: number): bigint {
  if (!Number.isFinite(seconds)) throw new Error("Invalid LeRobot timestamp");
  return BigInt(Math.round(seconds * NS_PER_SECOND));
}

function integer(value: unknown, field: string): number {
  const parsed = optionalInteger(value);
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
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstNumber(value: unknown): number | null {
  return Array.isArray(value)
    ? optionalNumber(value[0])
    : optionalNumber(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
