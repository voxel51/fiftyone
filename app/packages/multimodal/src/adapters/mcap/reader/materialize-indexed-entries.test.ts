import { describe, expect, it, vi } from "vitest";

import type {
  McapIndexedMessageTime,
  McapIndexedReaderLike,
  McapMessage,
} from "./types";
import { materializeIndexedEntries } from "./materialize-indexed-entries";

describe("materializeIndexedEntries", () => {
  it("deduplicates chunk prefetch and preserves positional identity", async () => {
    const entries = [entry(1, 10n, 100n), entry(2, 20n, 100n)];
    const prefetchChunkData = vi.fn();
    const readIndexedMessages = vi.fn(() =>
      Promise.resolve([message(1, 10n), message(2, 20n)]),
    );
    const reader = createReader({ prefetchChunkData, readIndexedMessages });

    await expect(materializeIndexedEntries(reader, entries)).resolves.toEqual([
      message(1, 10n),
      message(2, 20n),
    ]);
    expect(prefetchChunkData).toHaveBeenCalledWith({
      chunkStartOffsets: [100n],
    });
  });

  it("rejects missing and positionally mismatched results", async () => {
    const entries = [entry(1, 10n, 100n)];
    const reader = (messages: readonly McapMessage[]) =>
      createReader({
        readIndexedMessages: vi.fn(() => Promise.resolve(messages)),
      });

    await expect(
      materializeIndexedEntries(reader([]), entries),
    ).rejects.toThrow("returned 0 messages for 1 entries");
    await expect(
      materializeIndexedEntries(reader([message(1, 11n)]), entries),
    ).rejects.toThrow("positional mismatch");
  });
});

function entry(
  channelId: number,
  logTimeNs: bigint,
  chunkStartOffset: bigint,
): McapIndexedMessageTime {
  return {
    channelId,
    chunkStartOffset,
    logTimeNs,
    messageOffset: 0n,
    topic: `/topic/${channelId}`,
  };
}

function message(channelId: number, logTime: bigint): McapMessage {
  return {
    channelId,
    data: new Uint8Array(),
    logTime,
    publishTime: logTime,
    sequence: 0,
    type: "Message",
  };
}

function createReader(
  options: Pick<
    McapIndexedReaderLike,
    "prefetchChunkData" | "readIndexedMessages"
  >,
): McapIndexedReaderLike {
  return {
    channelsById: new Map(),
    chunkIndexes: [],
    readMessages: () => asyncValues([]),
    schemasById: new Map(),
    ...options,
  };
}

async function* asyncValues<Value>(values: readonly Value[]) {
  for await (const value of values) yield value;
}
