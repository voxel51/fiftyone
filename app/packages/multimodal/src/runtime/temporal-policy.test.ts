import { describe, expect, it } from "vitest";

import {
  DEFAULT_OBSERVATION_STALE_THRESHOLD_NS,
  DEFAULT_TRANSFORM_INTERPOLATION_GAP_NS,
  EpisodeCadenceTracker,
  observationStaleThresholdNs,
  recentMedianCadenceNs,
  transformInterpolationGapLimitNs,
} from "./temporal-policy";

const MS = 1_000_000n;
const SECOND = 1_000_000_000n;

describe("cadence-derived temporal policy", () => {
  it("uses startup defaults until three positive intervals are available", () => {
    const timestamps = [0n, 100n, 200n];
    expect(recentMedianCadenceNs(timestamps)).toBeNull();
    expect(transformInterpolationGapLimitNs(timestamps)).toBe(
      DEFAULT_TRANSFORM_INTERPOLATION_GAP_NS,
    );
    expect(observationStaleThresholdNs(timestamps)).toBe(
      DEFAULT_OBSERVATION_STALE_THRESHOLD_NS,
    );
  });

  it("uses the median of positive adjacent intervals", () => {
    expect(recentMedianCadenceNs([400n, 0n, 100n, 100n, 200n, 1_200n])).toBe(
      150n,
    );
  });

  it("applies the transform lower and upper bounds", () => {
    expect(
      transformInterpolationGapLimitNs([0n, 10n * MS, 20n * MS, 30n * MS]),
    ).toBe(100n * MS);
    expect(
      transformInterpolationGapLimitNs([0n, SECOND, 2n * SECOND, 3n * SECOND]),
    ).toBe(2n * SECOND);
  });

  it("applies the observation stale lower and upper bounds", () => {
    expect(
      observationStaleThresholdNs([0n, 10n * MS, 20n * MS, 30n * MS]),
    ).toBe(500n * MS);
    expect(
      observationStaleThresholdNs([0n, 3n * SECOND, 6n * SECOND, 9n * SECOND]),
    ).toBe(5n * SECOND);
  });

  it("keeps a bounded, deduplicated history across out-of-order observations", () => {
    const tracker = new EpisodeCadenceTracker();
    for (let index = 40; index >= 0; index -= 1) {
      tracker.observe(BigInt(index) * 200n * MS);
      tracker.observe(BigInt(index) * 200n * MS);
    }

    expect(tracker.observationStaleThresholdNs()).toBe(600n * MS);
    expect(tracker.interpolationGapLimitNs()).toBe(600n * MS);
    expect(tracker.medianCadenceNs()).toBe(200n * MS);

    tracker.clear();
    expect(tracker.medianCadenceNs()).toBeNull();
    expect(tracker.observationStaleThresholdNs()).toBe(
      DEFAULT_OBSERVATION_STALE_THRESHOLD_NS,
    );
  });
});
