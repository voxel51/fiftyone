import { fetchMcapBuffer } from "./api";
import {
  decodeCompressedImageInWorker,
  disposeCompressedImageWorkerClient,
} from "./compressed-image-worker-client";
import { getCompressedImageMimeType } from "./compressed-image-decoder";
import { getMcapWindowsForRange } from "./playback-utils";
import type { McapRawMessage, McapTimeRange } from "./types";

type CacheOptions = {
  datasetId: string;
  sampleId: string;
  sceneId: string;
  streamId: string;
  mediaField: string;
  sceneRange: McapTimeRange;
};

type MessageWindow = {
  window: McapTimeRange;
  messages: McapRawMessage[];
};

/** Decoded image frame metadata cached for one raw MCAP message. */
export type McapDecodedImageFrame = {
  messageId: string;
  format: string;
  logTimeNs: number;
  publishTimeNs: number;
  objectUrl: string;
};

function getWindowKey(window: McapTimeRange) {
  return `${window.startNs}:${window.endNs}`;
}

/** Small per-stream cache for buffered raw MCAP windows and decoded images. */
export class McapImageBufferCache {
  private readonly datasetId: string;
  private readonly sampleId: string;
  private readonly sceneId: string;
  private readonly streamId: string;
  private readonly mediaField: string;
  private readonly sceneRange: McapTimeRange;
  private readonly windows = new Map<string, MessageWindow>();
  private readonly windowPromises = new Map<string, Promise<void>>();
  private readonly decodedFrames = new Map<
    string,
    Promise<McapDecodedImageFrame>
  >();
  private readonly objectUrls = new Map<string, string>();

  constructor(options: CacheOptions) {
    this.datasetId = options.datasetId;
    this.sampleId = options.sampleId;
    this.sceneId = options.sceneId;
    this.streamId = options.streamId;
    this.mediaField = options.mediaField;
    this.sceneRange = options.sceneRange;
  }

  /** Ensures all fixed fetch windows covering the requested range are buffered. */
  async ensureRange(range: McapTimeRange): Promise<void> {
    const windows = getMcapWindowsForRange(this.sceneRange, range);
    await Promise.all(windows.map((window) => this.ensureWindow(window)));
  }

  /** Returns the raw cached message matching the requested log time. */
  getMessageForLogTime(logTimeNs: number): McapRawMessage | null {
    const messages = this.getSortedCachedMessages();
    let match: McapRawMessage | null = null;

    for (const message of messages) {
      if (message.logTimeNs > logTimeNs) {
        break;
      }

      if (message.logTimeNs === logTimeNs) {
        match = message;
      }
    }

    return match;
  }

  /** Decodes one raw MCAP image message and returns a cached object URL frame. */
  async decodeMessage(message: McapRawMessage): Promise<McapDecodedImageFrame> {
    const existingFrame = this.decodedFrames.get(message.messageId);
    if (existingFrame) {
      return existingFrame;
    }

    const decodePromise = decodeCompressedImageInWorker({
      messageId: message.messageId,
      payload: this.copyPayloadBuffer(message.payload),
    }).then((decoded) => {
      const mimeType = getCompressedImageMimeType(decoded.format);
      const blob = new Blob([decoded.compressedBytes], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      this.objectUrls.set(message.messageId, objectUrl);

      return {
        messageId: message.messageId,
        format: decoded.format,
        logTimeNs: message.logTimeNs,
        publishTimeNs: message.publishTimeNs,
        objectUrl,
      };
    });

    this.decodedFrames.set(message.messageId, decodePromise);
    return decodePromise;
  }

  /** Disposes decoded image URLs and the shared worker client resources. */
  dispose() {
    this.decodedFrames.clear();
    this.windowPromises.clear();
    this.windows.clear();
    this.objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    this.objectUrls.clear();
    disposeCompressedImageWorkerClient();
  }

  private async ensureWindow(window: McapTimeRange): Promise<void> {
    const key = getWindowKey(window);
    const existingWindow = this.windows.get(key);
    if (existingWindow) {
      return;
    }

    const existingPromise = this.windowPromises.get(key);
    if (existingPromise) {
      return existingPromise;
    }

    const loadPromise = fetchMcapBuffer({
      datasetId: this.datasetId,
      sampleId: this.sampleId,
      request: {
        mediaField: this.mediaField,
        streamIds: [this.streamId],
        window,
        mode: "raw",
      },
    })
      .then((response) => {
        const messages = response.streams[0]?.messages ?? [];
        this.windows.set(key, { window, messages });
      })
      .finally(() => {
        this.windowPromises.delete(key);
      });

    this.windowPromises.set(key, loadPromise);
    return loadPromise;
  }

  private getSortedCachedMessages() {
    return Array.from(this.windows.values())
      .flatMap((window) => window.messages)
      .sort((left, right) => left.logTimeNs - right.logTimeNs);
  }

  private copyPayloadBuffer(payload: Uint8Array) {
    const view = Uint8Array.from(payload);
    return view.buffer;
  }
}
