import type { BufferReadiness } from "@fiftyone/playback/experimental/types";
import { fetchMultimodalBuffer } from "./api";
import { getMultimodalWindowsForRange } from "./playback-utils";
import type {
  MultimodalRawMessage,
  MultimodalTimeRange,
  MultimodalTimelineSample,
} from "./types";

/** Construction options for one per-stream raw-message window cache. */
export type RawMessageWindowCacheOptions = {
  datasetId: string;
  sampleId: string;
  sceneId: string;
  streamId: string;
  mediaField: string;
  sourceKind?: string;
  sceneRange: MultimodalTimeRange;
};

type MessageWindow = {
  window: MultimodalTimeRange;
  messages: MultimodalRawMessage[];
};

type MessageNeighborhoodOptions = {
  behindCount?: number;
  aheadCount?: number;
};

function getWindowKey(window: MultimodalTimeRange) {
  return `${window.startNs}:${window.endNs}`;
}

/** Shared raw-message window cache for one Multimodal stream. */
export class MultimodalRawMessageWindowCache {
  private readonly datasetId: string;
  private readonly sampleId: string;
  private readonly sceneId: string;
  private readonly streamId: string;
  private readonly mediaField: string;
  private readonly sourceKind: string | undefined;
  private readonly sceneRange: MultimodalTimeRange;
  private readonly windows = new Map<string, MessageWindow>();
  private readonly windowPromises = new Map<string, Promise<void>>();
  private sortedMessagesCache: MultimodalRawMessage[] | null = null;
  private messageByLogTimeCache: Map<number, MultimodalRawMessage> | null =
    null;
  private syncSamplesCache: MultimodalTimelineSample[] | null = null;
  private syncTimestampsCache: number[] | null = null;
  private version = 0;

  constructor(options: RawMessageWindowCacheOptions) {
    this.datasetId = options.datasetId;
    this.sampleId = options.sampleId;
    this.sceneId = options.sceneId;
    this.streamId = options.streamId;
    this.mediaField = options.mediaField;
    this.sourceKind = options.sourceKind;
    this.sceneRange = options.sceneRange;
  }

  async ensureRange(range: MultimodalTimeRange): Promise<void> {
    const windows = getMultimodalWindowsForRange(this.sceneRange, range);
    await Promise.all(windows.map((window) => this.ensureWindow(window)));
  }

  primeMessages(
    messages: MultimodalRawMessage[],
    window?: MultimodalTimeRange
  ): void {
    if (!messages.length) {
      if (window) {
        this.windows.set(getWindowKey(window), { window, messages: [] });
      }
      return;
    }

    const resolvedWindow = window ?? this.getWindowForMessages(messages);
    if (!resolvedWindow) {
      return;
    }

    const key = getWindowKey(resolvedWindow);
    const existing = this.windows.get(key);
    const deduped = new Map<string, MultimodalRawMessage>();

    (existing?.messages ?? []).forEach((message) => {
      deduped.set(message.messageId, message);
    });
    messages.forEach((message) => {
      deduped.set(message.messageId, message);
    });

    this.windows.set(key, {
      window: resolvedWindow,
      messages: Array.from(deduped.values()),
    });
    this.invalidateCaches();
  }

  getMessageForLogTime(logTimeNs: number): MultimodalRawMessage | null {
    const messageByLogTime = this.getMessageByLogTime();
    return messageByLogTime.get(logTimeNs) ?? null;
  }

  getTimeReadiness(timeNs: number): BufferReadiness {
    const [window] = getMultimodalWindowsForRange(this.sceneRange, {
      startNs: timeNs,
      endNs: timeNs,
    });

    if (!window) {
      return "missing";
    }

    const key = getWindowKey(window);
    if (this.windows.has(key)) {
      return "ready";
    }

    if (this.windowPromises.has(key)) {
      return "loading";
    }

    return "missing";
  }

  getMessages(): MultimodalRawMessage[] {
    if (this.sortedMessagesCache) {
      return this.sortedMessagesCache;
    }

    const deduped = new Map<string, MultimodalRawMessage>();
    Array.from(this.windows.values())
      .flatMap((window) => window.messages)
      .forEach((message) => {
        deduped.set(message.messageId, message);
      });

    this.sortedMessagesCache = Array.from(deduped.values()).sort(
      (left, right) => left.logTimeNs - right.logTimeNs
    );

    return this.sortedMessagesCache;
  }

  getSyncSamples(): MultimodalTimelineSample[] {
    if (this.syncSamplesCache) {
      return this.syncSamplesCache;
    }

    this.syncSamplesCache = this.getMessages()
      .map((message) => ({
        timestampNs: message.syncTimestampNs,
        logTimeNs: message.logTimeNs,
        publishTimeNs: message.publishTimeNs,
      }))
      .sort(
        (left, right) =>
          left.timestampNs - right.timestampNs ||
          left.logTimeNs - right.logTimeNs
      );

    return this.syncSamplesCache;
  }

  getSyncTimestamps(): number[] {
    if (this.syncTimestampsCache) {
      return this.syncTimestampsCache;
    }

    this.syncTimestampsCache = this.getSyncSamples().map(
      (sample) => sample.timestampNs
    );

    return this.syncTimestampsCache;
  }

  getVersion() {
    return this.version;
  }

  getMessagesAroundLogTime(
    logTimeNs: number,
    options: MessageNeighborhoodOptions = {}
  ): MultimodalRawMessage[] {
    const messages = this.getMessages();
    if (!messages.length) {
      return [];
    }

    const { aheadCount = 0, behindCount = 0 } = options;
    const centerIndex = this.getMessageIndexForLogTime(messages, logTimeNs);
    if (centerIndex < 0) {
      return [];
    }

    const startIndex = Math.max(0, centerIndex - behindCount);
    const endIndex = Math.min(messages.length, centerIndex + aheadCount + 1);
    return messages.slice(startIndex, endIndex);
  }

  dispose() {
    this.windowPromises.clear();
    this.windows.clear();
    this.version = 0;
    this.sortedMessagesCache = null;
    this.messageByLogTimeCache = null;
    this.syncSamplesCache = null;
    this.syncTimestampsCache = null;
  }

  private async ensureWindow(window: MultimodalTimeRange): Promise<void> {
    const key = getWindowKey(window);
    if (this.windows.has(key)) {
      return;
    }

    const pending = this.windowPromises.get(key);
    if (pending) {
      return pending;
    }

    const loadPromise = fetchMultimodalBuffer({
      datasetId: this.datasetId,
      sampleId: this.sampleId,
      request: {
        mediaField: this.mediaField,
        sourceKind: this.sourceKind,
        streamIds: [this.streamId],
        startTimeNs: window.startNs,
        endTimeNs: window.endNs,
        mode: "raw",
      },
    })
      .then((response) => {
        const messages = response.streams[0]?.messages ?? [];
        this.windows.set(key, { window, messages });
        this.invalidateCaches();
      })
      .finally(() => {
        this.windowPromises.delete(key);
      });

    this.windowPromises.set(key, loadPromise);
    return loadPromise;
  }

  private getMessageByLogTime() {
    if (this.messageByLogTimeCache) {
      return this.messageByLogTimeCache;
    }

    const messageByLogTime = new Map<number, MultimodalRawMessage>();
    this.getMessages().forEach((message) => {
      messageByLogTime.set(message.logTimeNs, message);
    });

    this.messageByLogTimeCache = messageByLogTime;
    return messageByLogTime;
  }

  private getWindowForMessages(messages: MultimodalRawMessage[]) {
    if (!messages.length) {
      return null;
    }

    let startNs = Number.POSITIVE_INFINITY;
    let endNs = Number.NEGATIVE_INFINITY;
    messages.forEach((message) => {
      startNs = Math.min(startNs, message.syncTimestampNs);
      endNs = Math.max(endNs, message.syncTimestampNs);
    });

    if (!Number.isFinite(startNs) || !Number.isFinite(endNs)) {
      return null;
    }

    return {
      startNs,
      endNs,
    };
  }

  private getMessageIndexForLogTime(
    messages: MultimodalRawMessage[],
    logTimeNs: number
  ) {
    let left = 0;
    let right = messages.length - 1;
    let lowerBound = messages.length;

    while (left <= right) {
      const middle = Math.floor((left + right) / 2);
      if (messages[middle].logTimeNs >= logTimeNs) {
        lowerBound = middle;
        right = middle - 1;
      } else {
        left = middle + 1;
      }
    }

    if (lowerBound < messages.length) {
      return messages[lowerBound].logTimeNs === logTimeNs
        ? lowerBound
        : Math.max(0, lowerBound - 1);
    }

    return messages.length - 1;
  }

  private invalidateCaches() {
    this.version += 1;
    this.sortedMessagesCache = null;
    this.messageByLogTimeCache = null;
    this.syncSamplesCache = null;
    this.syncTimestampsCache = null;
  }
}
