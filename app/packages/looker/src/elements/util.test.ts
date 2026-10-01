/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { getFrameNumber, getTime } from "./util";

describe("getFrameNumber", () => {
  it("reads a time on a frame's start as that frame", () => {
    const step = 1 / 15;
    for (let k = 0; k < 93; k++) {
      expect(getFrameNumber(k * step, 93 * step, 15)).toBe(k + 1);
    }
  });

  it("keeps a mid-frame time in its frame", () => {
    expect(getFrameNumber(31.5 / 15, 93 / 15, 15)).toBe(32);
  });

  it("reads the exact end of the video as the last frame", () => {
    expect(getFrameNumber(93 / 15, 93 / 15, 15)).toBe(93);
  });

  it("round-trips with getTime", () => {
    for (let frame = 1; frame <= 93; frame++) {
      expect(getFrameNumber(getTime(frame, 15), 93 / 15, 15)).toBe(frame);
    }
  });
});
