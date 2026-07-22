import {
  SCENE_SOURCE_METADATA,
  STREAM_SYNC_MODE,
  STREAM_KIND,
  type ByteSourceDescriptor,
  type DecodedFrame,
  type EpisodeManifest,
  type EpisodePreviewReadResult,
  type StreamDescriptor,
  type StreamKind,
  type ResolvedStreamSyncPolicy,
  type StreamSyncMode,
  type StreamSyncPolicy,
  type SynchronizedFrameWindow,
  type TransformSample,
} from "../../ir";
import {
  EpisodeReadCancelledError,
  type ByteResources,
  type EpisodeSession,
  type EpisodeSource,
  type EpisodePreviewReadOptions,
  type EpisodePreviewReadRequest,
  type EpisodePreviewSession,
  type FormatAdapter,
  type FrameBatch,
  type NumericSeriesCapability,
  type PlaybackReadCapability,
  type RawRecordCapability,
  type ReadRequest,
  type ReadPriority,
  type SourceStats,
  type TransformReadAcceleration,
} from "../../ports";
import { PlaybackSyncMode } from "../../schemas/v1";
import { isEpisodeReadCancelledError } from "../../ports";
import type { McapGridPreviewResult } from "./resource-client/grid-preview";
import { prewarmMcapSource } from "./prewarm-mcap-source";
import {
  acquireSharedMcapResourceClient,
  createMcapResourceClient,
} from "./resource-client/index";
import {
  MCAP_ACTIVE_TIMELINE,
  type McapDecodedMessage,
  type McapResourceClient,
  type McapStreamSyncPolicies,
  type McapStreamSyncPolicy,
  type McapTimelineRange,
} from "./contracts/index";
import { getMcapGridPreviewPool } from "./worker";
import {
  MCAP_PLAYBACK_WORKER_PRIORITY,
  type McapPlaybackWorkerPriority,
} from "./worker/playback-worker-types";

type McapGridPreviewPool = Pick<
  ReturnType<typeof getMcapGridPreviewPool>,
  "acquire" | "release" | "request"
>;

/** Options for constructing the MCAP format adapter. */
export interface CreateMcapFormatAdapterOptions {
  readonly createClient?: (io: ByteResources) => McapResourceClient;
  readonly getPreviewPool?: () => McapGridPreviewPool;
}

/** Creates the passive MCAP provider behind the shared format port. */
export function createMcapFormatAdapter(
  options: CreateMcapFormatAdapterOptions = {},
): FormatAdapter {
  return {
    id: "mcap",
    async open(source, io) {
      const asset = await resolveMcapAsset(source);
      const handle = options.createClient
        ? ownedClient(options.createClient(io))
        : asset.localFile
          ? ownedClient(createMcapResourceClient({ byteClient: io }))
          : acquireSharedMcapResourceClient({ worker: true });
      const { client } = handle;
      try {
        const hintedRange = mcapTimelineRangeFromSource(source);
        let range: McapTimelineRange;
        let manifest: EpisodeManifest;
        if (source.manifestHint) {
          range =
            hintedRange ?? mcapTimelineRangeFromManifest(source.manifestHint);
          manifest = source.manifestHint;
        } else {
          const [loadedRange, topics] = await Promise.all([
            hintedRange
              ? Promise.resolve(hintedRange)
              : client.readTimelineRange({
                  activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
                  source: asset,
                }),
            client.readTopics({ source: asset }),
          ]);
          range = loadedRange;
          manifest = createMcapManifest(source.episodeId, range, topics);
        }
        return new McapEpisodeSession(
          client,
          asset,
          manifest,
          range,
          handle.release,
        );
      } catch (error) {
        handle.release();
        throw error;
      }
    },
    async openPreview(source, _io) {
      const asset = await resolveMcapAsset(source);
      const pool = (options.getPreviewPool ?? getMcapGridPreviewPool)();
      pool.acquire();
      return new McapEpisodePreviewSession(asset, source.episodeId, pool);
    },
    async prewarm(source, _io, prewarmOptions) {
      const asset = await resolveMcapAsset(source);
      await prewarmMcapSource(asset, { signal: prewarmOptions?.signal });
    },
  };
}

/** Source-bound neutral facade over the adapter's shared preview workers. */
class McapEpisodePreviewSession implements EpisodePreviewSession {
  private disposed = false;
  private streamIdsBySourceName = new Map<string, string>();

  constructor(
    private readonly source: ByteSourceDescriptor,
    private readonly episodeId: string,
    private readonly pool: McapGridPreviewPool,
  ) {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pool.release();
  }

  async read(
    request: EpisodePreviewReadRequest = {},
    options: EpisodePreviewReadOptions = {},
  ): Promise<EpisodePreviewReadResult> {
    if (this.disposed) throw new EpisodeReadCancelledError();
    const selectedStreamTopic = request.sourceName ?? undefined;
    const result = await this.pool.request(
      {
        ...(selectedStreamTopic ? { selectedStreamTopic } : {}),
        source: this.source,
        ...(request.startTimeNs !== undefined
          ? { startTimeNs: request.startTimeNs }
          : {}),
      },
      {
        priority: previewPriority(options.priority),
        signal: options.signal,
      },
    );
    if (this.disposed) throw new EpisodeReadCancelledError();
    return this.toEpisodeResult(result);
  }

  private toEpisodeResult(
    result: McapGridPreviewResult,
  ): EpisodePreviewReadResult {
    if (result.bootstrapTopics) {
      for (const stream of result.bootstrapTopics) {
        const sourceName =
          stream.metadata["mcap.topic"] ??
          stream.displayName ??
          stream.streamId;
        this.streamIdsBySourceName.set(sourceName, stream.streamId);
      }
    }
    const timelineRange = result.bootstrapTimelineRange;
    const bootstrapTimeRange = timelineRange
      ? {
          endNs: timelineRange.endTimeNs,
          startNs: timelineRange.startTimeNs,
        }
      : undefined;
    const bootstrapManifest =
      timelineRange && result.bootstrapTopics
        ? createMcapManifest(
            this.episodeId,
            timelineRange,
            result.bootstrapTopics,
          )
        : undefined;
    const streamIdFor = (sourceName: string) =>
      this.streamIdsBySourceName.get(sourceName) ?? sourceName;
    return {
      ...(bootstrapManifest ? { bootstrapManifest } : {}),
      ...(timelineRange
        ? {
            bootstrapTimeline: {
              byteTimeline: timelineRange.byteTimeline,
              endNs: timelineRange.endTimeNs,
              startNs: timelineRange.startTimeNs,
              timeDomainId: MCAP_ACTIVE_TIMELINE.LOG,
            },
          }
        : {}),
      ...(bootstrapTimeRange ? { bootstrapTimeRange } : {}),
      frame: result.state.frame,
      frameTimeNs: result.frameTimeNs,
      nextStartTimeNs: result.nextStartTimeNs,
      streamId: result.state.streamTopic
        ? streamIdFor(result.state.streamTopic)
        : null,
      streamSourceName: result.state.streamTopic,
      streamSourceNames: result.state.streamTopics,
      status:
        result.state.status === "unavailable"
          ? "unavailable"
          : result.state.frame
            ? "ready"
            : "empty",
    };
  }
}

function previewPriority(
  priority: ReadPriority | undefined,
): McapPlaybackWorkerPriority {
  switch (priority) {
    case "current":
      return MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME;
    case "playback":
      return MCAP_PLAYBACK_WORKER_PRIORITY.PLAYBACK_BATCH;
    case "bulk":
      return MCAP_PLAYBACK_WORKER_PRIORITY.BULK_HISTORY;
    case "idle":
    case undefined:
      return MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH;
  }
}

function mcapTimelineRangeFromSource(
  source: EpisodeSource,
): McapTimelineRange | null {
  if (source.playbackHint) {
    return {
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      byteTimeline: source.playbackHint.byteTimeline,
      endTimeNs: source.playbackHint.endNs,
      startTimeNs: source.playbackHint.startNs,
    };
  }
  return source.manifestHint
    ? mcapTimelineRangeFromManifest(source.manifestHint)
    : null;
}

function mcapTimelineRangeFromManifest(
  manifest: EpisodeManifest,
): McapTimelineRange {
  return {
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    endTimeNs: manifest.timeRange.endNs,
    startTimeNs: manifest.timeRange.startNs,
  };
}

/** Adapts the proven MCAP numeric RPCs to the format-neutral capability. */
export function createMcapNumericSeriesCapability({
  client,
  source,
  streams = [],
}: {
  readonly client: McapResourceClient;
  readonly source: ByteSourceDescriptor;
  readonly streams?: readonly StreamDescriptor[];
}): NumericSeriesCapability {
  const sourceNamesById = new Map(
    streams.map((stream) => [stream.id, stream.sourceName]),
  );
  const streamIdsBySourceName = new Map(
    streams.map((stream) => [stream.sourceName, stream.id]),
  );
  const sourceNameFor = (stream: string) =>
    sourceNamesById.get(stream) ?? stream;
  return {
    async enumerateNumericFields(requestedStreams) {
      const fields = await client.enumerateNumericFields({
        source,
        topics: requestedStreams?.map(sourceNameFor),
      });
      return fields.map((entry) => ({
        availability: entry.availability,
        encoding: entry.encoding,
        fields: entry.fields,
        sampled: entry.sampled,
        sourceName: entry.topic,
        streamId: streamIdsBySourceName.get(entry.topic) ?? entry.topic,
      }));
    },
    async readNumericSeries(request) {
      const result = await client.readNumericSeries(
        {
          activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
          endTimeNs: request.window.endNs,
          fieldPaths: request.fields,
          maxPointsPerField: request.maxPointsPerField,
          source,
          startTimeNs: request.window.startNs,
          topic: sourceNameFor(request.stream),
        },
        { priority: "bulk" },
      );
      return {
        baseTimeNs: result.baseTimeNs,
        fields: result.fields,
        sampleCount: result.messageCount,
        streamId: request.stream,
        truncated: result.truncated,
      };
    },
  };
}

/** Adapts MCAP topic inspection to the format-neutral raw-record capability. */
export function createMcapRawRecordCapability({
  client,
  source,
  streams = [],
}: {
  readonly client: McapResourceClient;
  readonly source: ByteSourceDescriptor;
  readonly streams?: readonly StreamDescriptor[];
}): RawRecordCapability {
  const sourceNamesById = new Map(
    streams.map((stream) => [stream.id, stream.sourceName]),
  );
  const streamIdsBySourceName = new Map(
    streams.map((stream) => [stream.sourceName, stream.id]),
  );
  const sourceNameFor = (stream: string) =>
    sourceNamesById.get(stream) ?? stream;
  const streamIdFor = (sourceName: string) =>
    streamIdsBySourceName.get(sourceName) ?? sourceName;
  return {
    async listRawRecordStreams() {
      const inventory = await client.readTopics({ source });
      return inventory.map((entry) => {
        const sourceName =
          entry.metadata["mcap.topic"] ?? entry.displayName ?? entry.streamId;
        return {
          encoding: entry.metadata["mcap.message_encoding"] ?? "unknown",
          sampleCount: parseRecordCount(entry.recordCount) ?? null,
          schemaName: entry.metadata["mcap.schema_name"] ?? null,
          sourceName,
          streamId: streamIdFor(sourceName),
        };
      });
    },
    async readRawRecord(request) {
      const result = await client.readRawMessageRecord({
        activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
        includeFullJson: request.includeFullJson,
        prune: request.prune,
        source,
        timeNs: request.timestampNs,
        topic: sourceNameFor(request.stream),
      });
      return {
        decodeError: result.decodeError,
        decodeUnavailableReason: result.decodeUnavailableReason,
        encoding: result.messageEncoding,
        fullJson: result.fullJson,
        payloadBytes: result.encodedPayloadBytes,
        root: result.root,
        schemaName: result.schemaName,
        sequence: result.sequence,
        sourceName: result.topic,
        sourceTimestamps:
          result.logTimeNs !== undefined || result.publishTimeNs !== undefined
            ? {
                ...(result.logTimeNs !== undefined
                  ? { logTime: result.logTimeNs }
                  : {}),
                ...(result.publishTimeNs !== undefined
                  ? { publishTime: result.publishTimeNs }
                  : {}),
              }
            : undefined,
        status: result.status,
        streamId: streamIdFor(result.topic),
        timestampNs: result.logTimeNs,
        truncated: result.truncated,
        validFromNs: result.validFromNs,
        validUntilNs: result.validUntilNs,
      };
    },
  };
}

async function resolveMcapAsset(source: EpisodeSource) {
  const assets = await source.assets.list();
  const candidate =
    assets.find(
      (asset) =>
        asset.role === "recording" ||
        asset.mediaType === "application/x-mcap" ||
        asset.mediaType === "application/mcap",
    ) ?? (assets.length === 1 ? assets[0] : undefined);
  if (!candidate) {
    throw new Error("MCAP episodes require exactly one recording asset");
  }
  return source.assets.resolve(candidate.id);
}

export function createMcapManifest(
  episodeId: string,
  range: { readonly endTimeNs: bigint; readonly startTimeNs: bigint },
  topics: Awaited<ReturnType<McapResourceClient["readTopics"]>>,
): EpisodeManifest {
  const timeRange = { endNs: range.endTimeNs, startNs: range.startTimeNs };
  const durationSeconds = Number(range.endTimeNs - range.startTimeNs) / 1e9;
  const streamIdsBySourceName = new Map(
    topics.map((topic) => [mcapSourceName(topic), topic.streamId]),
  );
  return {
    episodeId,
    streams: topics.map((topic): StreamDescriptor => {
      const count = parseRecordCount(topic.recordCount);
      const sourceName = mcapSourceName(topic);
      const calibrationSourceName =
        topic.metadata[SCENE_SOURCE_METADATA.CALIBRATION_STREAM_ID];
      return {
        approxRateHz:
          count !== undefined && durationSeconds > 0
            ? count / durationSeconds
            : undefined,
        count,
        id: topic.streamId,
        kind: streamKindForPayload(topic.payload),
        metadata: {
          ...topic.metadata,
          ...(calibrationSourceName
            ? {
                [SCENE_SOURCE_METADATA.CALIBRATION_STREAM_ID]:
                  streamIdsBySourceName.get(calibrationSourceName) ??
                  calibrationSourceName,
              }
            : {}),
        },
        payload: {
          encoding: topic.payload?.encoding ?? "unknown",
          schema: topic.payload?.schema,
          schemaEncoding: topic.payload?.schemaEncoding,
        },
        sourceName,
        timeRange,
      };
    }),
    timeDomain: { id: MCAP_ACTIVE_TIMELINE.LOG, kind: "timestamp" },
    timeRange,
  };
}

function mcapSourceName(topic: {
  readonly displayName?: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly streamId: string;
}): string {
  return topic.metadata["mcap.topic"] ?? topic.displayName ?? topic.streamId;
}

function parseRecordCount(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
}

function streamKindForPayload(
  payload: { readonly encoding?: string; readonly schema?: string } | undefined,
): StreamKind {
  const identity =
    `${payload?.encoding ?? ""} ${payload?.schema ?? ""}`.toLowerCase();
  if (/compressedimage|rawimage|sensor_msgs\/(msg\/)?image/.test(identity)) {
    return STREAM_KIND.IMAGE;
  }
  if (/compressedvideo|h264|h265|hevc|av1|vp9/.test(identity)) {
    return STREAM_KIND.VIDEO;
  }
  if (/pointcloud|laserscan|radar/.test(identity)) {
    return STREAM_KIND.POINT_CLOUD;
  }
  if (/camera(calibration|info)/.test(identity)) {
    return STREAM_KIND.CAMERA_CALIBRATION;
  }
  if (/imageannotations/.test(identity)) {
    return STREAM_KIND.IMAGE_ANNOTATIONS;
  }
  if (/scene(update|entity)/.test(identity)) {
    return STREAM_KIND.SCENE_UPDATE;
  }
  if (/navsat|location|gps/.test(identity)) {
    return STREAM_KIND.LOCATION;
  }
  if (/(^|\W)(tf2?_msgs|transform)/.test(identity)) {
    return STREAM_KIND.TRANSFORM;
  }
  if (/pose|odometry/.test(identity)) {
    return STREAM_KIND.POSE;
  }
  if (/grid/.test(identity)) {
    return STREAM_KIND.GRID;
  }
  if (/(?:^|\W)(log|diagnostic)/.test(identity)) {
    return STREAM_KIND.LOG;
  }
  return STREAM_KIND.UNKNOWN;
}

class McapEpisodeSession implements EpisodeSession {
  readonly manifest: EpisodeManifest;
  readonly numericSeries: NumericSeriesCapability;
  readonly playback: PlaybackReadCapability;
  readonly rawRecords: RawRecordCapability;
  readonly transformRead: TransformReadAcceleration;
  private disposed = false;
  private decodedFrames = 0;
  private readRequests = 0;
  private returnedBatches = 0;
  private readonly sourceNamesById: ReadonlyMap<string, string>;

  constructor(
    private readonly client: McapResourceClient,
    private readonly source: ByteSourceDescriptor,
    manifest: EpisodeManifest,
    timelineRange: {
      readonly activeTimeline: string;
      readonly byteTimeline?: readonly {
        readonly cumulativeCompressedBytes: number;
        readonly endTimeNs: bigint;
        readonly startOffsetBytes: bigint;
      }[];
      readonly endTimeNs: bigint;
      readonly startTimeNs: bigint;
    },
    private readonly releaseClient: () => void,
  ) {
    this.manifest = manifest;
    this.sourceNamesById = new Map(
      manifest.streams.map((stream) => [stream.id, stream.sourceName]),
    );
    this.numericSeries = createMcapNumericSeriesCapability({
      client,
      source,
      streams: manifest.streams,
    });
    this.rawRecords = createMcapRawRecordCapability({
      client,
      source,
      streams: manifest.streams,
    });
    this.playback = this.createPlaybackCapability(timelineRange);
    this.transformRead = this.createTransformReadAcceleration();
  }

  activate(): void {
    this.ensureOpen();
    this.client.activateSource?.(this.source);
  }

  cancelIdle(): void {
    this.ensureOpen();
    this.client.cancelIdleReads?.();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseClient();
  }

  async *read(request: ReadRequest): AsyncIterable<FrameBatch> {
    this.ensureOpen();
    throwIfAborted(request.signal);
    this.readRequests += 1;
    const requestedStreams = new Set(request.streams);
    const topics = request.streams.map(
      (stream) => this.sourceNamesById.get(stream) ?? stream,
    );
    try {
      for await (const message of this.client.readDecodedMessages(
        {
          activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
          endTimeNs: request.window.endNs,
          limit: request.limit,
          source: this.source,
          startTimeNs: request.window.startNs,
          topics,
        },
        { priority: request.priority },
      )) {
        this.ensureOpen();
        throwIfAborted(request.signal);
        const frame = decodedFrameFromMcap(message, this.manifest.streams);
        if (!requestedStreams.has(frame.streamId)) continue;
        this.decodedFrames += 1;
        this.returnedBatches += 1;
        yield { frames: [frame], stream: frame.streamId };
      }
    } catch (error) {
      if (isEpisodeReadCancelledError(error)) {
        throw new EpisodeReadCancelledError();
      }
      throw error;
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

  private createPlaybackCapability(timelineRange: {
    readonly byteTimeline?: readonly {
      readonly cumulativeCompressedBytes: number;
      readonly endTimeNs: bigint;
      readonly startOffsetBytes: bigint;
    }[];
    readonly endTimeNs: bigint;
    readonly startTimeNs: bigint;
  }): PlaybackReadCapability {
    return {
      timeline: {
        byteTimeline: timelineRange.byteTimeline,
        endNs: timelineRange.endTimeNs,
        startNs: timelineRange.startTimeNs,
        timeDomainId: this.manifest.timeDomain.id,
      },
      readStreamTimeBounds: async (streams) => {
        this.ensureOpen();
        const bounds = await this.client.readTopicTimeBounds({
          activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
          source: this.source,
          topics: streams.map((stream) => this.sourceNameFor(stream)),
        });
        return bounds.map((bound) => ({
          firstTimestampNs: bound.firstMessageTimeNs,
          lastTimestampNs: bound.lastMessageTimeNs,
          streamId: this.streamIdFor(bound.topic),
        }));
      },
      readSynchronized: async (request) => {
        this.ensureOpen();
        try {
          const window = await this.client.readSynchronizedMessages({
            activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
            defaultStreamPolicy: toMcapSyncPolicy(request.defaultStreamPolicy),
            source: this.source,
            streamPolicies: this.toMcapSyncPolicies(request.streamPolicies),
            timeNs: request.timeNs,
            topics: request.streams.map((stream) => this.sourceNameFor(stream)),
          });
          return this.fromMcapWindow(window);
        } catch (error) {
          throw this.normalizeReadError(error);
        }
      },
      readSynchronizedBatch: async (request, options) => {
        this.ensureOpen();
        try {
          const windows = await this.client.readSynchronizedMessageBatch(
            {
              activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
              defaultStreamPolicy: toMcapSyncPolicy(
                request.defaultStreamPolicy,
              ),
              source: this.source,
              streamPolicies: this.toMcapSyncPolicies(request.streamPolicies),
              timeNs: request.timeNs,
              topics: request.streams.map((stream) =>
                this.sourceNameFor(stream),
              ),
            },
            options,
          );
          return windows.map((window) => this.fromMcapWindow(window));
        } catch (error) {
          throw this.normalizeReadError(error);
        }
      },
      ...(this.client.subscribeTransport
        ? {
            subscribeTransport: (listener) =>
              this.client.subscribeTransport?.(listener) ?? (() => undefined),
          }
        : {}),
    };
  }

  private createTransformReadAcceleration(): TransformReadAcceleration {
    return {
      readBootstrap: async () => {
        this.ensureOpen();
        try {
          const result = await this.client.readFrameTransformBootstrap({
            source: this.source,
          });
          return result.samples.map(transformSampleFromMcap);
        } catch (error) {
          throw this.normalizeReadError(error);
        }
      },
      readTransforms: async (request) => {
        this.ensureOpen();
        try {
          const result = await this.client.readFrameTransformWindow(
            {
              activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
              endTimeNs: request.window.endNs,
              source: this.source,
              startTimeNs: request.window.startNs,
            },
            { priority: request.priority },
          );
          return result.samples.map(transformSampleFromMcap);
        } catch (error) {
          throw this.normalizeReadError(error);
        }
      },
    };
  }

  private fromMcapWindow(
    window: Awaited<ReturnType<McapResourceClient["readSynchronizedMessages"]>>,
  ): SynchronizedFrameWindow {
    const frames = window.messages.map((message) =>
      decodedFrameFromMcap(message, this.manifest.streams),
    );
    return {
      diagnosticsByStream: mapRecord(
        window.decodeErrorsByTopic,
        (topic, diagnostics) => [
          this.streamIdFor(topic),
          diagnostics.map((diagnostic) => ({
            code: "frame-decode-failed" as const,
            message: diagnostic.message,
            payloadIdentity: diagnostic.payloadIdentity,
            requestedTimeNs: diagnostic.requestedTimeNs,
            streamId: this.streamIdFor(topic),
            timestampNs: diagnostic.messageTimeNs,
          })),
        ],
      ),
      endNs: window.endTimeNs,
      frames,
      framesByStream:
        mapRecord(window.messagesByTopic, (topic, messages) => [
          this.streamIdFor(topic),
          messages.map((message) =>
            decodedFrameFromMcap(message, this.manifest.streams),
          ),
        ]) ?? {},
      startNs: window.startTimeNs,
      streamPolicies:
        mapRecord(window.streamPolicies, (topic, policy) => [
          this.streamIdFor(topic),
          resolvedSyncPolicyFromMcap(policy),
        ]) ?? {},
      timeNs: window.timeNs,
    };
  }

  private normalizeReadError(error: unknown): unknown {
    return isEpisodeReadCancelledError(error)
      ? new EpisodeReadCancelledError()
      : error;
  }

  private sourceNameFor(stream: string): string {
    return this.sourceNamesById.get(stream) ?? stream;
  }

  private streamIdFor(sourceName: string): string {
    return (
      this.manifest.streams.find((stream) => stream.sourceName === sourceName)
        ?.id ?? sourceName
    );
  }

  private toMcapSyncPolicies(
    policies: Readonly<Record<string, StreamSyncPolicy>> | undefined,
  ): McapStreamSyncPolicies | undefined {
    if (!policies) return undefined;
    return Object.fromEntries(
      Object.entries(policies).map(([stream, policy]) => [
        this.sourceNameFor(stream),
        toMcapSyncPolicy(policy) as McapStreamSyncPolicy,
      ]),
    );
  }

  private ensureOpen(): void {
    if (this.disposed) throw new EpisodeReadCancelledError();
  }
}

function ownedClient(client: McapResourceClient): {
  readonly client: McapResourceClient;
  readonly release: () => void;
} {
  return { client, release: () => client.dispose() };
}

function toMcapSyncPolicy(
  policy: StreamSyncPolicy | undefined,
): McapStreamSyncPolicy | undefined {
  if (!policy) return undefined;
  return {
    ...policy,
    mode: policy.mode === undefined ? undefined : syncModeToMcap(policy.mode),
  };
}

function syncModeToMcap(mode: StreamSyncMode): PlaybackSyncMode {
  switch (mode) {
    case STREAM_SYNC_MODE.NEAREST:
      return PlaybackSyncMode.NEAREST;
    case STREAM_SYNC_MODE.STRICT:
      return PlaybackSyncMode.STRICT;
    case STREAM_SYNC_MODE.LATEST:
      return PlaybackSyncMode.LATEST;
  }
}

function syncModeFromMcap(mode: PlaybackSyncMode): StreamSyncMode {
  switch (mode) {
    case PlaybackSyncMode.NEAREST:
      return STREAM_SYNC_MODE.NEAREST;
    case PlaybackSyncMode.STRICT:
      return STREAM_SYNC_MODE.STRICT;
    case PlaybackSyncMode.LATEST:
    case PlaybackSyncMode.UNSPECIFIED:
      return STREAM_SYNC_MODE.LATEST;
    default:
      return STREAM_SYNC_MODE.LATEST;
  }
}

function resolvedSyncPolicyFromMcap(policy: {
  readonly endTimeNs: bigint;
  readonly limit: number;
  readonly mode: PlaybackSyncMode;
  readonly startTimeNs?: bigint;
}): ResolvedStreamSyncPolicy {
  return {
    endNs: policy.endTimeNs,
    limit: policy.limit,
    mode: syncModeFromMcap(policy.mode),
    startNs: policy.startTimeNs,
  };
}

function transformSampleFromMcap(sample: {
  readonly childFrameId: string;
  readonly parentFrameId: string;
  readonly rotation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
  readonly timeNs?: bigint;
  readonly translation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}): TransformSample {
  return {
    childFrameId: sample.childFrameId,
    parentFrameId: sample.parentFrameId,
    quaternion: [
      sample.rotation.x,
      sample.rotation.y,
      sample.rotation.z,
      sample.rotation.w,
    ],
    timestampNs: sample.timeNs,
    translation: [
      sample.translation.x,
      sample.translation.y,
      sample.translation.z,
    ],
  };
}

function mapRecord<Input, Output>(
  record: Readonly<Record<string, Input>> | undefined,
  map: (key: string, value: Input) => readonly [string, Output],
): Readonly<Record<string, Output>> | undefined {
  return record
    ? Object.fromEntries(
        Object.entries(record).map(([key, value]) => map(key, value)),
      )
    : undefined;
}

function decodedFrameFromMcap(
  message: McapDecodedMessage,
  streams: readonly StreamDescriptor[],
): DecodedFrame {
  const stream = streams.find(
    (candidate) => candidate.sourceName === message.topic,
  );
  return {
    output: message.decoded.output,
    sequence: message.sequence,
    sourceTimestamps: {
      ...message.decoded.output.timing?.sourceTimestamps,
      logTime: message.logTimeNs,
      publishTime: message.publishTimeNs,
    },
    streamId: stream?.id ?? message.topic,
    timestampNs: message.timelineTimeNs,
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  throw error;
}
