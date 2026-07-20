import { describe, expect, it } from "vitest";
import type { LaneTransportSnapshot } from "../../../runtime";
import {
  createEpisodeNetworkHealthEstimator,
  shouldDeferEpisodeIdleWork,
  shouldPublishEpisodeNetworkHealth,
} from "./episode-network-health-estimator";

describe("episode network health estimator", () => {
  it("enters limited only while buffering and the transport is busy", () => {
    const estimator = createEpisodeNetworkHealthEstimator({
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
    const estimator = createEpisodeNetworkHealthEstimator({
      minBufferingMs: 100,
      windowMs: 1_000,
    });

    estimator.onTransportSample(sample(0, 0, 0), 0);
    estimator.onTransportSample(sample(100, 10, 1_000), 100);
    estimator.setBuffering(true, 0);

    expect(estimator.evaluate(150).limited).toBe(false);
  });

  it("clears limited after a calm window", () => {
    const estimator = createEpisodeNetworkHealthEstimator({
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

  it("marks throughput plannable once the window holds sustained evidence", () => {
    const estimator = createEpisodeNetworkHealthEstimator();

    estimator.onTransportSample(sample(0, 0, 0), 0);
    expect(estimator.evaluate(50).throughputPlannable).toBe(false);

    // One 8 MiB burst over 400ms of busy time: enough bytes but not
    // sustained — a shaped path bursts far above what it sustains.
    estimator.onTransportSample(sample(400, 350, 8 * 1024 * 1024), 400);
    expect(estimator.evaluate(450).throughputPlannable).toBe(false);

    // 24 MiB with 1.7s of transfer-busy time: sustained observation.
    estimator.onTransportSample(sample(2_100, 2_050, 24 * 1024 * 1024), 2_100);
    expect(estimator.evaluate(2_150).throughputPlannable).toBe(true);
  });

  it("does not plan from a thin window", () => {
    const estimator = createEpisodeNetworkHealthEstimator();

    estimator.onTransportSample(sample(0, 0, 0), 0);
    estimator.onTransportSample(sample(400, 100, 1024 * 1024), 400);

    const health = estimator.evaluate(450);
    expect(health.throughputBytesPerSec).not.toBeNull();
    expect(health.throughputPlannable).toBe(false);
  });

  it("does not plan from a stale window", () => {
    const estimator = createEpisodeNetworkHealthEstimator();

    estimator.onTransportSample(sample(0, 0, 0), 0);
    estimator.onTransportSample(sample(1_800, 1_700, 24 * 1024 * 1024), 1_800);
    expect(estimator.evaluate(1_850).throughputPlannable).toBe(true);

    // Samples stopped 3s ago; the figure now measures the idle gap.
    expect(estimator.evaluate(4_800).throughputPlannable).toBe(false);
  });

  it("treats cache-served reads as planning-grade despite zero wire bytes", () => {
    const estimator = createEpisodeNetworkHealthEstimator();

    estimator.onTransportSample(sample(0, 0, 0, 0), 0);
    estimator.onTransportSample(sample(300, 10, 4_096, 12), 300);

    expect(estimator.evaluate(350).throughputPlannable).toBe(true);
  });

  it("reports transfer-busy throughput undiluted by idle spans", () => {
    const estimator = createEpisodeNetworkHealthEstimator();

    // 24 MiB moved in 1.6s of transfer time, then ~2s of quiet.
    estimator.onTransportSample(sample(0, 0, 0), 0);
    estimator.onTransportSample(sample(1_700, 1_600, 24 * 1024 * 1024), 1_700);

    const health = estimator.evaluate(3_600);
    expect(health.throughputPlannable).toBe(true);
    expect(health.busyThroughputBytesPerSec).toBeCloseTo(
      ((24 * 1024 * 1024) / 1_600) * 1_000,
      0,
    );
    expect(health.throughputBytesPerSec).toBeLessThan(
      health.busyThroughputBytesPerSec ?? 0,
    );
  });
});

describe("episode idle-work network gate", () => {
  it("defers idle work only while network-limited and user-visible work is waiting", () => {
    expect(
      shouldDeferEpisodeIdleWork({
        buffering: true,
        limited: false,
        msSinceSeek: null,
        playPending: false,
      }),
    ).toBe(false);

    expect(
      shouldDeferEpisodeIdleWork({
        buffering: true,
        limited: true,
        msSinceSeek: null,
        playPending: false,
      }),
    ).toBe(true);

    expect(
      shouldDeferEpisodeIdleWork({
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
      shouldPublishEpisodeNetworkHealth(
        {
          busyFraction: 0,
          busyThroughputBytesPerSec: null,
          limited: false,
          throughputBytesPerSec: null,
          throughputPlannable: false,
          updatedAtMs: 0,
        },
        {
          busyFraction: 0.8,
          busyThroughputBytesPerSec: null,
          limited: true,
          throughputBytesPerSec: 100,
          throughputPlannable: false,
          updatedAtMs: 1,
        },
      ),
    ).toBe(true);

    expect(
      shouldPublishEpisodeNetworkHealth(
        {
          busyFraction: 0.8,
          busyThroughputBytesPerSec: null,
          limited: true,
          throughputBytesPerSec: 100,
          throughputPlannable: true,
          updatedAtMs: 1,
        },
        {
          busyFraction: 0.8,
          busyThroughputBytesPerSec: null,
          limited: true,
          throughputBytesPerSec: 108,
          throughputPlannable: true,
          updatedAtMs: 2,
        },
      ),
    ).toBe(false);

    expect(
      shouldPublishEpisodeNetworkHealth(
        {
          busyFraction: 0.8,
          busyThroughputBytesPerSec: null,
          limited: true,
          throughputBytesPerSec: 100,
          throughputPlannable: true,
          updatedAtMs: 1,
        },
        {
          busyFraction: 0.8,
          busyThroughputBytesPerSec: null,
          limited: true,
          throughputBytesPerSec: 130,
          throughputPlannable: true,
          updatedAtMs: 2,
        },
      ),
    ).toBe(true);
  });

  it("publishes material busy-throughput moves even when wall throughput holds still", () => {
    expect(
      shouldPublishEpisodeNetworkHealth(
        {
          busyFraction: 0.8,
          busyThroughputBytesPerSec: 100,
          limited: false,
          throughputBytesPerSec: 100,
          throughputPlannable: true,
          updatedAtMs: 1,
        },
        {
          busyFraction: 0.8,
          busyThroughputBytesPerSec: 130,
          limited: false,
          throughputBytesPerSec: 100,
          throughputPlannable: true,
          updatedAtMs: 2,
        },
      ),
    ).toBe(true);

    expect(
      shouldPublishEpisodeNetworkHealth(
        {
          busyFraction: 0.8,
          busyThroughputBytesPerSec: 100,
          limited: false,
          throughputBytesPerSec: 100,
          throughputPlannable: true,
          updatedAtMs: 1,
        },
        {
          busyFraction: 0.8,
          busyThroughputBytesPerSec: 108,
          limited: false,
          throughputBytesPerSec: 100,
          throughputPlannable: true,
          updatedAtMs: 2,
        },
      ),
    ).toBe(false);
  });

  it("publishes measurement-trust flips even when throughput holds still", () => {
    expect(
      shouldPublishEpisodeNetworkHealth(
        {
          busyFraction: 0.8,
          busyThroughputBytesPerSec: null,
          limited: false,
          throughputBytesPerSec: 100,
          throughputPlannable: false,
          updatedAtMs: 1,
        },
        {
          busyFraction: 0.8,
          busyThroughputBytesPerSec: null,
          limited: false,
          throughputBytesPerSec: 100,
          throughputPlannable: true,
          updatedAtMs: 2,
        },
      ),
    ).toBe(true);
  });

  it("publishes material bandwidth changes before a limited verdict", () => {
    expect(
      shouldPublishEpisodeNetworkHealth(
        {
          busyFraction: 0.1,
          busyThroughputBytesPerSec: null,
          limited: false,
          throughputBytesPerSec: null,
          throughputPlannable: false,
          updatedAtMs: 1,
        },
        {
          busyFraction: 0.2,
          busyThroughputBytesPerSec: null,
          limited: false,
          throughputBytesPerSec: 100,
          throughputPlannable: false,
          updatedAtMs: 2,
        },
      ),
    ).toBe(true);

    expect(
      shouldPublishEpisodeNetworkHealth(
        {
          busyFraction: 0.2,
          busyThroughputBytesPerSec: null,
          limited: false,
          throughputBytesPerSec: 100,
          throughputPlannable: false,
          updatedAtMs: 2,
        },
        {
          busyFraction: 0.2,
          busyThroughputBytesPerSec: null,
          limited: false,
          throughputBytesPerSec: 130,
          throughputPlannable: false,
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
  reads = fetchedBytes > 0 ? 1 : 0,
): LaneTransportSnapshot {
  return {
    lane: "foreground",
    snapshot: {
      busyMs,
      capturedAtMs,
      fetchedBytes,
      reads,
    },
  };
}
