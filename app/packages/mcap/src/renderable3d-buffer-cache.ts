import type * as THREE from "three";
import type { BufferReadiness } from "@fiftyone/playback/experimental/types";
import type { Scene3dFrame, Scene3dPrimitive } from "./archetypes";
import { BoundedLruCache } from "./bounded-lru-cache";
import { FoxgloveSceneUpdateStateCache } from "./foxglove-sceneupdate-state-cache";
import {
  MultimodalRawMessageWindowCache,
  type RawMessageWindowCacheOptions,
} from "./raw-message-window-cache";
import { BUILTIN_SCHEMA_CODEC_REGISTRY } from "./schema-codec-registry";
import { applyTransformToScene3dPrimitive } from "./transform-runtime";
import type { MultimodalRawMessage } from "./types";

type WarmDecodeOptions = {
  behindCount?: number;
  aheadCount?: number;
};

/** Decoded 3D scene frame metadata cached for one raw Multimodal message. */
export type MultimodalDecodedScene3dFrame = Scene3dFrame & {
  messageId: string;
  logTimeNs: number;
  publishTimeNs: number;
  schemaName: string;
  warnings: string[];
};

type Renderable3dBufferCacheOptions = RawMessageWindowCacheOptions & {
  schemaName: string;
  maxDecodedFrameEntries?: number;
  maxDecodedFrameBytes?: number;
  maxSceneUpdateDecodedEntries?: number;
  maxSceneUpdateCheckpointEntries?: number;
};

type DecodeInFrameOptions = {
  targetFrameId: string;
  transformRevision: number;
  resolveTransformMatrix: (
    sourceFrameId: string | null | undefined,
    targetFrameId: string | null | undefined
  ) => THREE.Matrix4 | null;
  warningContext: string;
};

/** Small per-stream cache for buffered raw Multimodal windows and decoded 3D frames. */
export class MultimodalRenderable3dBufferCache {
  private readonly rawWindowCache: MultimodalRawMessageWindowCache;
  private readonly schemaName: string;
  private readonly sceneUpdateCache: FoxgloveSceneUpdateStateCache | null;
  private readonly decodedFrames: BoundedLruCache<
    string,
    MultimodalDecodedScene3dFrame
  >;
  private readonly pendingFrames = new Map<
    string,
    Promise<MultimodalDecodedScene3dFrame>
  >();
  private readonly transformedFrames: BoundedLruCache<
    string,
    MultimodalDecodedScene3dFrame
  >;
  private readonly pendingTransformedFrames = new Map<
    string,
    Promise<MultimodalDecodedScene3dFrame>
  >();

  constructor(options: Renderable3dBufferCacheOptions) {
    this.rawWindowCache = new MultimodalRawMessageWindowCache(options);
    this.schemaName = options.schemaName;
    const maxDecodedFrameEntries = options.maxDecodedFrameEntries ?? 24;
    const maxDecodedFrameBytes =
      options.maxDecodedFrameBytes ?? 256 * 1024 * 1024;
    this.decodedFrames = new BoundedLruCache({
      maxEntries: maxDecodedFrameEntries,
      maxBytes: maxDecodedFrameBytes,
      getSizeBytes: estimateScene3dFrameSize,
    });
    this.transformedFrames = new BoundedLruCache({
      maxEntries: maxDecodedFrameEntries,
      maxBytes: maxDecodedFrameBytes,
      getSizeBytes: estimateScene3dFrameSize,
    });
    this.sceneUpdateCache =
      options.schemaName === "foxglove.SceneUpdate"
        ? new FoxgloveSceneUpdateStateCache({
            ...options,
            maxDecodedUpdateEntries: options.maxSceneUpdateDecodedEntries,
            maxCheckpointEntries: options.maxSceneUpdateCheckpointEntries,
          })
        : null;
  }

  /** Ensures all fixed fetch windows covering the requested range are buffered. */
  async ensureRange(range: RawMessageWindowCacheOptions["sceneRange"]) {
    if (this.sceneUpdateCache) {
      await this.sceneUpdateCache.ensureRange(range);
      return;
    }

    await this.rawWindowCache.ensureRange(range);
  }

  /** Seeds the raw cache with already-fetched boot-time messages. */
  primeMessages(
    messages: MultimodalRawMessage[],
    window?: RawMessageWindowCacheOptions["sceneRange"]
  ) {
    if (this.sceneUpdateCache) {
      this.sceneUpdateCache.primeMessages(messages, window);
      return;
    }

    this.rawWindowCache.primeMessages(messages, window);
  }

  /** Returns the raw cached message matching the requested log time. */
  getMessageForLogTime(logTimeNs: number): MultimodalRawMessage | null {
    if (this.sceneUpdateCache) {
      return this.sceneUpdateCache.getMessageForLogTime(logTimeNs);
    }

    return this.rawWindowCache.getMessageForLogTime(logTimeNs);
  }

  /** Returns cached sync samples derived from the current raw message set. */
  getSyncSamples() {
    if (this.sceneUpdateCache) {
      return this.sceneUpdateCache.getSyncSamples();
    }

    return this.rawWindowCache.getSyncSamples();
  }

  /** Returns cached sync timestamps derived from the current raw message set. */
  getSyncTimestamps() {
    if (this.sceneUpdateCache) {
      return this.sceneUpdateCache.getSyncTimestamps();
    }

    return this.rawWindowCache.getSyncTimestamps();
  }

  /** Returns the raw-window version so playback bookkeeping can memoize cheaply. */
  getVersion() {
    if (this.sceneUpdateCache) {
      return this.sceneUpdateCache.getVersion();
    }

    return this.rawWindowCache.getVersion();
  }

  /** Reports whether the raw message window containing this timestamp is ready. */
  getMessageReadiness(logTimeNs: number): BufferReadiness {
    if (this.sceneUpdateCache) {
      return this.sceneUpdateCache.getMessageReadiness(logTimeNs);
    }

    return this.rawWindowCache.getTimeReadiness(logTimeNs);
  }

  /** Decodes one raw Multimodal 3D message and returns a cached frame. */
  async decodeMessage(
    message: MultimodalRawMessage
  ): Promise<MultimodalDecodedScene3dFrame> {
    const cachedFrame = this.decodedFrames.get(message.messageId);
    if (cachedFrame) {
      return cachedFrame;
    }

    const existingFrame = this.pendingFrames.get(message.messageId);
    if (existingFrame) {
      return existingFrame;
    }

    const decodePromise = this.decodeBySchema(message)
      .then((decoded) => {
        const frame = {
          ...decoded.frame,
          id: message.messageId,
          primitives: decoded.frame.primitives.map((primitive, index) => ({
            ...primitive,
            id: `${message.messageId}:${primitive.id || index}`,
          })),
          messageId: message.messageId,
          logTimeNs: message.logTimeNs,
          publishTimeNs: message.publishTimeNs,
          schemaName: this.schemaName,
          warnings: "warnings" in decoded ? decoded.warnings ?? [] : [],
        };

        this.decodedFrames.set(message.messageId, frame);
        return frame;
      })
      .finally(() => {
        this.pendingFrames.delete(message.messageId);
      });

    this.pendingFrames.set(message.messageId, decodePromise);
    return decodePromise;
  }

  /** Decodes one raw message into a requested target frame and memoizes it by TF revision. */
  async decodeMessageInFrame(
    message: MultimodalRawMessage,
    options: DecodeInFrameOptions
  ): Promise<MultimodalDecodedScene3dFrame> {
    const cacheKey = [
      message.messageId,
      options.targetFrameId,
      options.transformRevision,
    ].join("::");
    const cachedFrame = this.transformedFrames.get(cacheKey);
    if (cachedFrame) {
      return cachedFrame;
    }

    const existingFrame = this.pendingTransformedFrames.get(cacheKey);
    if (existingFrame) {
      return existingFrame;
    }

    const transformPromise = (async () => {
      const decoded = await this.decodeMessage(message);
      if (canReuseFrameInTargetFrame(decoded, options.targetFrameId)) {
        return decoded;
      }

      try {
        const warnings = [...(decoded.warnings ?? [])];
        const frameAccumulator = {
          bounds: {
            min: [0, 0, 0] as [number, number, number],
            max: [0, 0, 0] as [number, number, number],
          },
          hasBounds: false,
          pointCount: 0,
        };
        const transformedPrimitives = [];

        for (const primitive of decoded.primitives) {
          const sourceFrameId = primitive.frameId ?? decoded.frameId ?? null;
          if (!sourceFrameId) {
            warnings.push(
              `Missing frame id for ${options.warningContext} while targeting ${options.targetFrameId}`
            );
            continue;
          }

          if (sourceFrameId === options.targetFrameId) {
            accumulatePrimitiveStats(frameAccumulator, primitive);
            transformedPrimitives.push({
              ...primitive,
              frameId: options.targetFrameId,
            });
            continue;
          }

          const matrix = options.resolveTransformMatrix(
            sourceFrameId,
            options.targetFrameId
          );
          if (!matrix) {
            warnings.push(
              `No transform from ${sourceFrameId} to ${options.targetFrameId} for ${options.warningContext}`
            );
            continue;
          }

          transformedPrimitives.push(
            applyTransformToScene3dPrimitive(
              primitive,
              matrix,
              options.targetFrameId,
              frameAccumulator
            )
          );
        }

        const frame = {
          ...decoded,
          id: decoded.id,
          pointCount: frameAccumulator.pointCount,
          bounds: frameAccumulator.hasBounds
            ? frameAccumulator.bounds
            : {
                min: [0, 0, 0] as [number, number, number],
                max: [0, 0, 0] as [number, number, number],
              },
          primitives: transformedPrimitives,
          frameId: options.targetFrameId,
          warnings,
        };
        this.transformedFrames.set(cacheKey, frame);
        return frame;
      } finally {
        this.pendingTransformedFrames.delete(cacheKey);
      }
    })();

    this.pendingTransformedFrames.set(cacheKey, transformPromise);
    return transformPromise;
  }

  /** Warms cached 3D decodes around one playback timestamp. */
  async warmMessagesAroundLogTime(
    logTimeNs: number,
    options: WarmDecodeOptions = {}
  ): Promise<void> {
    const messages = this.sceneUpdateCache
      ? this.sceneUpdateCache.getMessagesAroundLogTime(logTimeNs, {
          aheadCount: options.aheadCount ?? 1,
          behindCount: options.behindCount ?? 0,
        })
      : this.rawWindowCache.getMessagesAroundLogTime(logTimeNs, {
          aheadCount: options.aheadCount ?? 1,
          behindCount: options.behindCount ?? 0,
        });

    await Promise.allSettled(
      messages.map((message) => this.decodeMessage(message))
    );
  }

  /** Disposes decoded 3D frames and shared worker resources. */
  dispose() {
    this.pendingFrames.clear();
    this.pendingTransformedFrames.clear();
    this.decodedFrames.clear();
    this.transformedFrames.clear();
    this.rawWindowCache.dispose();
    this.sceneUpdateCache?.dispose();
    BUILTIN_SCHEMA_CODEC_REGISTRY.disposeScene3dResources(this.schemaName);
  }

  private async decodeBySchema(message: MultimodalRawMessage) {
    if (this.sceneUpdateCache) {
      return this.sceneUpdateCache.decodeMessage(message);
    }

    return BUILTIN_SCHEMA_CODEC_REGISTRY.decodeScene3dMessage(
      this.schemaName,
      message
    );
  }
}

function canReuseFrameInTargetFrame(
  frame: MultimodalDecodedScene3dFrame,
  targetFrameId: string
) {
  if ((frame.frameId ?? targetFrameId) !== targetFrameId) {
    return false;
  }

  return frame.primitives.every((primitive) => {
    return (primitive.frameId ?? frame.frameId ?? null) === targetFrameId;
  });
}

function estimateScene3dFrameSize(frame: Scene3dFrame) {
  return frame.primitives.reduce((totalBytes, primitive) => {
    return totalBytes + estimateScene3dPrimitiveSize(primitive);
  }, 0);
}

function estimateScene3dPrimitiveSize(primitive: Scene3dPrimitive) {
  switch (primitive.kind) {
    case "points":
      return (
        primitive.positions.byteLength +
        (primitive.intensity?.byteLength ?? 0) +
        (primitive.colors?.byteLength ?? 0)
      );
    case "line-list":
    case "line-strip":
      return (
        primitive.positions.byteLength + (primitive.colors?.byteLength ?? 0)
      );
    case "sphere-list":
    case "cube-list":
      return (
        primitive.positions.byteLength +
        primitive.scales.byteLength +
        (primitive.rotations?.byteLength ?? 0) +
        (primitive.colors?.byteLength ?? 0)
      );
    default:
      return 0;
  }
}

function accumulatePrimitiveStats(
  accumulator: {
    bounds: {
      min: [number, number, number];
      max: [number, number, number];
    };
    hasBounds: boolean;
    pointCount: number;
  },
  primitive: Scene3dPrimitive
) {
  accumulator.pointCount +=
    primitive.kind === "points"
      ? primitive.pointCount
      : primitive.positions.length / 3;

  for (let index = 0; index < primitive.positions.length; index += 3) {
    const x = primitive.positions[index];
    const y = primitive.positions[index + 1];
    const z = primitive.positions[index + 2];

    if (!accumulator.hasBounds) {
      accumulator.bounds.min = [x, y, z];
      accumulator.bounds.max = [x, y, z];
      accumulator.hasBounds = true;
      continue;
    }

    accumulator.bounds.min[0] = Math.min(accumulator.bounds.min[0], x);
    accumulator.bounds.min[1] = Math.min(accumulator.bounds.min[1], y);
    accumulator.bounds.min[2] = Math.min(accumulator.bounds.min[2], z);
    accumulator.bounds.max[0] = Math.max(accumulator.bounds.max[0], x);
    accumulator.bounds.max[1] = Math.max(accumulator.bounds.max[1], y);
    accumulator.bounds.max[2] = Math.max(accumulator.bounds.max[2], z);
  }
}
