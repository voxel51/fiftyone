import { describe, expect, it } from "vitest";
import type { McapLaneTransportSnapshot } from "../worker/transport-meter";
import {
  createMcapNetworkHealthEstimator,
  shouldPublishMcapNetworkHealth,
} from "./mcap-network-health-estimator";

describe("createMcapNetworkHealthEstimator", () => {
  it("stays healthy without buffering even under heavy transport", () => {
    const estimator = createMcapNetworkHealthEstimator();

    feedBusyTransport(estimator, 0, 10);

    const health = estimator.evaluate(10_000);
    expect(health.limited).toBe(false);
    expect(health.throughputBytesPerSec).toBeGreaterThan(0);
  });

  it("flags sustained buffering while the link is busy", () => {
    const estimator = createMcapNetworkHealthEstimator();

    estimator.setBuffering(true, 0);
    feedBusyTransport(estimator, 0, 6);

    expect(estimator.evaluate(500).limited).toBe(false);
    expect(estimator.evaluate(3_000).limited).toBe(true);
  });

  it("does not blame the network for stalls with an idle link", () => {
    const estimator = createMcapNetworkHealthEstimator();

    estimator.setBuffering(true, 0);
    // Transport samples arrive but the lanes barely touched the network.
    let snapshotAt = 0;
    for (let index = 0; index < 6; index += 1) {
      snapshotAt += 500;
      estimator.onTransportSample(
        sample("foreground", {
          busyMs: snapshotAt * 0.05,
          capturedAtMs: snapshotAt,
          fetchedBytes: index * 1_000,
        }),
        snapshotAt,
      );
    }

    expect(estimator.evaluate(3_000).limited).toBe(false);
  });

  it("clears the verdict after buffering stays calm", () => {
    const estimator = createMcapNetworkHealthEstimator();

    estimator.setBuffering(true, 0);
    feedBusyTransport(estimator, 0, 6);
    expect(estimator.evaluate(3_000).limited).toBe(true);

    estimator.setBuffering(false, 3_200);
    // Keep the link busy: recovery must come from calm time, not idleness.
    feedBusyTransport(estimator, 3_200, 8);
    expect(estimator.evaluate(4_000).limited).toBe(true);
    expect(estimator.evaluate(7_000).limited).toBe(false);
  });

  it("clears the verdict when the link goes idle mid-buffering", () => {
    const estimator = createMcapNetworkHealthEstimator({ windowMs: 2_000 });

    estimator.setBuffering(true, 0);
    feedBusyTransport(estimator, 0, 6);
    expect(estimator.evaluate(3_000).limited).toBe(true);

    // Later samples show the lanes stopped fetching almost entirely.
    let atMs = 3_000;
    let capturedAtMs = 3_000;
    for (let index = 0; index < 6; index += 1) {
      atMs += 500;
      capturedAtMs += 500;
      estimator.onTransportSample(
        sample("foreground", {
          busyMs: 3_000 * 0.9 + (capturedAtMs - 3_000) * 0.05,
          capturedAtMs,
          fetchedBytes: 6 * 100_000 + index,
        }),
        atMs,
      );
    }

    expect(estimator.evaluate(6_000).limited).toBe(false);
  });

  it("re-baselines a lane whose worker clock restarted", () => {
    const estimator = createMcapNetworkHealthEstimator();

    estimator.onTransportSample(
      sample("foreground", {
        busyMs: 5_000,
        capturedAtMs: 6_000,
        fetchedBytes: 1_000_000,
      }),
      1_000,
    );
    // Worker replaced: cumulative counters restart from a smaller clock.
    estimator.onTransportSample(
      sample("foreground", {
        busyMs: 10,
        capturedAtMs: 50,
        fetchedBytes: 100,
      }),
      1_500,
    );

    const health = estimator.evaluate(2_000);
    expect(health.throughputBytesPerSec).toBeNull();
    expect(health.limited).toBe(false);
  });
});

describe("shouldPublishMcapNetworkHealth", () => {
  it("publishes verdict flips", () => {
    expect(
      shouldPublishMcapNetworkHealth(
        { limited: false, throughputBytesPerSec: null, updatedAtMs: 0 },
        { limited: true, throughputBytesPerSec: 1_000, updatedAtMs: 1 },
      ),
    ).toBe(true);
  });

  it("suppresses healthy-state churn", () => {
    expect(
      shouldPublishMcapNetworkHealth(
        { limited: false, throughputBytesPerSec: 1_000, updatedAtMs: 0 },
        { limited: false, throughputBytesPerSec: 9_000, updatedAtMs: 1 },
      ),
    ).toBe(false);
  });

  it("publishes material throughput moves while limited", () => {
    const previous = {
      limited: true,
      throughputBytesPerSec: 1_000,
      updatedAtMs: 0,
    };
    expect(
      shouldPublishMcapNetworkHealth(previous, {
        limited: true,
        throughputBytesPerSec: 1_050,
        updatedAtMs: 1,
      }),
    ).toBe(false);
    expect(
      shouldPublishMcapNetworkHealth(previous, {
        limited: true,
        throughputBytesPerSec: 1_500,
        updatedAtMs: 1,
      }),
    ).toBe(true);
  });
});

/**
 * Feeds samples every 500 ms where the lane spent ~90% of the wall busy and
 * moved 100 KB per sample.
 */
function feedBusyTransport(
  estimator: ReturnType<typeof createMcapNetworkHealthEstimator>,
  fromMs: number,
  count: number,
) {
  for (let index = 1; index <= count; index += 1) {
    const atMs = fromMs + index * 500;
    estimator.onTransportSample(
      sample("foreground", {
        busyMs: atMs * 0.9,
        capturedAtMs: atMs,
        fetchedBytes: (fromMs / 500 + index) * 100_000,
      }),
      atMs,
    );
  }
}

function sample(
  lane: McapLaneTransportSnapshot["lane"],
  snapshot: {
    readonly busyMs: number;
    readonly capturedAtMs: number;
    readonly fetchedBytes: number;
  },
): McapLaneTransportSnapshot {
  return {
    lane,
    snapshot: { ...snapshot, reads: 1 },
  };
}
