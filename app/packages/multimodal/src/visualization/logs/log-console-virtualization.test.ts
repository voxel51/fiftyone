import { describe, expect, it } from "vitest";
import { virtualLogRowRange } from "./log-console-virtualization";

describe("virtualLogRowRange", () => {
  it("calculates an overscanned fixed-height viewport", () => {
    expect(
      virtualLogRowRange({
        overscan: 2,
        rowCount: 1_000,
        rowHeightPx: 30,
        scrollTop: 300,
        viewportHeight: 90,
      }),
    ).toEqual({ endIndex: 15, offsetPx: 240, startIndex: 8 });
  });

  it("clamps a stale scroll offset after the row count shrinks", () => {
    expect(
      virtualLogRowRange({
        overscan: 2,
        rowCount: 10,
        rowHeightPx: 30,
        scrollTop: 30_000,
        viewportHeight: 90,
      }),
    ).toEqual({ endIndex: 10, offsetPx: 210, startIndex: 7 });
  });
});
