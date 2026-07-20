import {
  STREAM_KIND,
  VISUALIZATION_KIND,
  type DecodedFrame,
  type DecodedOutput,
  type EpisodeManifest,
  type StreamDescriptor,
  type StreamKind,
  type TransformSample,
} from "../../ir";
import {
  EpisodeReadCancelledError,
  type EpisodeSession,
  type EpisodeSource,
  type FormatAdapter,
  type FrameBatch,
  type ReadPriority,
  type ReadRequest,
  type SourceStats,
} from "../../ports";

const FIXTURE_START_NS = 1_000_000_000n;
const FIXTURE_STEP_NS = 100_000_000n;
const PRIORITY_ORDER: Readonly<Record<ReadPriority, number>> = {
  current: 0,
  playback: 1,
  bulk: 2,
  idle: 3,
};

/** Deterministic fixture adapter configuration. */
export interface FixtureAdapterOptions {
  readonly frameCount?: number;
  readonly latencyMs?: number;
  readonly poisonedFrame?: {
    readonly index: number;
    readonly streamId: string;
  };
  readonly seed?: number;
}

/** Creates a deterministic, dependency-free adapter for contract and perf tests. */
export function createFixtureFormatAdapter(
  options: FixtureAdapterOptions = {},
): FormatAdapter {
  const normalized = {
    frameCount: Math.max(1, Math.trunc(options.frameCount ?? 4)),
    latencyMs: Math.max(0, options.latencyMs ?? 0),
    poisonedFrame: options.poisonedFrame,
    seed: Math.trunc(options.seed ?? 1),
  };
  let activeSession: FixtureEpisodeSession | null = null;

  return {
    id: "fixture",
    async open(source) {
      await source.assets.list();
      const session = new FixtureEpisodeSession(source, normalized, () => {
        if (activeSession && activeSession !== session) {
          activeSession.deactivate();
        }
        activeSession = session;
      });
      return session;
    },
  };
}

class FixtureEpisodeSession implements EpisodeSession {
  readonly manifest: EpisodeManifest;
  readonly synchronizedRead = {
    readSynchronized: (request: ReadRequest) => this.collect(request),
  };
  readonly transformRead = {
    readTransforms: async (request: ReadRequest) =>
      (await this.collect(request))
        .flatMap((batch) =>
          batch.frames.flatMap((frame) => frame.output.transforms ?? []),
        )
        .sort(compareTransforms),
  };
  private readonly framesByStream: ReadonlyMap<string, readonly DecodedFrame[]>;
  private readonly scheduler = new FixtureReadScheduler();
  private disposed = false;
  private generation = 0;
  private idleGeneration = 0;
  private decodedFrames = 0;
  private readRequests = 0;
  private returnedBatches = 0;

  constructor(
    source: EpisodeSource,
    private readonly options: Required<
      Pick<FixtureAdapterOptions, "frameCount" | "latencyMs" | "seed">
    > &
      Pick<FixtureAdapterOptions, "poisonedFrame">,
    private readonly onActivate: () => void,
  ) {
    const streams = createFixtureStreams(options.frameCount);
    this.manifest = source.manifestHint ?? {
      episodeId: source.episodeId,
      metadata: { fixtureSeed: options.seed.toString() },
      streams,
      timeDomain: { id: "fixture-time", kind: "duration", originNs: 0n },
      timeRange: {
        endNs:
          FIXTURE_START_NS + BigInt(options.frameCount - 1) * FIXTURE_STEP_NS,
        startNs: FIXTURE_START_NS,
      },
    };
    this.framesByStream = new Map(
      this.manifest.streams.map((stream) => [
        stream.id,
        createFixtureFrames(stream, options),
      ]),
    );
  }

  activate(): void {
    this.ensureOpen();
    this.onActivate();
  }

  cancelIdle(): void {
    this.ensureOpen();
    this.idleGeneration += 1;
    this.scheduler.cancel(
      (priority) => priority === "bulk" || priority === "idle",
    );
  }

  deactivate(): void {
    if (this.disposed) return;
    this.generation += 1;
    this.scheduler.cancel(() => true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.scheduler.cancel(() => true);
  }

  async *read(request: ReadRequest): AsyncIterable<FrameBatch> {
    this.ensureOpen();
    throwIfAborted(request.signal);
    this.readRequests += 1;
    const generation = this.generation;
    const idleGeneration = this.idleGeneration;
    const priority = request.priority ?? "playback";
    await this.scheduler.schedule(
      priority,
      this.options.latencyMs,
      request.signal,
    );
    this.ensureGeneration(generation);
    this.ensureIdleGeneration(priority, idleGeneration);

    for (const stream of request.streams) {
      throwIfAborted(request.signal);
      this.ensureGeneration(generation);
      this.ensureIdleGeneration(priority, idleGeneration);
      const frames = (this.framesByStream.get(stream) ?? []).filter(
        (frame) =>
          frame.timestampNs >= request.window.startNs &&
          frame.timestampNs <= request.window.endNs,
      );
      if (frames.length === 0) continue;
      this.decodedFrames += frames.length;
      this.returnedBatches += 1;
      yield { frames, stream };
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

  private async collect(request: ReadRequest): Promise<readonly FrameBatch[]> {
    const batches: FrameBatch[] = [];
    for await (const batch of this.read(request)) batches.push(batch);
    return batches;
  }

  private ensureGeneration(generation: number): void {
    this.ensureOpen();
    if (generation !== this.generation) throw new EpisodeReadCancelledError();
  }

  private ensureIdleGeneration(
    priority: ReadPriority,
    idleGeneration: number,
  ): void {
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
}

function compareTransforms(
  left: TransformSample,
  right: TransformSample,
): number {
  const leftTimeNs = left.timestampNs ?? -1n;
  const rightTimeNs = right.timestampNs ?? -1n;
  return leftTimeNs < rightTimeNs ? -1 : leftTimeNs > rightTimeNs ? 1 : 0;
}

interface ScheduledRead {
  readonly cancel: () => void;
  readonly priority: ReadPriority;
  readonly reject: (error: unknown) => void;
  resolve: () => void;
}

class FixtureReadScheduler {
  private active: ScheduledRead | null = null;
  private drainQueued = false;
  private readonly queued: ScheduledRead[] = [];

  schedule(
    priority: ReadPriority,
    latencyMs: number,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        callback();
        if (this.active === task) this.active = null;
        this.queueDrain();
      };
      const abort = () => finish(() => reject(abortError()));
      const task: ScheduledRead = {
        cancel: () => finish(() => reject(new EpisodeReadCancelledError())),
        priority,
        reject,
        resolve,
      };
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      task.resolve = () => {
        timer = setTimeout(() => finish(resolve), latencyMs);
      };
      this.queued.push(task);
      this.queueDrain();
    });
  }

  cancel(predicate: (priority: ReadPriority) => boolean): void {
    if (this.active && predicate(this.active.priority)) this.active.cancel();
    for (const task of [...this.queued]) {
      if (predicate(task.priority)) task.cancel();
    }
    for (let index = this.queued.length - 1; index >= 0; index -= 1) {
      if (predicate(this.queued[index].priority)) this.queued.splice(index, 1);
    }
  }

  private queueDrain(): void {
    if (this.drainQueued) return;
    this.drainQueued = true;
    queueMicrotask(() => {
      this.drainQueued = false;
      if (this.active || this.queued.length === 0) return;
      this.queued.sort(
        (left, right) =>
          PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority],
      );
      this.active = this.queued.shift() ?? null;
      this.active?.resolve();
    });
  }
}

function createFixtureStreams(frameCount: number): readonly StreamDescriptor[] {
  const timeRange = {
    endNs: FIXTURE_START_NS + BigInt(frameCount - 1) * FIXTURE_STEP_NS,
    startNs: FIXTURE_START_NS,
  };
  return Object.values(STREAM_KIND).map((kind) => ({
    approxRateHz: 10,
    count: frameCount,
    id: `fixture-${kind}`,
    kind,
    payload: { encoding: "fixture", schema: `fixture/${kind}` },
    sourceName: `Fixture ${kind}`,
    timeRange,
  }));
}

function createFixtureFrames(
  stream: StreamDescriptor,
  options: {
    readonly frameCount: number;
    readonly poisonedFrame?: FixtureAdapterOptions["poisonedFrame"];
    readonly seed: number;
  },
): readonly DecodedFrame[] {
  return Array.from({ length: options.frameCount }, (_, index) => {
    const timestampNs = FIXTURE_START_NS + BigInt(index) * FIXTURE_STEP_NS;
    const output = fixtureOutput(
      stream.kind,
      timestampNs,
      options.seed + index,
    );
    const poisoned =
      options.poisonedFrame?.streamId === stream.id &&
      options.poisonedFrame.index === index;
    return {
      output: poisoned
        ? {
            ...output,
            diagnostics: [
              {
                code: "fixture-decode-failed",
                message: "Injected fixture decode failure",
                severity: "warning",
              },
            ],
          }
        : output,
      sequence: index,
      sourceTimestamps: { fixture: timestampNs },
      streamId: stream.id,
      timestampNs,
    };
  });
}

function fixtureOutput(
  kind: StreamKind,
  timestampNs: bigint,
  seed: number,
): DecodedOutput {
  const bytes = new Uint8Array([seed & 255, (seed * 17) & 255, 0, 255]);
  const resourceHints = {
    sizeBytes: bytes.byteLength,
    transferables: [bytes.buffer],
  };
  switch (kind) {
    case STREAM_KIND.CAMERA_CALIBRATION:
      return {
        resourceHints,
        visualization: {
          D: [],
          K: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          height: 1,
          kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
          timestampNs,
          width: 1,
        },
      };
    case STREAM_KIND.GRID:
      return {
        resourceHints,
        visualization: {
          cellSize: [1, 1],
          columnCount: 1,
          kind: VISUALIZATION_KIND.GRID,
          pose: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
          rgba: bytes,
          rowCount: 1,
          timestampNs,
        },
      };
    case STREAM_KIND.IMAGE:
      return {
        resourceHints,
        visualization: {
          height: 1,
          kind: VISUALIZATION_KIND.RAW_IMAGE,
          rgba: bytes,
          sourceEncoding: "rgba8",
          timestampNs,
          width: 1,
        },
      };
    case STREAM_KIND.IMAGE_ANNOTATIONS:
      return {
        resourceHints,
        visualization: {
          circles: [],
          kind: VISUALIZATION_KIND.IMAGE_ANNOTATIONS,
          points: [],
          texts: [],
        },
      };
    case STREAM_KIND.LOCATION:
      return {
        resourceHints,
        visualization: {
          kind: VISUALIZATION_KIND.LOCATION,
          latitude: 37 + seed / 10_000,
          longitude: -122,
          timestampNs,
        },
      };
    case STREAM_KIND.LOG:
      return {
        attributes: {
          level: "info",
          message: `Fixture log ${seed}`,
        },
        resourceHints,
      };
    case STREAM_KIND.POINT_CLOUD: {
      const positions = new Float32Array([seed, 0, 0]);
      return {
        resourceHints: {
          sizeBytes: positions.byteLength,
          transferables: [positions.buffer],
        },
        visualization: {
          fields: [],
          kind: VISUALIZATION_KIND.POINT_CLOUD,
          pointCount: 1,
          positions,
        },
      };
    }
    case STREAM_KIND.POSE:
      return {
        resourceHints,
        visualization: {
          kind: VISUALIZATION_KIND.POSE,
          position: [seed, 0, 0],
          quaternion: [0, 0, 0, 1],
          timestampNs,
        },
      };
    case STREAM_KIND.SCALAR:
      return {
        resourceHints,
        scalars: [{ field: "value", timestampNs, value: seed }],
      };
    case STREAM_KIND.SCENE_UPDATE:
      return {
        resourceHints,
        visualization: {
          deletions: [],
          entities: [],
          kind: VISUALIZATION_KIND.SCENE_UPDATE,
        },
      };
    case STREAM_KIND.TRANSFORM:
      return {
        resourceHints,
        transforms: [
          {
            childFrameId: "sensor",
            parentFrameId: "world",
            quaternion: [0, 0, 0, 1],
            timestampNs,
            translation: [seed, 0, 0],
          },
        ],
      };
    case STREAM_KIND.VIDEO:
      return {
        resourceHints,
        visualization: {
          bytes,
          codec: "h264",
          format: "annex-b",
          h264: {},
          kind: VISUALIZATION_KIND.ENCODED_VIDEO,
          timestampNs,
        },
      };
    case STREAM_KIND.UNKNOWN:
      return { attributes: { fixtureSeed: seed }, resourceHints };
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}
