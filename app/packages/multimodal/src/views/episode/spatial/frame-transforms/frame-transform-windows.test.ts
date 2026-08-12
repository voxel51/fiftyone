import { describe, expect, it } from "vitest";
import {
  PAUSED_TRANSFORM_PLACEMENT_LOOKAHEAD_NS,
  dynamicPlacementRangeForTime,
  dynamicRunwayCoverageRangeForTime,
  dynamicRunwayExtensionRangeForTime,
  frameTransformRangeKey,
  isRangeInRanges,
  isTimeInRanges,
  transformCoverageEndForTime,
} from "./frame-transform-windows";

describe("frame transform windows", () => {
  it("builds foreground windows with a floored lookback", () => {
    expect(dynamicPlacementRangeForTime(100n)).toEqual({
      endTimeNs: 1_000_000_100n,
      startTimeNs: 0n,
    });
    expect(
      dynamicPlacementRangeForTime(
        1_000_000_000n,
        PAUSED_TRANSFORM_PLACEMENT_LOOKAHEAD_NS,
      ),
    ).toEqual({
      endTimeNs: 1_250_000_000n,
      startTimeNs: 500_000_000n,
    });
  });

  it("extends runway coverage with overlap and target caps", () => {
    expect(
      dynamicRunwayExtensionRangeForTime({
        indexedCoverageEndNs: null,
        timeNs: 1_000_000_000n,
      }),
    ).toEqual({
      endTimeNs: 2_500_000_000n,
      startTimeNs: 1_000_000_000n,
    });
    expect(
      dynamicRunwayExtensionRangeForTime({
        indexedCoverageEndNs: 5_100_000_000n,
        timeNs: 1_000_000_000n,
      }),
    ).toBeNull();
    expect(dynamicRunwayCoverageRangeForTime(1_000_000_000n)).toEqual({
      endTimeNs: 3_000_000_000n,
      startTimeNs: 1_000_000_000n,
    });
  });

  it("combines indexed and in-flight coverage at one time", () => {
    expect(
      transformCoverageEndForTime({
        indexedCoverageEndNs: 20n,
        inFlightRanges: [
          { endTimeNs: 40n, startTimeNs: 10n },
          { endTimeNs: 80n, startTimeNs: 60n },
        ],
        timeNs: 15n,
      }),
    ).toBe(40n);
  });

  it("keeps inclusive time and containment checks explicit", () => {
    const ranges = [{ endTimeNs: 20n, startTimeNs: 10n }];
    expect(isTimeInRanges(ranges, 10n)).toBe(true);
    expect(isTimeInRanges(ranges, 20n)).toBe(true);
    expect(isTimeInRanges(ranges, 21n)).toBe(false);
    expect(isRangeInRanges(ranges, { endTimeNs: 18n, startTimeNs: 12n })).toBe(
      true,
    );
    expect(isRangeInRanges(ranges, { endTimeNs: 21n, startTimeNs: 12n })).toBe(
      false,
    );
    expect(frameTransformRangeKey(ranges[0])).toBe("10:20");
  });
});
