import type { McapDecodedMessage } from "../contracts";
import { decodedOutputSizeBytes } from "../../../query/cache-utils";
import type { McapRetainedDecodedMessageReference } from "./playback-worker-types";

const DEFAULT_DECODED_RECORD_STORE_MAX_BYTES = 128 * 1024 * 1024;
const DEFAULT_DECODED_RECORD_STORE_MAX_ENTRIES = 512;

export type DecodedRecordStoreEvent = {
  readonly kind: "evict-capacity" | "evict-clear" | "hit" | "insert" | "skip";
  readonly recordId: string;
  readonly sizeBytes: number;
  readonly topic: string;
};

export interface DecodedRecordLease {
  readonly recordIds: readonly string[];
  get(reference: McapRetainedDecodedMessageReference): McapDecodedMessage;
  release(): void;
}

type DecodedRecordEntry = {
  readonly messageRef: WeakRef<McapDecodedMessage>;
  readonly sizeBytes: number;
  pinnedMessage?: McapDecodedMessage;
  pins: number;
};

/**
 * Weak main-thread identity index for decoded worker records.
 *
 * EpisodeStreamCache owns canonical residency and its byte budget. This index
 * keeps only weak references between requests; a retention handshake pins the
 * exact identities advertised to one in-flight worker request, and releases
 * those strong references as soon as that request settles.
 */
export class DecodedRecordStore {
  private readonly entries = new Map<string, DecodedRecordEntry>();
  private pinnedBytes = 0;

  constructor(
    private readonly options: {
      readonly maxBytes?: number;
      readonly maxEntries?: number;
      readonly onEvent?: (event: DecodedRecordStoreEvent) => void;
    } = {},
  ) {
    if (this.maxBytes < 0 || this.maxEntries < 0) {
      throw new Error("Decoded record store bounds must be non-negative");
    }
  }

  get size(): number {
    return this.entries.size;
  }

  acquire(topics: readonly string[]): DecodedRecordLease {
    const topicSet = new Set(topics);
    const leased = new Map<string, DecodedRecordEntry>();
    for (const [recordId, entry] of this.entries) {
      const message = entry.pinnedMessage ?? entry.messageRef.deref();
      if (!message) {
        if (entry.pins === 0) this.entries.delete(recordId);
        continue;
      }
      if (!topicSet.has(message.topic)) continue;
      if (
        entry.pins === 0 &&
        (leased.size >= this.maxEntries ||
          this.pinnedBytes + entry.sizeBytes > this.maxBytes)
      ) {
        this.options.onEvent?.({
          kind: "skip",
          recordId,
          sizeBytes: entry.sizeBytes,
          topic: message.topic,
        });
        continue;
      }
      if (entry.pins === 0) {
        entry.pinnedMessage = message;
        this.pinnedBytes += entry.sizeBytes;
      }
      entry.pins += 1;
      leased.set(recordId, entry);
    }

    const reportedHits = new Set<string>();
    let released = false;
    return {
      recordIds: [...leased.keys()],
      get: (reference) => {
        const entry = leased.get(reference.recordId);
        if (
          !entry ||
          entry.pinnedMessage?.topic !== reference.topic ||
          entry.pinnedMessage.timelineTimeNs !== reference.timelineTimeNs
        ) {
          throw new Error(
            `Worker referenced an unavailable retained MCAP record: ${reference.recordId}`,
          );
        }
        if (!reportedHits.has(reference.recordId)) {
          reportedHits.add(reference.recordId);
          this.options.onEvent?.({
            kind: "hit",
            recordId: reference.recordId,
            sizeBytes: entry.sizeBytes,
            topic: entry.pinnedMessage.topic,
          });
          this.touch(reference.recordId, entry);
        }
        return entry.pinnedMessage;
      },
      release: () => {
        if (released) return;
        released = true;
        for (const [recordId, leasedEntry] of leased) {
          leasedEntry.pins -= 1;
          if (leasedEntry.pins === 0) {
            leasedEntry.pinnedMessage = undefined;
            if (this.entries.get(recordId) === leasedEntry) {
              this.pinnedBytes -= leasedEntry.sizeBytes;
            }
          }
        }
        leased.clear();
      },
    };
  }

  canonicalize(message: McapDecodedMessage): McapDecodedMessage {
    const recordId = message.recordId;
    if (!recordId) return message;

    const existing = this.entries.get(recordId);
    if (existing) {
      const existingMessage =
        existing.pinnedMessage ?? existing.messageRef.deref();
      if (existingMessage) {
        this.touch(recordId, existing);
        return existingMessage;
      }
      this.entries.delete(recordId);
    }

    const sizeBytes = decodedOutputSizeBytes(message.decoded.output);
    if (sizeBytes === 0) {
      this.options.onEvent?.({
        kind: "skip",
        recordId,
        sizeBytes: 0,
        topic: message.topic,
      });
      return message;
    }
    if (this.maxEntries === 0 || !this.makeIndexRoom()) {
      this.options.onEvent?.({
        kind: "skip",
        recordId,
        sizeBytes,
        topic: message.topic,
      });
      return message;
    }

    this.entries.set(recordId, {
      messageRef: new WeakRef(message),
      pins: 0,
      sizeBytes,
    });
    this.options.onEvent?.({
      kind: "insert",
      recordId,
      sizeBytes,
      topic: message.topic,
    });
    return message;
  }

  clear(): void {
    for (const [recordId, entry] of this.entries) {
      const message = entry.pinnedMessage ?? entry.messageRef.deref();
      if (!message) continue;
      this.options.onEvent?.({
        kind: "evict-clear",
        recordId,
        sizeBytes: entry.sizeBytes,
        topic: message.topic,
      });
    }
    this.entries.clear();
    this.pinnedBytes = 0;
  }

  private get maxBytes(): number {
    return this.options.maxBytes ?? DEFAULT_DECODED_RECORD_STORE_MAX_BYTES;
  }

  private get maxEntries(): number {
    return this.options.maxEntries ?? DEFAULT_DECODED_RECORD_STORE_MAX_ENTRIES;
  }

  private makeIndexRoom(): boolean {
    while (this.entries.size >= this.maxEntries) {
      const evictable = [...this.entries].find(([, entry]) => entry.pins === 0);
      if (!evictable) return false;
      const [recordId, entry] = evictable;
      this.entries.delete(recordId);
      const message = entry.messageRef.deref();
      if (!message) continue;
      this.options.onEvent?.({
        kind: "evict-capacity",
        recordId,
        sizeBytes: entry.sizeBytes,
        topic: message.topic,
      });
    }
    return true;
  }

  private touch(recordId: string, entry: DecodedRecordEntry): void {
    if (this.entries.get(recordId) !== entry) return;
    this.entries.delete(recordId);
    this.entries.set(recordId, entry);
  }
}

export function isRetainedDecodedMessageReference(
  message: unknown,
): message is McapRetainedDecodedMessageReference {
  return (
    typeof message === "object" &&
    message !== null &&
    "kind" in message &&
    message.kind === "retained-decoded-message"
  );
}
