import { describe, expect, it } from "vitest";
import type { ByteReadDebugLog } from "../../../query/bytes";
import { createMcapTransportMeter } from "./transport-meter";

describe("createMcapTransportMeter", () => {
  it("accumulates fetched bytes and read counts", () => {
    const clock = createClock(1_000);
    const meter = createMcapTransportMeter(clock.now);

    meter.onByteRead(read({ durationMs: 100, fetchedBytes: 2_048 }));
    clock.advance(50);
    meter.onByteRead(read({ durationMs: 20, fetchedBytes: 1_024 }));

    const snapshot = meter.snapshot();
    expect(snapshot.fetchedBytes).toBe(3_072);
    expect(snapshot.reads).toBe(2);
    expect(snapshot.capturedAtMs).toBe(1_050);
  });

  it("ignores cache hits and coalesced reads", () => {
    const meter = createMcapTransportMeter(createClock(0).now);

    meter.onByteRead(read({ cacheResult: "fill-hit", fetchedBytes: 0 }));
    meter.onByteRead(read({ cacheResult: "persistent-hit", fetchedBytes: 0 }));
    meter.onByteRead(read({ cacheResult: "coalesced", fetchedBytes: 0 }));

    const snapshot = meter.snapshot();
    expect(snapshot.fetchedBytes).toBe(0);
    expect(snapshot.busyMs).toBe(0);
    expect(snapshot.reads).toBe(0);
  });

  it("counts overlapping fetch intervals once", () => {
    const clock = createClock(1_000);
    const meter = createMcapTransportMeter(clock.now);

    // Two fetches that ran concurrently over the same 100 ms.
    meter.onByteRead(read({ durationMs: 100, fetchedBytes: 1 }));
    meter.onByteRead(read({ durationMs: 100, fetchedBytes: 1 }));

    expect(meter.snapshot().busyMs).toBe(100);
  });

  it("sums disjoint fetch intervals", () => {
    const clock = createClock(1_000);
    const meter = createMcapTransportMeter(clock.now);

    meter.onByteRead(read({ durationMs: 100, fetchedBytes: 1 }));
    clock.advance(500);
    meter.onByteRead(read({ durationMs: 100, fetchedBytes: 1 }));

    expect(meter.snapshot().busyMs).toBe(200);
  });

  it("clips partially overlapping intervals against counted time", () => {
    const clock = createClock(1_000);
    const meter = createMcapTransportMeter(clock.now);

    // First fetch covers 900..1000.
    meter.onByteRead(read({ durationMs: 100, fetchedBytes: 1 }));
    clock.advance(50);
    // Second covers 950..1050; only 1000..1050 is new busy time.
    meter.onByteRead(read({ durationMs: 100, fetchedBytes: 1 }));

    expect(meter.snapshot().busyMs).toBe(150);
  });
});

function createClock(startMs: number) {
  let now = startMs;
  return {
    advance(deltaMs: number) {
      now += deltaMs;
    },
    now: () => now,
  };
}

function read(overrides: Partial<ByteReadDebugLog>): ByteReadDebugLog {
  return {
    blockFill: false,
    cacheResult: "fetched",
    durationMs: 10,
    fetchedBytes: 1,
    fillLength: "1",
    fillOffset: "0",
    requestedLength: "1",
    requestedOffset: "0",
    returnedBytes: 1,
    sourceId: "source",
    ...overrides,
  };
}
