/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";

import { toSyntheticKeypoint } from "./propagationShapes";

const stored = (extra: Record<string, unknown> = {}) => ({
  _id: "kp-1",
  _cls: "Keypoint",
  label: "person",
  points: [
    [0.1, 0.2],
    [NaN, NaN],
  ],
  instance: { _id: "track-1", _cls: "Instance" },
  ...extra,
});

describe("toSyntheticKeypoint", () => {
  // Regression (2026-09-23): an `index: undefined` member rode into every
  // frame propagation filled; JSON drops it, so those frames never compared
  // equal to the server's copy and autosave re-sent them every tick
  it("omits index when the stored label has none", () => {
    expect("index" in toSyntheticKeypoint(stored())).toBe(false);
  });

  it("keeps a stored index", () => {
    expect(toSyntheticKeypoint(stored({ index: 3 })).index).toBe(3);
  });
});
