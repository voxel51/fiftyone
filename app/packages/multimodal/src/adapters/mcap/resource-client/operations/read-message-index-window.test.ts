import { describe, expect, it, vi } from "vitest";
import { rawNodeToJson } from "../../../../ir";
import { throwIfAborted } from "../../../../utils/cancellation";
import type { McapReadMessageIndexWindowRequest } from "../../contracts";
import type {
  McapChannel,
  McapChunkIndex,
  McapIndexedMessageTime,
  McapIndexedReaderLike,
  McapMessage,
  McapReadIndexedMessageTimesRequest,
  McapReadLatestIndexedMessageTimesRequest,
} from "../../reader";
import { compareIndexedMessageTimes } from "../../reader/message-index";
import {
  mcapIndexedEntryFromCursor,
  mcapMessageCursorForEntry,
} from "./message-cursor";
import { readMcapMessageIndexWindow } from "./read-message-index-window";
import { readMcapRawMessageAtCursor } from "./read-raw-message-record";

const source = { sourceId: "epoch-a", url: "memory://browse.mcap" };

describe("exact MCAP message browsing", () => {
  it("orders duplicate timestamps by exact indexed position across channels", async () => {
    const entries = [
      entry({ channelId: 2, chunkStartOffset: 300n, messageOffset: 4n }),
      entry({ channelId: 1, chunkStartOffset: 100n, messageOffset: 20n }),
      entry({ channelId: 1, chunkStartOffset: 100n, messageOffset: 10n }),
      entry({ channelId: 1, logTimeNs: 9n, messageOffset: 1n }),
      entry({ channelId: 2, chunkStartOffset: 300n, logTimeNs: 11n }),
    ];
    const reader = createReader(entries, { unorderedChunks: true });
    const anchor = entries[1];

    const result = await readMcapMessageIndexWindow({
      reader,
      request: {
        after: 2,
        anchorCursor: mcapMessageCursorForEntry(source, anchor),
        before: 2,
        source,
        topic: "/state",
      },
    });

    expect(
      result.entries.map((row) =>
        cursorEntry(row.cursor).messageOffset.toString(),
      ),
    ).toEqual(["1", "10", "20", "4", "0"]);
    expect(result.hasPrevious).toBe(false);
    expect(result.hasNext).toBe(false);
  });

  it("keeps a channel-preserving stream inside its selected channel", async () => {
    const entries = [
      entry({ channelId: 1, logTimeNs: 1n, messageOffset: 1n }),
      entry({ channelId: 2, logTimeNs: 2n, messageOffset: 2n }),
      entry({ channelId: 1, logTimeNs: 3n, messageOffset: 3n }),
      entry({ channelId: 2, logTimeNs: 4n, messageOffset: 4n }),
    ];
    const reader = createReader(entries);
    const anchor = entries[1];
    if (!anchor) throw new Error("expected channel anchor");

    const result = await readMcapMessageIndexWindow({
      reader,
      request: {
        after: 2,
        anchorCursor: mcapMessageCursorForEntry(source, anchor),
        before: 2,
        channelId: 2,
        source,
        topic: "/state",
      },
    });

    expect(
      result.entries.map((row) => cursorEntry(row.cursor).channelId),
    ).toEqual([2, 2]);
  });

  it("anchors at or before time and reports first/last boundaries", async () => {
    const entries = [
      entry({ logTimeNs: 1n, messageOffset: 1n }),
      entry({ logTimeNs: 2n, messageOffset: 2n }),
      entry({ logTimeNs: 3n, messageOffset: 3n }),
    ];
    const reader = createReader(entries);

    const first = await readMcapMessageIndexWindow({
      reader,
      request: {
        after: 1,
        anchorTimeNs: 1n,
        before: 1,
        source,
        topic: "/state",
      },
    });
    expect(first.hasPrevious).toBe(false);
    expect(first.hasNext).toBe(true);

    const last = await readMcapMessageIndexWindow({
      reader,
      request: {
        after: 1,
        anchorTimeNs: 99n,
        before: 1,
        source,
        topic: "/state",
      },
    });
    expect(cursorEntry(last.selectedCursor).logTimeNs).toBe(3n);
    expect(last.hasPrevious).toBe(true);
    expect(last.hasNext).toBe(false);
  });

  it("honors a zero-sized side while still reporting its boundary", async () => {
    const entries = [
      entry({ logTimeNs: 1n, messageOffset: 1n }),
      entry({ logTimeNs: 2n, messageOffset: 2n }),
      entry({ logTimeNs: 3n, messageOffset: 3n }),
    ];

    const result = await readMcapMessageIndexWindow({
      reader: createReader(entries),
      request: {
        after: 0,
        anchorCursor: mcapMessageCursorForEntry(source, entries[1]),
        before: 0,
        source,
        topic: "/state",
      },
    });

    expect(result.entries).toEqual([
      {
        cursor: mcapMessageCursorForEntry(source, entries[1]),
        logTimeNs: 2n,
      },
    ]);
    expect(result.hasPrevious).toBe(true);
    expect(result.hasNext).toBe(true);
  });

  it("rejects invalid, stale, and source-mismatched cursors", async () => {
    const current = entry({ logTimeNs: 1n, messageOffset: 1n });
    const reader = createReader([current]);
    const request = {
      after: 1,
      before: 1,
      source,
      topic: "/state",
    } as const;

    await expect(
      readMcapMessageIndexWindow({
        reader,
        request: { ...request, anchorCursor: "not-a-cursor" },
      }),
    ).rejects.toThrow("Invalid MCAP message cursor");
    await expect(
      readMcapMessageIndexWindow({
        reader,
        request: {
          ...request,
          anchorCursor: mcapMessageCursorForEntry(source, {
            ...current,
            messageOffset: 99n,
          }),
        },
      }),
    ).rejects.toThrow("stale or invalid");
    await expect(
      readMcapMessageIndexWindow({
        reader,
        request: {
          ...request,
          anchorCursor: mcapMessageCursorForEntry(
            { ...source, sourceId: "old-epoch" },
            current,
          ),
        },
      }),
    ).rejects.toThrow("different source epoch");
    await expect(
      readMcapMessageIndexWindow({
        reader,
        request: {
          ...request,
          anchorCursor: mcapMessageCursorForEntry(source, {
            ...current,
            topic: "/other",
          }),
        },
      }),
    ).rejects.toThrow("different topic");
    await expect(
      readMcapMessageIndexWindow({
        reader,
        request: request as McapReadMessageIndexWindowRequest,
      }),
    ).rejects.toThrow("requires one anchor");
  });

  it("rejects window sides larger than the bounded contract", async () => {
    await expect(
      readMcapMessageIndexWindow({
        reader: createReader([entry()]),
        request: {
          after: 201,
          anchorTimeNs: 10n,
          before: 0,
          source,
          topic: "/state",
        },
      }),
    ).rejects.toThrow("after must be an integer from 0 to 200");
  });

  it("stops after the bounded number of indexed chunk probes", async () => {
    const entries = Array.from({ length: 65 }, (_, index) =>
      entry({
        chunkStartOffset: BigInt(index + 1) * 1_000n,
        logTimeNs: BigInt(index + 1),
        messageOffset: BigInt(index + 1),
      }),
    );
    const anchor = entries.at(-1);
    if (!anchor) throw new Error("Expected a final indexed entry");

    await expect(
      readMcapMessageIndexWindow({
        reader: createReader(entries),
        request: {
          after: 0,
          anchorCursor: mcapMessageCursorForEntry(source, anchor),
          before: 200,
          source,
          topic: "/state",
        },
      }),
    ).rejects.toMatchObject({ operation: "raw-record-index-window" });
  });

  it("observes cancellation before index work", async () => {
    const controller = new AbortController();
    controller.abort();
    const reader = createReader([entry()]);

    await expect(
      readMcapMessageIndexWindow({
        reader,
        request: {
          after: 1,
          anchorTimeNs: 1n,
          before: 1,
          source,
          topic: "/state",
        },
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(reader.readLatestIndexedMessageTimes).not.toHaveBeenCalled();
  });

  it("stops an in-progress index scan when its signal aborts", async () => {
    const controller = new AbortController();
    const reader = createReader([
      entry({ logTimeNs: 1n, messageOffset: 1n }),
      entry({ logTimeNs: 2n, messageOffset: 2n }),
      entry({ logTimeNs: 3n, messageOffset: 3n }),
    ]);
    const read = reader.readIndexedMessageTimes.bind(reader);
    let yielded = 0;
    reader.readIndexedMessageTimes = async function* (request = {}) {
      expect(request.signal).toBe(controller.signal);
      for await (const value of read(request)) {
        yield value;
        yielded += 1;
        if (yielded === 1) controller.abort();
      }
    };

    await expect(
      readMcapMessageIndexWindow({
        reader,
        request: {
          after: 1,
          anchorTimeNs: 3n,
          before: 1,
          source,
          topic: "/state",
        },
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(yielded).toBe(1);
  });

  it("decodes and copies the exact selected cursor", async () => {
    const first = entry({ messageOffset: 10n });
    const second = entry({ channelId: 2, messageOffset: 20n });
    const reader = createReader([first, second], {
      valuesByOffset: new Map([
        [10n, { sibling: "first" }],
        [20n, { sibling: "second", values: [1, 2, 3] }],
      ]),
    });

    const result = await readMcapRawMessageAtCursor({
      reader,
      request: {
        cursor: mcapMessageCursorForEntry(source, second),
        includeFullJson: true,
        prune: { maxArrayLength: 1 },
        source,
        topic: "/state",
      },
    });

    expect(result.cursor).toBe(mcapMessageCursorForEntry(source, second));
    expect(JSON.parse(result.fullJson ?? "")).toEqual({
      sibling: "second",
      values: [1, 2, 3],
    });
    if (!result.root) throw new Error("Expected exact decoded root");
    expect(rawNodeToJson(result.root)).toEqual({
      sibling: "second",
      values: [1, "… 2 more items"],
    });
    await expect(
      readMcapRawMessageAtCursor({
        reader,
        request: {
          channelId: 1,
          cursor: mcapMessageCursorForEntry(source, second),
          source,
          topic: "/state",
        },
      }),
    ).rejects.toThrow("different channel");
  });

  it("rejects exact cursors whose channel or chunk is no longer addressable", async () => {
    const current = entry({ messageOffset: 10n });
    const reader = createReader([current]);

    await expect(
      readMcapRawMessageAtCursor({
        reader,
        request: {
          cursor: mcapMessageCursorForEntry(source, {
            ...current,
            chunkStartOffset: 999n,
          }),
          source,
          topic: "/state",
        },
      }),
    ).rejects.toThrow("stale or invalid");
    await expect(
      readMcapRawMessageAtCursor({
        reader,
        request: {
          cursor: mcapMessageCursorForEntry(source, {
            ...current,
            channelId: 99,
          }),
          source,
          topic: "/state",
        },
      }),
    ).rejects.toThrow("stale or invalid");
  });
});

function createReader(
  unorderedEntries: readonly McapIndexedMessageTime[],
  options: {
    readonly unorderedChunks?: boolean;
    readonly valuesByOffset?: ReadonlyMap<bigint, unknown>;
  } = {},
) {
  const entries = [...unorderedEntries].sort(compareIndexedMessageTimes);
  const chunkOffsets = [
    ...new Set(entries.map((value) => value.chunkStartOffset)),
  ];
  const chunks = chunkOffsets.map((chunkStartOffset) => {
    const members = entries.filter(
      (value) => value.chunkStartOffset === chunkStartOffset,
    );
    const times = members.map((value) => value.logTimeNs);
    return chunk({
      channelIds: new Set(members.map((value) => value.channelId)),
      chunkStartOffset,
      messageEndTime: times.reduce((max, value) => (value > max ? value : max)),
      messageStartTime: times.reduce((min, value) =>
        value < min ? value : min,
      ),
    });
  });
  if (options.unorderedChunks) chunks.reverse();
  const messages = new Map(
    entries.map((value) => [
      identity(value),
      message(
        value,
        options.valuesByOffset?.get(value.messageOffset) ?? {
          offset: value.messageOffset.toString(),
        },
      ),
    ]),
  );
  const readIndexedMessageTimes = async function* (
    request: McapReadIndexedMessageTimesRequest = {},
  ) {
    throwIfAborted(request.signal);
    const chunkFilter = request.chunkStartOffsets
      ? new Set(request.chunkStartOffsets)
      : null;
    const channelFilter = request.channelIds
      ? new Set(request.channelIds)
      : null;
    let count = 0;
    for await (const value of asyncValues(entries)) {
      throwIfAborted(request.signal);
      if (chunkFilter && !chunkFilter.has(value.chunkStartOffset)) continue;
      if (channelFilter && !channelFilter.has(value.channelId)) continue;
      if (request.topics && !request.topics.includes(value.topic)) continue;
      if (
        request.startTimeNs !== undefined &&
        value.logTimeNs < request.startTimeNs
      )
        continue;
      if (
        request.endTimeNs !== undefined &&
        value.logTimeNs > request.endTimeNs
      )
        continue;
      yield value;
      count += 1;
      if (request.limit !== undefined && count >= request.limit) return;
    }
  };
  const readLatestIndexedMessageTimes = vi.fn<
    NonNullable<McapIndexedReaderLike["readLatestIndexedMessageTimes"]>
  >((request: McapReadLatestIndexedMessageTimesRequest) =>
    Promise.resolve(
      new Map(
        request.topics.map((topic) => [
          topic,
          entries
            .filter(
              (value) =>
                value.topic === topic &&
                value.logTimeNs <= request.timeNs &&
                (!request.channelIds ||
                  request.channelIds.includes(value.channelId)),
            )
            .slice(-(request.limitPerTopic ?? 1)),
        ]),
      ),
    ),
  );
  return {
    channelsById: new Map([
      [1, channel(1)],
      [2, channel(2)],
    ]),
    chunkIndexes: chunks,
    readIndexedMessages: vi.fn<
      NonNullable<McapIndexedReaderLike["readIndexedMessages"]>
    >(
      (
        request: Parameters<
          NonNullable<McapIndexedReaderLike["readIndexedMessages"]>
        >[0],
      ) =>
        Promise.resolve(
          request.entries.map((value) => {
            const selected = messages.get(identity(value));
            if (!selected) throw new Error("Missing indexed test message");
            return selected;
          }),
        ),
    ),
    readIndexedMessageTimes,
    readLatestIndexedMessageTimes,
    readMessages: vi.fn(() => asyncValues(messages.values())),
    schemasById: new Map(),
  } satisfies McapIndexedReaderLike;
}

function entry(
  overrides: Partial<McapIndexedMessageTime> = {},
): McapIndexedMessageTime {
  return {
    channelId: overrides.channelId ?? 1,
    chunkStartOffset: overrides.chunkStartOffset ?? 100n,
    logTimeNs: overrides.logTimeNs ?? 10n,
    messageOffset: overrides.messageOffset ?? 0n,
    topic: overrides.topic ?? "/state",
  };
}

function cursorEntry(cursor: string): McapIndexedMessageTime {
  return mcapIndexedEntryFromCursor(cursor, source, "/state");
}

function identity(value: McapIndexedMessageTime): string {
  return `${value.chunkStartOffset}:${value.messageOffset}:${value.channelId}`;
}

function channel(id: number): McapChannel {
  return {
    id,
    messageEncoding: "json",
    metadata: new Map(),
    schemaId: 0,
    topic: "/state",
    type: "Channel",
  };
}

function chunk({
  channelIds,
  chunkStartOffset,
  messageEndTime,
  messageStartTime,
}: {
  readonly channelIds: ReadonlySet<number>;
  readonly chunkStartOffset: bigint;
  readonly messageEndTime: bigint;
  readonly messageStartTime: bigint;
}): McapChunkIndex {
  return {
    chunkLength: 1_000n,
    chunkStartOffset,
    compressedSize: 100n,
    compression: "",
    messageEndTime,
    messageIndexLength: 100n,
    messageIndexOffsets: new Map([...channelIds].map((id) => [id, 1n])),
    messageStartTime,
    type: "ChunkIndex",
    uncompressedSize: 1_000n,
  };
}

function message(value: McapIndexedMessageTime, payload: unknown): McapMessage {
  return {
    channelId: value.channelId,
    data: new TextEncoder().encode(JSON.stringify(payload)),
    logTime: value.logTimeNs,
    publishTime: value.logTimeNs,
    sequence: 0,
    type: "Message",
  };
}

async function* asyncValues<Value>(
  values: Iterable<Value>,
): AsyncGenerator<Value, void, void> {
  for await (const value of values) yield value;
}
