import { describe, expect, it, vi } from "vitest";
import type { McapDecodedMessage } from "../contracts";
import { DecodedRecordStore } from "./decoded-record-store";

describe("decoded MCAP record store", () => {
  it("leases exact topic records and preserves canonical object identity", () => {
    const store = new DecodedRecordStore();
    const camera = createMessage("camera", "/camera", 1n, 32);
    const lidar = createMessage("lidar", "/lidar", 2n, 64);

    expect(store.canonicalize(camera)).toBe(camera);
    store.canonicalize(lidar);
    const lease = store.acquire(["/camera"]);

    expect(lease.recordIds).toEqual(["camera"]);
    expect(
      lease.get({
        kind: "retained-decoded-message",
        recordId: "camera",
        timelineTimeNs: 1n,
        topic: "/camera",
      }),
    ).toBe(camera);
    expect(store.canonicalize(createMessage("camera", "/camera", 1n, 32))).toBe(
      camera,
    );
    lease.release();
  });

  it("bounds the weak identity index with least-recently-used eviction", () => {
    const events = vi.fn();
    const store = new DecodedRecordStore({
      maxEntries: 2,
      onEvent: events,
    });
    const one = createMessage("one", "/camera", 1n, 32);
    const two = createMessage("two", "/camera", 2n, 32);
    const three = createMessage("three", "/camera", 3n, 32);
    store.canonicalize(one);
    store.canonicalize(two);
    store.canonicalize(one);
    store.canonicalize(three);

    expect(store.size).toBe(2);
    expect(store.acquire(["/camera"]).recordIds).toEqual(["one", "three"]);
    expect(events).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "evict-capacity", recordId: "two" }),
    );
  });

  it("does not evict leased records and retries skipped records later", () => {
    const message = createMessage("one", "/camera", 1n, 32);
    const store = new DecodedRecordStore({ maxBytes: 32, maxEntries: 1 });
    store.canonicalize(message);
    const lease = store.acquire(["/camera"]);
    const skipped = createMessage("two", "/camera", 2n, 32);

    expect(store.canonicalize(skipped)).toBe(skipped);
    const whilePinned = store.acquire(["/camera"]);
    expect(whilePinned.recordIds).toEqual(["one"]);
    whilePinned.release();
    lease.release();
    store.canonicalize(skipped);
    expect(store.acquire(["/camera"]).recordIds).toEqual(["two"]);
  });

  it("rejects stale or mismatched retained references", () => {
    const store = new DecodedRecordStore();
    store.canonicalize(createMessage("one", "/camera", 1n, 32));
    const lease = store.acquire(["/camera"]);

    expect(() =>
      lease.get({
        kind: "retained-decoded-message",
        recordId: "one",
        timelineTimeNs: 2n,
        topic: "/camera",
      }),
    ).toThrow("unavailable retained MCAP record");
  });

  it("uses the byte bound only as a pin-handshake backstop", () => {
    const store = new DecodedRecordStore({ maxBytes: 1, maxEntries: 1 });
    const message = createMessage("one", "/camera", 1n, 32);

    expect(store.canonicalize(message)).toBe(message);
    expect(store.size).toBe(1);
    expect(store.acquire(["/camera"]).recordIds).toEqual([]);

    const bounded = new DecodedRecordStore();
    bounded.canonicalize(message);
    const lease = bounded.acquire(["/camera"]);
    expect(lease.recordIds).toEqual(["one"]);
    lease.release();
    bounded.clear();
    expect(bounded.size).toBe(0);
  });

  it("skips records without a trustworthy decoded-size bound", () => {
    const store = new DecodedRecordStore();
    const base = createMessage("one", "/camera", 1n, 0);
    const message: McapDecodedMessage = {
      ...base,
      decoded: {
        ...base.decoded,
        output: { attributes: {} },
      },
    };

    expect(store.canonicalize(message)).toBe(message);
    expect(store.size).toBe(0);
  });
});

function createMessage(
  recordId: string,
  topic: string,
  timelineTimeNs: bigint,
  bytes: number,
): McapDecodedMessage {
  const buffer = new ArrayBuffer(bytes);
  return {
    activeTimeline: "log",
    channelId: 1,
    decoded: {
      decoderId: "decoder",
      decoderVersion: "1",
      output: {
        attributes: {},
        resourceHints: { sizeBytes: bytes, transferables: [buffer] },
      },
      payload: { encoding: "protobuf" },
    },
    logTimeNs: timelineTimeNs,
    publishTimeNs: timelineTimeNs,
    recordId,
    sequence: 1,
    timelineTimeNs,
    topic,
  };
}
