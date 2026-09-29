/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";
import { containIn, flyOpen } from "./flyOpen";

describe("containIn", () => {
  it("fits a wide tile to the box's width, centered", () => {
    expect(containIn({ left: 0, top: 0, width: 400, height: 400 }, 2)).toEqual({
      left: 0,
      top: 100,
      width: 400,
      height: 200,
    });
  });

  it("fits a tall tile to the box's height, centered", () => {
    expect(
      containIn({ left: 10, top: 20, width: 400, height: 200 }, 0.5),
    ).toEqual({ left: 160, top: 20, width: 100, height: 200 });
  });
});

describe("flyOpen", () => {
  it("opens without a ghost when there is no tile", () => {
    const open = vi.fn(() => "opened");
    expect(flyOpen(null, open)).toBe("opened");
    expect(open).toHaveBeenCalledTimes(1);
    expect(document.body.children).toHaveLength(0);
  });
});
