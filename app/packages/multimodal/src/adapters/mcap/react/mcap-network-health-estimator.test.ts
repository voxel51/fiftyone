import { describe, expect, it } from "vitest";
import type { McapLaneTransportSnapshot } from "../worker/transport-meter";
import {
  createMcapNetworkHealthEstimator,
  shouldDeferMcapIdleWork,
  shouldPublishMcapNetworkHealth,
} from "./mcap-network-health-estimator";

describe("MCAP network health estimator", () => {
  it("enters limited only while buffering and the transport is busy", () => {
    const estimator = createMcapNetworkHealthEstimator({
      minBufferingMs: 100,
      windowMs: 1_000,
    });

    estimator.onTransportSample(sample(0, 0, 0), 0);
    estimator.onTransportSample(sample(100, 90, 1_000), 100);
    estimator.setBuffering(true, 0);

    const health = estimator.evaluate(150);

    expect(health.limited).toBe(true);
    expect(health.busyFraction).toBe(0.9);
    expect(health.throughputBytesPerSec).toBe(1_000);
  });

  it("does not blame the network when the link is idle", () => {
    const estimator = createMcapNetworkHealthEstimator({
      minBufferingMs: 100,
      windowMs: 1_000,
    });

    estimator.onTransportSample(sample(0, 0, 0), 0);
    estimator.onTransportSample(sample(100, 10, 1_000), 100);
    estimator.setBuffering(true, 0);

    expect(estimator.evaluate(150).limited).toBe(false);
  });

  it("clears limited after a calm window", () => {
    const estimator = createMcapNetworkHealthEstimator({
      exitCalmMs: 100,
      minBufferingMs: 100,
      windowMs: 1_000,
    });

    estimator.onTransportSample(sample(0, 0, 0), 0);
    estimator.onTransportSample(sample(100, 90, 1_000), 100);
    estimator.setBuffering(true, 0);
    expect(estimator.evaluate(150).limited).toBe(true);

    estimator.setBuffering(false, 160);
    expect(estimator.evaluate(260).limited).toBe(false);
  });
});

describe("MCAP idle-work network gate", () => {
  it("defers idle work only while network-limited and user-visible work is waiting", () => {
    expect(
      shouldDeferMcapIdleWork({
        buffering: true,
        limited: false,
        msSinceSeek: null,
        playPending: false,
      }),
    ).toBe(false);

    expect(
      shouldDeferMcapIdleWork({
        buffering: true,
        limited: true,
        msSinceSeek: null,
        playPending: false,
      }),
    ).toBe(true);

    expect(
      shouldDeferMcapIdleWork({
        buffering: false,
        limited: true,
        msSinceSeek: 500,
        playPending: false,
        seekCooldownMs: 1_000,
      }),
    ).toBe(true);
  });

  it("publishes verdict flips and material throughput changes", () => {
    expect(
      shouldPublishMcapNetworkHealth(
        {
          busyFraction: 0,
          limited: false,
          throughputBytesPerSec: null,
          updatedAtMs: 0,
        },
        {
          busyFraction: 0.8,
          limited: true,
          throughputBytesPerSec: 100,
          updatedAtMs: 1,
        },
      ),
    ).toBe(true);

    expect(
      shouldPublishMcapNetworkHealth(
        {
          busyFraction: 0.8,
          limited: true,
          throughputBytesPerSec: 100,
          updatedAtMs: 1,
        },
        {
          busyFraction: 0.8,
          limited: true,
          throughputBytesPerSec: 108,
          updatedAtMs: 2,
        },
      ),
    ).toBe(false);

    expect(
      shouldPublishMcapNetworkHealth(
        {
          busyFraction: 0.8,
          limited: true,
          throughputBytesPerSec: 100,
          updatedAtMs: 1,
        },
        {
          busyFraction: 0.8,
          limited: true,
          throughputBytesPerSec: 130,
          updatedAtMs: 2,
        },
      ),
    ).toBe(true);
  });

  it("publishes material bandwidth changes before a limited verdict", () => {
    expect(
      shouldPublishMcapNetworkHealth(
        {
          busyFraction: 0.1,
          limited: false,
          throughputBytesPerSec: null,
          updatedAtMs: 1,
        },
        {
          busyFraction: 0.2,
          limited: false,
          throughputBytesPerSec: 100,
          updatedAtMs: 2,
        },
      ),
    ).toBe(true);

    expect(
      shouldPublishMcapNetworkHealth(
        {
          busyFraction: 0.2,
          limited: false,
          throughputBytesPerSec: 100,
          updatedAtMs: 2,
        },
        {
          busyFraction: 0.2,
          limited: false,
          throughputBytesPerSec: 130,
          updatedAtMs: 3,
        },
      ),
    ).toBe(true);
  });
});

function sample(
  capturedAtMs: number,
  busyMs: number,
  fetchedBytes: number,
): McapLaneTransportSnapshot {
  return {
    lane: "foreground",
    snapshot: {
      busyMs,
      capturedAtMs,
      fetchedBytes,
      reads: fetchedBytes > 0 ? 1 : 0,
    },
  };
}
