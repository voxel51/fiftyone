import type { Points3dFrame } from "./archetypes";
import {
  disposePointCloud2WorkerClient,
  decodePointCloud2InWorker,
} from "./pointcloud2-worker-client";
import {
  McapRawMessageWindowCache,
  type RawMessageWindowCacheOptions,
} from "./raw-message-window-cache";
import type { McapRawMessage } from "./types";

/** Decoded point-cloud frame metadata cached for one raw MCAP message. */
export type McapDecodedPointCloudFrame = Points3dFrame & {
  messageId: string;
  logTimeNs: number;
  publishTimeNs: number;
};

/** Small per-stream cache for buffered raw MCAP windows and decoded point frames. */
export class McapPointCloudBufferCache {
  private readonly rawWindowCache: McapRawMessageWindowCache;
  private readonly decodedFrames = new Map<
    string,
    Promise<McapDecodedPointCloudFrame>
  >();

  constructor(options: RawMessageWindowCacheOptions) {
    this.rawWindowCache = new McapRawMessageWindowCache(options);
  }

  /** Ensures all fixed fetch windows covering the requested range are buffered. */
  async ensureRange(range: RawMessageWindowCacheOptions["sceneRange"]) {
    await this.rawWindowCache.ensureRange(range);
  }

  /** Returns the raw cached message matching the requested log time. */
  getMessageForLogTime(logTimeNs: number): McapRawMessage | null {
    return this.rawWindowCache.getMessageForLogTime(logTimeNs);
  }

  /** Decodes one raw MCAP point-cloud message and returns a cached frame. */
  async decodeMessage(
    message: McapRawMessage
  ): Promise<McapDecodedPointCloudFrame> {
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
