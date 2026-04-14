import { fetchMcapBuffer } from "./api";
import { getMcapWindowsForRange } from "./playback-utils";
import type { McapRawMessage, McapTimeRange } from "./types";

/** Construction options for one per-stream raw-message window cache. */
export type RawMessageWindowCacheOptions = {
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

function getWindowKey(window: McapTimeRange) {
  return `${window.startNs}:${window.endNs}`;
}

/** Shared raw-message window cache for one MCAP stream. */
export class McapRawMessageWindowCache {
  private readonly datasetId: string;
  private readonly sampleId: string;
  private readonly sceneId: string;
  private readonly streamId: string;
  private readonly mediaField: string;
  private readonly sceneRange: McapTimeRange;
  private readonly windows = new Map<string, MessageWindow>();
  private readonly windowPromises = new Map<string, Promise<void>>();

  constructor(options: RawMessageWindowCacheOptions) {
    this.datasetId = options.datasetId;
    this.sampleId = options.sampleId;
    this.sceneId = options.sceneId;
    this.streamId = options.streamId;
    this.mediaField = options.mediaField;
    this.sceneRange = options.sceneRange;
  }

  async ensureRange(range: McapTimeRange): Promise<void> {
    const windows = getMcapWindowsForRange(this.sceneRange, range);
    await Promise.all(windows.map((window) => this.ensureWindow(window)));
  }

  getMessageForLogTime(logTimeNs: number): McapRawMessage | null {
    const messages = Array.from(this.windows.values())
      .flatMap((window) => window.messages)
      .sort((left, right) => left.logTimeNs - right.logTimeNs);
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

  dispose() {
    this.windowPromises.clear();
    this.windows.clear();
  }

  private async ensureWindow(window: McapTimeRange): Promise<void> {
    const key = getWindowKey(window);
    if (this.windows.has(key)) {
      return;
    }

    const pending = this.windowPromises.get(key);
    if (pending) {
      return pending;
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
}
