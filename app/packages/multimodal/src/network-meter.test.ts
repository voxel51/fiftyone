import { describe, expect, it } from "vitest";
import type { ByteReadDebugLog } from "./query/bytes";
import { createNetworkTransportMeter } from "./network-meter";

describe("network transport meter", () => {
  it("counts fetched bytes and clips overlapping busy intervals", () => {
    let now = 100;
    const meter = createNetworkTransportMeter(() => now);

    meter.onByteRead(read({ durationMs: 100, fetchedBytes: 1_000 }));
    expect(meter.snapshot()).toMatchObject({
      busyMs: 100,
      fetchedBytes: 1_000,
      reads: 1,
    });

    now = 150;
    meter.onByteRead(read({ durationMs: 100, fetchedBytes: 2_000 }));
    expect(meter.snapshot()).toMatchObject({
      busyMs: 150,
      fetchedBytes: 3_000,
      reads: 2,
    });
  });

  it("ignores cache hits and coalesced reads", () => {
    const meter = createNetworkTransportMeter(() => 100);

    meter.onByteRead(read({ cacheResult: "fill-hit", fetchedBytes: 0 }));
    meter.onByteRead(read({ cacheResult: "coalesced", fetchedBytes: 0 }));
    meter.onByteRead(read({ fetchedBytes: 1_000, readProfile: "local" }));

    expect(meter.snapshot()).toMatchObject({
      busyMs: 0,
      fetchedBytes: 0,
      reads: 0,
    });
  });
});

function read(overrides: Partial<ByteReadDebugLog>): ByteReadDebugLog {
  return {
    blockFill: false,
    cacheResult: "fetched",
    durationMs: 10,
    fetchedBytes: 100,
    fillLength: "100",
    fillOffset: "0",
    requestedLength: "100",
    requestedOffset: "0",
    returnedBytes: 100,
    sourceId: "source:1",
    ...overrides,
  };
}
