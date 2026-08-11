import { describe, expect, it, vi } from "vitest";
import type {
  McapIndexedMessageTime,
  McapIndexedReaderLike,
} from "../reader/index";
import { createMcapPredecessorStore } from "./predecessor-store";
import { resolveIndexedPredecessorRound } from "./indexed-predecessor-probe";

describe("indexed predecessor probe protocol", () => {
  it("shares hits, misses, limits, backward seeks, and duplicate timestamps", async () => {
    const ninetyA = entry(90n, 1n);
    const ninetyB = entry(90n, 2n);
    const seventy = entry(70n, 3n);
    const readLatestIndexedMessageTimes = vi
      .fn<NonNullable<McapIndexedReaderLike["readLatestIndexedMessageTimes"]>>()
      .mockResolvedValueOnce(new Map([["/topic", [ninetyA, ninetyB]]]))
      .mockResolvedValueOnce(new Map([["/topic", [seventy]]]))
      .mockResolvedValueOnce(new Map([["/topic", [ninetyA, ninetyB]]]));
    const reader = createReader(readLatestIndexedMessageTimes);
    const predecessorStore = createMcapPredecessorStore();
    const resolve = (timeNs: bigint, limitPerTopic = 2) =>
      resolveIndexedPredecessorRound({
        extendFromTimeNs: timeNs,
        indexedMessageTimeNs: (candidate) => candidate.logTimeNs,
        limitPerTopic,
        nextKnownTimeNs: () => 200n,
        predecessorStore,
        probeTimeNs: timeNs,
        reader,
        timeNs,
        topics: ["/topic"],
      });

    const first = await resolve(100n);
    const overlapping = await resolve(150n);
    const backward = await resolve(80n);
    const changedLimit = await resolve(100n, 1);

    expect(first.entriesByTopic.get("/topic")).toEqual([ninetyA, ninetyB]);
    expect(overlapping.entriesByTopic.get("/topic")).toEqual([
      ninetyA,
      ninetyB,
    ]);
    expect(overlapping.probedTopics).toEqual([]);
    expect(backward.entriesByTopic.get("/topic")).toEqual([seventy]);
    expect(changedLimit.entriesByTopic.get("/topic")).toEqual([
      ninetyA,
      ninetyB,
    ]);
    expect(readLatestIndexedMessageTimes).toHaveBeenCalledTimes(3);
    expect(
      readLatestIndexedMessageTimes.mock.calls.map(([request]) => request),
    ).toEqual([
      { limitPerTopic: 2, timeNs: 100n, topics: ["/topic"] },
      { limitPerTopic: 2, timeNs: 80n, topics: ["/topic"] },
      { limitPerTopic: 1, timeNs: 100n, topics: ["/topic"] },
    ]);
  });

  it("checks cancellation on both sides of an indexed probe", async () => {
    const readLatestIndexedMessageTimes = vi.fn<
      NonNullable<McapIndexedReaderLike["readLatestIndexedMessageTimes"]>
    >(() => Promise.resolve(new Map([["/topic", [entry(90n, 1n)]]])));
    const reader = createReader(readLatestIndexedMessageTimes);
    let checks = 0;

    await expect(
      resolveIndexedPredecessorRound({
        indexedMessageTimeNs: (candidate) => candidate.logTimeNs,
        limitPerTopic: 1,
        nextKnownTimeNs: () => 101n,
        probeTimeNs: 100n,
        reader,
        throwIfCancelled: () => {
          checks += 1;
          if (checks === 2) throw new Error("cancelled after probe");
        },
        timeNs: 100n,
        topics: ["/topic"],
      }),
    ).rejects.toThrow("cancelled after probe");
    expect(readLatestIndexedMessageTimes).toHaveBeenCalledTimes(1);
  });

  it("does not swallow indexed probe failures", async () => {
    const reader = createReader(
      vi.fn<
        NonNullable<McapIndexedReaderLike["readLatestIndexedMessageTimes"]>
      >(() => Promise.reject(new Error("index probe failed"))),
    );

    await expect(
      resolveIndexedPredecessorRound({
        indexedMessageTimeNs: (candidate) => candidate.logTimeNs,
        limitPerTopic: 1,
        nextKnownTimeNs: () => 101n,
        probeTimeNs: 100n,
        reader,
        timeNs: 100n,
        topics: ["/topic"],
      }),
    ).rejects.toThrow("index probe failed");
  });
});

function entry(
  logTimeNs: bigint,
  messageOffset: bigint,
): McapIndexedMessageTime {
  return {
    channelId: 1,
    chunkStartOffset: 1_000n,
    logTimeNs,
    messageOffset,
    topic: "/topic",
  };
}

function createReader(
  readLatestIndexedMessageTimes: NonNullable<
    McapIndexedReaderLike["readLatestIndexedMessageTimes"]
  >,
): McapIndexedReaderLike {
  return {
    channelsById: new Map(),
    chunkIndexes: [],
    readLatestIndexedMessageTimes,
    readMessages: () => asyncValues([]),
    schemasById: new Map(),
  };
}

async function* asyncValues<Value>(
  values: Iterable<Value>,
): AsyncGenerator<Value, void, void> {
  for await (const value of values) yield value;
}
