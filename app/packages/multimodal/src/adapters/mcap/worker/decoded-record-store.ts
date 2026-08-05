import type { McapDecodedMessage } from "../contracts";
import type { McapRetainedDecodedMessageReference } from "./playback-worker-types";

export const DEFAULT_DECODED_RECORD_STORE_MAX_BYTES = 128 * 1024 * 1024;
export const DEFAULT_DECODED_RECORD_STORE_MAX_ENTRIES = 512;

const DECODED_RECORD_METADATA_BYTES = 2 * 1024;

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
  readonly message: McapDecodedMessage;
  readonly sizeBytes: number;
  pins: number;
};

/**
 * Main-thread ownership store for decoded worker records.
 *
 * Worker buffers are transferred, so keeping reusable records here avoids
 * both repeat decode and repeat transfer. Leases pin the exact identities
 * advertised to an in-flight worker request; eviction never invalidates a
 * reference before that request settles.
 */
export class DecodedRecordStore {
  private readonly entries = new Map<string, DecodedRecordEntry>();
  private retainedBytes = 0;

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

  get bytes(): number {
    return this.retainedBytes;
  }

  get size(): number {
    return this.entries.size;
  }

  acquire(topics: readonly string[]): DecodedRecordLease {
    const topicSet = new Set(topics);
    const leased = new Map<string, DecodedRecordEntry>();
    for (const [recordId, entry] of this.entries) {
      if (!topicSet.has(entry.message.topic)) continue;
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
          entry.message.topic !== reference.topic ||
          entry.message.timelineTimeNs !== reference.timelineTimeNs
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
            topic: entry.message.topic,
          });
          this.touch(reference.recordId, entry);
        }
        return entry.message;
      },
      release: () => {
        if (released) return;
        released = true;
        for (const [recordId, leasedEntry] of leased) {
          const entry = this.entries.get(recordId);
          if (entry === leasedEntry) entry.pins -= 1;
        }
      },
    };
  }

  canonicalize(message: McapDecodedMessage): McapDecodedMessage {
    const recordId = message.recordId;
    if (!recordId) return message;

    const existing = this.entries.get(recordId);
    if (existing) {
      this.touch(recordId, existing);
      return existing.message;
    }

    const sizeBytes = estimateDecodedRecordBytes(message);
    if (sizeBytes === null) {
      this.options.onEvent?.({
        kind: "skip",
        recordId,
        sizeBytes: 0,
        topic: message.topic,
      });
      return message;
    }
    if (
      sizeBytes > this.maxBytes ||
      this.maxEntries === 0 ||
      !this.makeRoom(sizeBytes)
    ) {
      this.options.onEvent?.({
        kind: "skip",
        recordId,
        sizeBytes,
        topic: message.topic,
      });
      return message;
    }

    this.entries.set(recordId, { message, pins: 0, sizeBytes });
    this.retainedBytes += sizeBytes;
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
      this.options.onEvent?.({
        kind: "evict-clear",
        recordId,
        sizeBytes: entry.sizeBytes,
        topic: entry.message.topic,
      });
    }
    this.entries.clear();
    this.retainedBytes = 0;
  }

  private get maxBytes(): number {
    return this.options.maxBytes ?? DEFAULT_DECODED_RECORD_STORE_MAX_BYTES;
  }

  private get maxEntries(): number {
    return this.options.maxEntries ?? DEFAULT_DECODED_RECORD_STORE_MAX_ENTRIES;
  }

  private makeRoom(incomingBytes: number): boolean {
    while (
      this.entries.size >= this.maxEntries ||
      this.retainedBytes + incomingBytes > this.maxBytes
    ) {
      const evictable = [...this.entries].find(([, entry]) => entry.pins === 0);
      if (!evictable) return false;
      const [recordId, entry] = evictable;
      this.entries.delete(recordId);
      this.retainedBytes -= entry.sizeBytes;
      this.options.onEvent?.({
        kind: "evict-capacity",
        recordId,
        sizeBytes: entry.sizeBytes,
        topic: entry.message.topic,
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

export function estimateDecodedRecordBytes(
  message: McapDecodedMessage,
): number | null {
  const buffers = new Set<ArrayBuffer>();
  for (const transferable of message.decoded.output.resourceHints
    ?.transferables ?? []) {
    if (transferable instanceof ArrayBuffer) buffers.add(transferable);
  }
  const transferableBytes = [...buffers].reduce(
    (total, buffer) => total + buffer.byteLength,
    0,
  );
  const declaredBytes = message.decoded.output.resourceHints?.sizeBytes ?? 0;
  if (transferableBytes === 0 && declaredBytes === 0) return null;
  return (
    Math.max(transferableBytes, declaredBytes) + DECODED_RECORD_METADATA_BYTES
  );
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
