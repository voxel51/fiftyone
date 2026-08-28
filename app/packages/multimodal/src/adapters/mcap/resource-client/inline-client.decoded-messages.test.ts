import { describe, expect, it, vi } from "vitest";
import { createInlineMcapResourceClient } from "./inline-client";
import { MCAP_ACTIVE_TIMELINE } from "../contracts/index";
import { isEpisodeReadCancelledError } from "../../../ports";
import {
  collect,
  createChannel,
  createMcapSourceDescriptor,
  createMessage,
  createReader,
  createSchema,
  createTestDecodeClient,
} from "./inline-client.test-fixtures";

describe("MCAP decoded messages", () => {
  it("decodes log-timeline messages through the generic decode client", async () => {
    const source = createMcapSourceDescriptor();
    const schemaData = new Uint8Array([9, 8, 7]);
    const messageBytes = new Uint8Array([1, 2, 3]);
    const message = createMessage(messageBytes);
    const decodeClient = createTestDecodeClient();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([[7, createChannel()]]),
          messages: [message],
          schemasById: new Map([[3, createSchema(schemaData)]]),
        }),
      ),
    });

    const messages = await collect(
      client.readDecodedMessages({
        limit: 1,
        source,
        topics: ["/topic"],
      }),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      channelId: 7,
      logTimeNs: 100n,
      publishTimeNs: 101n,
      sequence: 2,
      timelineTimeNs: 100n,
      topic: "/topic",
    });
    expect(decodeClient.decode).toHaveBeenCalledWith({
      bytes: messageBytes,
      cache: {
        decoderOptionsKey: "activeTimeline=log",
        recordId: expect.stringMatching(/^7:100:101:2:3:[0-9a-f]{8}$/),
        source,
        streamId: "/topic",
        timeNs: 100n,
      },
      context: {
        schemaData,
        sourceTimestamps: {
          logTime: 100n,
          publishTime: 101n,
        },
        streamId: "/topic",
        timeRangeStartKey: "logTime",
      },
      payload: {
        encoding: "protobuf",
        schema: "foxglove.CompressedImage",
        schemaEncoding: "protobuf",
      },
    });
  });

  it("does not decode messages when the decoded-message limit is invalid", async () => {
    const decodeClient = createTestDecodeClient();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          messages: [createMessage(new Uint8Array([1]))],
        }),
      ),
    });

    await expect(
      collect(
        client.readDecodedMessages({
          limit: 0,
          source: createMcapSourceDescriptor(),
          topics: ["/topic"],
        }),
      ),
    ).resolves.toEqual([]);
    expect(decodeClient.decode).not.toHaveBeenCalled();
  });

  it("aborts before opening a reader or yielding a message", async () => {
    const controller = new AbortController();
    controller.abort();
    const readerFactory = vi.fn(async () => createReader());
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      readerFactory,
    });

    const next = client
      .readDecodedMessages(
        { source: createMcapSourceDescriptor(), topics: ["/topic"] },
        { signal: controller.signal },
      )
      .next();

    await expect(next).rejects.toSatisfy(isEpisodeReadCancelledError);
    expect(readerFactory).not.toHaveBeenCalled();
  });

  it("interrupts a blocked byte read with the request signal", async () => {
    const controller = new AbortController();
    const readBytes = vi.fn(
      (request: { readonly signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          request.signal?.addEventListener(
            "abort",
            () => reject(request.signal?.reason ?? new Error("aborted")),
            { once: true },
          );
        }),
    );
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes },
      readerFactory: vi.fn(async (_source, readable) => {
        await readable.read(0n, 1n);
        return createReader();
      }),
    });
    const next = client
      .readDecodedMessages(
        { source: createMcapSourceDescriptor(), topics: ["/topic"] },
        { signal: controller.signal },
      )
      .next();

    await vi.waitFor(() => expect(readBytes).toHaveBeenCalledOnce());
    controller.abort();

    await expect(next).rejects.toSatisfy(isEpisodeReadCancelledError);
    expect(readBytes.mock.calls[0]?.[0].signal).toBe(controller.signal);
  });

  it("interrupts a blocked cached-reader byte read with the worker signal slot", async () => {
    const controller = new AbortController();
    const readSignal = { current: controller.signal as AbortSignal | null };
    const readBytes = vi.fn(
      (request: { readonly signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          request.signal?.addEventListener(
            "abort",
            () => reject(request.signal?.reason ?? new Error("aborted")),
            { once: true },
          );
        }),
    );
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes },
      readSignal,
      readerFactory: vi.fn(async (_source, readable) => {
        await readable.read(0n, 1n);
        return createReader();
      }),
    });
    const next = client
      .readDecodedMessages({
        source: createMcapSourceDescriptor(),
        topics: ["/topic"],
      })
      .next();

    await vi.waitFor(() => expect(readBytes).toHaveBeenCalledOnce());
    expect(readBytes.mock.calls[0]?.[0].signal).toBe(controller.signal);

    controller.abort();

    await expect(next).rejects.toSatisfy(isEpisodeReadCancelledError);
  });

  it("aborts between messages without cancelling a concurrent read", async () => {
    const firstController = new AbortController();
    const secondController = new AbortController();
    const disposals: ReturnType<typeof vi.fn>[] = [];
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () => {
        const dispose = vi.fn();
        disposals.push(dispose);
        return Object.assign(
          createReader({
            messages: [
              createMessage(new Uint8Array([1])),
              createMessage(new Uint8Array([2])),
            ],
          }),
          { dispose },
        );
      }),
    });
    const first = client.readDecodedMessages(
      { source: createMcapSourceDescriptor(), topics: ["/topic"] },
      { signal: firstController.signal },
    );
    const second = client.readDecodedMessages(
      { source: createMcapSourceDescriptor(), topics: ["/topic"] },
      { signal: secondController.signal },
    );

    await expect(first.next()).resolves.toMatchObject({ done: false });
    firstController.abort();

    await expect(first.next()).rejects.toSatisfy(isEpisodeReadCancelledError);
    expect(disposals[0]).toHaveBeenCalledOnce();
    await expect(second.next()).resolves.toMatchObject({ done: false });
    await second.return(undefined);
    expect(disposals[1]).toHaveBeenCalledOnce();
  });
});
