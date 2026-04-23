import type { BufferReadiness } from "@fiftyone/playback/experimental/types";
import type { Scene3dFrame } from "./archetypes";
import {
  disposePointCloud2WorkerClient,
  decodePointCloud2InWorker,
} from "./pointcloud2-worker-client";
import {
  MultimodalRawMessageWindowCache,
  type RawMessageWindowCacheOptions,
} from "./raw-message-window-cache";
import type { MultimodalRawMessage } from "./types";

/** Decoded point-cloud frame metadata cached for one raw Multimodal message. */
export type MultimodalDecodedPointCloudFrame = Scene3dFrame & {
  messageId: string;
  logTimeNs: number;
  publishTimeNs: number;
};

type WarmDecodeOptions = {
  behindCount?: number;
  aheadCount?: number;
};

/** Small per-stream cache for buffered raw Multimodal windows and decoded point frames. */
export class MultimodalPointCloudBufferCache {
  private readonly rawWindowCache: MultimodalRawMessageWindowCache;
  private readonly decodedFrames = new Map<
    string,
    Promise<MultimodalDecodedPointCloudFrame>
  >();

  constructor(options: RawMessageWindowCacheOptions) {
    this.rawWindowCache = new MultimodalRawMessageWindowCache(options);
  }

  /** Ensures all fixed fetch windows covering the requested range are buffered. */
  async ensureRange(range: RawMessageWindowCacheOptions["sceneRange"]) {
    await this.rawWindowCache.ensureRange(range);
  }

  /** Returns the raw cached message matching the requested log time. */
  getMessageForLogTime(logTimeNs: number): MultimodalRawMessage | null {
    return this.rawWindowCache.getMessageForLogTime(logTimeNs);
  }

  /** Reports whether the raw message window containing this timestamp is ready. */
  getMessageReadiness(logTimeNs: number): BufferReadiness {
    return this.rawWindowCache.getTimeReadiness(logTimeNs);
  }

  /** Decodes one raw Multimodal point-cloud message and returns a cached frame. */
  async decodeMessage(
    message: MultimodalRawMessage
  ): Promise<MultimodalDecodedPointCloudFrame> {
    const existingFrame = this.decodedFrames.get(message.messageId);
    if (existingFrame) {
      return existingFrame;
    }

    const decodePromise = decodePointCloud2InWorker({
      messageId: message.messageId,
      payload: this.copyPayloadBuffer(message.payload),
    }).then((decoded) => {
      return {
        ...decoded.frame,
        id: message.messageId,
        messageId: message.messageId,
        logTimeNs: message.logTimeNs,
        publishTimeNs: message.publishTimeNs,
      };
    });

    this.decodedFrames.set(message.messageId, decodePromise);
    return decodePromise;
  }

  /** Warms cached point-cloud decodes around one playback timestamp. */
  async warmMessagesAroundLogTime(
    logTimeNs: number,
    options: WarmDecodeOptions = {}
  ): Promise<void> {
    const messages = this.rawWindowCache.getMessagesAroundLogTime(logTimeNs, {
      aheadCount: options.aheadCount ?? 1,
      behindCount: options.behindCount ?? 0,
    });

    await Promise.allSettled(
      messages.map((message) => this.decodeMessage(message))
    );
  }

  /** Disposes decoded point-cloud frames and shared worker resources. */
  dispose() {
    this.decodedFrames.clear();
    this.rawWindowCache.dispose();
    disposePointCloud2WorkerClient();
  }

  private copyPayloadBuffer(payload: Uint8Array) {
    const view = Uint8Array.from(payload);
    return view.buffer;
  }
}
