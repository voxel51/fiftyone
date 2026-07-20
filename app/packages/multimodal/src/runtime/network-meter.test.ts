import { describe, expect, it } from "vitest";
import type { ByteReadDebugLog } from "../query/bytes";
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

  it("unions nested intervals regardless of completion order", () => {
    let now = 100;
    const meter = createNetworkTransportMeter(() => now);

    meter.onByteRead(read({ durationMs: 20, fetchedBytes: 100 }));
    now = 120;
    meter.onByteRead(read({ durationMs: 120, fetchedBytes: 200 }));
    now = 180;
    meter.onByteRead(read({ durationMs: 30, fetchedBytes: 300 }));

    expect(meter.snapshot()).toMatchObject({
      busyMs: 150,
      fetchedBytes: 600,
      reads: 3,
    });
  });

  it("counts zero-byte network fetches without reducing byte totals", () => {
    const meter = createNetworkTransportMeter(() => 100);
    meter.onByteRead(read({ durationMs: 25, fetchedBytes: 0 }));
    meter.onByteRead(read({ durationMs: 10, fetchedBytes: -1 }));

    expect(meter.snapshot()).toMatchObject({
      busyMs: 25,
      fetchedBytes: 0,
      reads: 2,
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
