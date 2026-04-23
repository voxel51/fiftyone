import type { BufferReadiness } from "@fiftyone/playback/experimental/types";
import type { Image2dFrame } from "./archetypes";
import { fetchMultimodalBuffer } from "./api";
import { BoundedLruCache } from "./bounded-lru-cache";
import { getCompressedImageMimeType } from "./compressed-image-decoder";
import {
  MultimodalRawMessageWindowCache,
  type RawMessageWindowCacheOptions,
} from "./raw-message-window-cache";
import { BUILTIN_SCHEMA_CODEC_REGISTRY } from "./schema-codec-registry";
import type {
  MultimodalRawBufferResponseStream,
  MultimodalRawMessage,
} from "./types";

/** Decoded image frame metadata cached for one raw Multimodal message. */
export type MultimodalDecodedImageFrame = Image2dFrame & {
  format: string;
  frameId: string;
  logTimeNs: number;
  publishTimeNs: number;
  objectUrl: string;
};

type WarmDecodeOptions = {
  behindCount?: number;
  aheadCount?: number;
};

type ImageBufferCacheOptions = RawMessageWindowCacheOptions & {
  schemaName?: string;
  maxDecodedFrameEntries?: number;
  maxDecodedFrameBytes?: number;
};

const DEFAULT_MAX_DECODED_IMAGE_FRAME_ENTRIES = 48;
const DEFAULT_MAX_DECODED_IMAGE_FRAME_BYTES = 64 * 1024 * 1024;

function getDecodedImageFrameBytes(image: HTMLImageElement) {
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  return width * height * 4;
}

async function preloadRenderableImage(
  objectUrl: string
): Promise<HTMLImageElement> {
  if (typeof Image === "undefined") {
    throw new Error("Image preload is unavailable in this environment");
  }

  const image = new Image();
  image.decoding = "async";

  const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`Failed to load image frame from ${objectUrl}`));
  });

  image.src = objectUrl;

  if (image.complete && (image.naturalWidth || image.width)) {
    return image;
  }

  if (typeof image.decode === "function") {
    try {
      await image.decode();
      return image;
    } catch {
      // Fall back to the load event for environments that reject decode()
      // while still populating onload for blob-backed images.
    }
  }

  return loadPromise;
}

/** Small per-stream cache for buffered raw Multimodal windows and decoded images. */
export class MultimodalImageBufferCache {
  private readonly rawWindowCache: MultimodalRawMessageWindowCache;
  private readonly schemaName: string;
  private readonly decodedFrames: BoundedLruCache<
    string,
    MultimodalDecodedImageFrame
  >;
  private readonly prefetchedImages = new Map<
    string,
    {
      format: string;
      frameId: string;
      compressedBytes: Uint8Array;
    }
  >();
  private readonly pendingFrames = new Map<
    string,
    Promise<MultimodalDecodedImageFrame>
  >();

  constructor(options: ImageBufferCacheOptions) {
    const schemaName = options.schemaName ?? "sensor_msgs/msg/CompressedImage";
    this.rawWindowCache = new MultimodalRawMessageWindowCache({
      ...options,
      loadWindow: async (window) => {
        const response = await fetchMultimodalBuffer({
          datasetId: options.datasetId,
          sampleId: options.sampleId,
          request: {
            mediaField: options.mediaField,
            sourceKind: options.sourceKind,
            streamIds: [options.streamId],
            startTimeNs: window.startNs,
            endTimeNs: window.endNs,
            mode: "raw",
          },
        });
        return response.streams[0] ?? null;
      },
      onStreamLoaded: (stream) => {
        this.primePrefetchedImages(stream);
      },
    });
    this.schemaName = schemaName;
    this.decodedFrames = new BoundedLruCache({
      maxEntries:
        options.maxDecodedFrameEntries ??
        DEFAULT_MAX_DECODED_IMAGE_FRAME_ENTRIES,
      maxBytes:
        options.maxDecodedFrameBytes ?? DEFAULT_MAX_DECODED_IMAGE_FRAME_BYTES,
      onEvict: (frame) => {
        URL.revokeObjectURL(frame.objectUrl);
      },
    });
  }

  /** Ensures all fixed fetch windows covering the requested range are buffered. */
  async ensureRange(
    range: RawMessageWindowCacheOptions["sceneRange"]
  ): Promise<void> {
    await this.rawWindowCache.ensureRange(range);
  }

  /** Seeds the raw cache with already-fetched boot-time messages. */
  primeMessages(
    messages: MultimodalRawMessage[],
    window?: RawMessageWindowCacheOptions["sceneRange"]
  ) {
    this.rawWindowCache.primeMessages(messages, window);
  }

  /** Seeds the raw cache and prefetched image decodes for one buffered stream window. */
  primeStream(
    stream: MultimodalRawBufferResponseStream,
    window?: RawMessageWindowCacheOptions["sceneRange"]
  ) {
    this.primePrefetchedImages(stream);
    this.rawWindowCache.primeMessages(stream.messages, window);
  }

  /** Returns the raw cached message matching the requested log time. */
  getMessageForLogTime(logTimeNs: number): MultimodalRawMessage | null {
    return this.rawWindowCache.getMessageForLogTime(logTimeNs);
  }

  /** Returns cached sync samples derived from the current raw message set. */
  getSyncSamples() {
    return this.rawWindowCache.getSyncSamples();
  }

  /** Returns cached sync timestamps derived from the current raw message set. */
  getSyncTimestamps() {
    return this.rawWindowCache.getSyncTimestamps();
  }

  /** Returns the raw-window version so playback bookkeeping can memoize cheaply. */
  getVersion() {
    return this.rawWindowCache.getVersion();
  }

  /** Reports whether the raw message window containing this timestamp is ready. */
  getMessageReadiness(logTimeNs: number): BufferReadiness {
    return this.rawWindowCache.getTimeReadiness(logTimeNs);
  }

  /** Decodes one raw Multimodal image message and returns a cached object URL frame. */
  async decodeMessage(
    message: MultimodalRawMessage
  ): Promise<MultimodalDecodedImageFrame> {
    const cachedFrame = this.decodedFrames.get(message.messageId);
    if (cachedFrame) {
      return cachedFrame;
    }

    const existingFrame = this.pendingFrames.get(message.messageId);
    if (existingFrame) {
      return existingFrame;
    }

    const prefetched = this.prefetchedImages.get(message.messageId);
    const decodePromise = (
      prefetched
        ? Promise.resolve(prefetched)
        : BUILTIN_SCHEMA_CODEC_REGISTRY.decodeImageMessage(
            this.schemaName,
            message
          )
    )
      .then(async (decoded) => {
        const mimeType = getCompressedImageMimeType(decoded.format);
        const blob = new Blob([decoded.compressedBytes], { type: mimeType });
        const objectUrl = URL.createObjectURL(blob);
        try {
          const imageSource = await preloadRenderableImage(objectUrl);
          const frame = {
            id: message.messageId,
            messageId: message.messageId,
            format: decoded.format,
            frameId: decoded.frameId,
            src: objectUrl,
            imageSource,
            timestampNs: message.logTimeNs,
            logTimeNs: message.logTimeNs,
            publishTimeNs: message.publishTimeNs,
            objectUrl,
          };

          this.decodedFrames.set(
            message.messageId,
            frame,
            Math.max(
              decoded.compressedBytes.byteLength,
              getDecodedImageFrameBytes(imageSource)
            )
          );

          return frame;
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          throw error;
        }
      })
      .finally(() => {
        this.pendingFrames.delete(message.messageId);
      });

    this.pendingFrames.set(message.messageId, decodePromise);
    return decodePromise;
  }

  /** Warms cached image decodes around one playback timestamp. */
  async warmMessagesAroundLogTime(
    logTimeNs: number,
    options: WarmDecodeOptions = {}
  ): Promise<void> {
    const messages = this.rawWindowCache.getMessagesAroundLogTime(logTimeNs, {
      aheadCount: options.aheadCount ?? 2,
      behindCount: options.behindCount ?? 0,
    });

    await Promise.allSettled(
      messages.map((message) => this.decodeMessage(message))
    );
  }

  /** Disposes decoded image URLs and the shared worker client resources. */
  dispose() {
    this.pendingFrames.clear();
    this.prefetchedImages.clear();
    this.decodedFrames.clear();
    this.rawWindowCache.dispose();
    BUILTIN_SCHEMA_CODEC_REGISTRY.disposeImageResources(this.schemaName);
  }

  private primePrefetchedImages(stream: MultimodalRawBufferResponseStream) {
    stream.prefetchedImageMessages?.forEach((message) => {
      this.prefetchedImages.set(message.messageId, {
        format: message.format,
        frameId: message.frameId,
        compressedBytes: message.compressedBytes,
      });
    });
  }
}
