import { describe, expect, it, vi } from "vitest";
import { createInlineMcapResourceClient } from "./inline-client";
import { MCAP_ACTIVE_TIMELINE } from "../contracts/index";
import {
  collect,
  asyncValues,
  createChannel,
  createChunkIndex,
  createMcapSourceDescriptor,
  createMessage,
  createReader,
  createTestDecodeClient,
  mockReaderFactory,
} from "./inline-client.test-fixtures";
import { RAW_RECORD_MAX_WALL_TIME_MS } from "./operations/read-raw-message-record";
import { mcapMessageCursorForEntry } from "./operations/message-cursor";

describe("MCAP reader lifecycle", () => {
  it("reads log timeline range from chunk indexes without scanning messages", async () => {
    const source = createMcapSourceDescriptor();
    const readMessages = vi.fn(() => asyncValues([]));
    const readIndexedMessageTimes = vi.fn(() =>
      asyncValues([
        {
          channelId: 7,
          chunkStartOffset: 10n,
          logTimeNs: 100n,
          messageOffset: 8n,
          topic: "/camera",
        },
      ]),
    );
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          chunkIndexes: [
            createChunkIndex({
              messageEndTime: 250n,
              messageStartTime: 100n,
            }),
            createChunkIndex({
              messageEndTime: 450n,
              messageStartTime: 300n,
            }),
          ],
          readIndexedMessageTimes,
          readMessages,
        }),
      ),
    });

    await expect(
      client.readTimelineRange({
        source,
      }),
    ).resolves.toEqual({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      byteTimeline: [
        {
          cumulativeCompressedBytes: 256,
          endTimeNs: 250n,
          startOffsetBytes: 1_000n,
        },
        {
          cumulativeCompressedBytes: 512,
          endTimeNs: 450n,
          startOffsetBytes: 1_000n,
        },
      ],
      endTimeNs: 450n,
      startTimeNs: 100n,
    });
    expect(readIndexedMessageTimes).not.toHaveBeenCalled();
    expect(readMessages).not.toHaveBeenCalled();
  });

  it("rejects byte reads past known source size before hitting the byte client", async () => {
    const source = createMcapSourceDescriptor();
    const readBytes = vi.fn();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(async (_source, readable) => {
        await readable.read(128n, 1n);
        return createReader();
      }),
    });

    await expect(
      collect(
        client.readDecodedMessages({
          source,
          topics: ["/topic"],
        }),
      ),
    ).rejects.toThrow("exceeds source size 128");
    expect(readBytes).not.toHaveBeenCalled();
  });

  it("retries reader initialization after a rejected reader promise", async () => {
    const readerFactory = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary init failure"))
      .mockResolvedValueOnce(
        createReader({
          chunkIndexes: [
            createChunkIndex({
              messageEndTime: 20n,
              messageStartTime: 10n,
            }),
          ],
        }),
      );
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory,
    });
    const request = {
      source: createMcapSourceDescriptor(),
    };

    await expect(client.readTimelineRange(request)).rejects.toThrow(
      "temporary init failure",
    );
    await expect(client.readTimelineRange(request)).resolves.toEqual({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      byteTimeline: [
        {
          cumulativeCompressedBytes: 256,
          endTimeNs: 20n,
          startOffsetBytes: 1_000n,
        },
      ],
      endTimeNs: 20n,
      startTimeNs: 10n,
    });
    expect(readerFactory).toHaveBeenCalledTimes(2);
  });

  it("interrupts blocked inventory initialization with its open signal", async () => {
    const controller = new AbortController();
    const readBytes = vi.fn(
      (request: { readonly signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          request.signal?.addEventListener(
            "abort",
            () => reject(request.signal?.reason),
            { once: true },
          );
        }),
    );
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes },
      readerFactory: mockReaderFactory(async (_source, readable) => {
        await readable.read(0n, 1n);
        return createReader();
      }),
    });
    const range = client.readTimelineRange(
      { source: createMcapSourceDescriptor() },
      { signal: controller.signal },
    );

    await vi.waitFor(() => expect(readBytes).toHaveBeenCalledOnce());
    controller.abort();

    await expect(range).rejects.toMatchObject({ name: "AbortError" });
    expect(readBytes.mock.calls[0]?.[0].signal).toBe(controller.signal);
  });

  it("aborts blocked raw-record byte work at the wall-time bound", async () => {
    vi.useFakeTimers();
    try {
      let byteSignal: AbortSignal | undefined;
      const readBytes = vi.fn(
        (request: { readonly signal?: AbortSignal }) =>
          new Promise<never>((_resolve, reject) => {
            byteSignal = request.signal;
            request.signal?.addEventListener(
              "abort",
              () => reject(new Error("byte read aborted")),
              { once: true },
            );
          }),
      );
      const client = createInlineMcapResourceClient({
        byteClient: { readBytes },
        readerFactory: mockReaderFactory(async (_source, readable) => {
          await readable.read(0n, 1n);
          return createReader();
        }),
      });
      const read = client.readRawMessageRecord({
        source: createMcapSourceDescriptor(),
        timeNs: 1n,
        topic: "/state",
      });
      const rejection = expect(read).rejects.toMatchObject({
        name: "EpisodeReadUnsupportedError",
        operation: "raw-record-wall-time",
      });
      await Promise.resolve();
      expect(readBytes).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(RAW_RECORD_MAX_WALL_TIME_MS);

      await rejection;
      expect(byteSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reuses one cached reader across exact cursor reads", async () => {
    const source = createMcapSourceDescriptor();
    const entry = {
      channelId: 7,
      chunkStartOffset: 1_000n,
      logTimeNs: 100n,
      messageOffset: 12n,
      topic: "/state",
    };
    const message = createMessage(
      new TextEncoder().encode(JSON.stringify({ exact: true })),
      { channelId: 7, logTime: 100n },
    );
    const readIndexedMessages = vi.fn(() => Promise.resolve([message]));
    const readerFactory = mockReaderFactory(() =>
      createReader({
        channelsById: new Map([
          [
            7,
            createChannel({
              id: 7,
              messageEncoding: "json",
              schemaId: 0,
              topic: "/state",
            }),
          ],
        ]),
        chunkIndexes: [
          createChunkIndex({
            chunkStartOffset: 1_000n,
            messageIndexLength: 32n,
            messageIndexOffsets: new Map([[7, 1_100n]]),
          }),
        ],
        readIndexedMessages,
        schemasById: new Map(),
      }),
    );
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      readerFactory,
    });
    const request = {
      cursor: mcapMessageCursorForEntry(source, entry),
      source,
      topic: "/state",
    };

    await client.readRawMessageAtCursor?.(request);
    await client.readRawMessageAtCursor?.(request);

    expect(readerFactory).toHaveBeenCalledOnce();
    expect(readIndexedMessages).toHaveBeenCalledTimes(2);
  });

  it("stops waiting for cached-reader initialization when cancelled", async () => {
    let resolveReader!: (reader: ReturnType<typeof createReader>) => void;
    const readerFactory = mockReaderFactory(
      () =>
        new Promise<ReturnType<typeof createReader>>((resolve) => {
          resolveReader = resolve;
        }),
    );
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      readerFactory,
    });
    const controller = new AbortController();
    const read = client.readRawMessageAtCursor?.(
      {
        cursor: "opaque-cursor",
        source: createMcapSourceDescriptor(),
        topic: "/state",
      },
      { signal: controller.signal },
    );
    if (!read) throw new Error("Expected exact reader");

    controller.abort();

    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    resolveReader(createReader());
    await Promise.resolve();
    client.dispose();
  });
});
