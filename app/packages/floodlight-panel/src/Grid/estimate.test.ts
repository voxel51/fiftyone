import { describe, expect, it } from "vitest";
import { estimateBytes, estimateRowAspect } from "./estimate";

const VIEWPORT = { budget: 5e8, height: 900, width: 1600 };

const videos = (width: number, height: number, count = 20) =>
  Array.from({ length: count }, () => ({
    aspectRatio: width / height,
    bytes: estimateBytes({
      metadata: { frame_width: width, frame_height: height },
    }),
  }));

describe("estimateBytes", () => {
  it("is one RGBA frame of the media", () => {
    expect(estimateBytes({ metadata: { width: 10, height: 20 } })).toBe(800);
    expect(
      estimateBytes({ metadata: { frame_width: 10, frame_height: 20 } }),
    ).toBe(800);
  });

  it("is unknown without media dimensions", () => {
    expect(estimateBytes({ metadata: null })).toBeUndefined();
    expect(estimateBytes(undefined)).toBeUndefined();
  });
});

describe("estimateRowAspect", () => {
  it("starts large items at a smaller zoom than the setting", () => {
    const start = estimateRowAspect({
      ...VIEWPORT,
      items: videos(3840, 2160),
      rowAspect: 10,
    });
    expect(start).toBeLessThan(10);
    expect(start).toBeGreaterThanOrEqual(1);
    expect(start % 0.5).toBe(0);
  });

  it("narrows further as items grow", () => {
    const hd = estimateRowAspect({
      ...VIEWPORT,
      items: videos(1920, 1080),
      rowAspect: 10,
    });
    const uhd = estimateRowAspect({
      ...VIEWPORT,
      items: videos(3840, 2160),
      rowAspect: 10,
    });
    expect(uhd).toBeLessThan(hd);
  });

  it("keeps the setting when small items fit", () => {
    expect(
      estimateRowAspect({
        ...VIEWPORT,
        items: videos(320, 240),
        rowAspect: 10,
      }),
    ).toBe(10);
  });

  it("keeps the setting without metadata", () => {
    expect(
      estimateRowAspect({
        ...VIEWPORT,
        items: [{ aspectRatio: 1 }, { aspectRatio: 2 }],
        rowAspect: 10,
      }),
    ).toBe(10);
  });
});
