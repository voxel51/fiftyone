import { describe, expect, it } from "vitest";
import {
  clampOffset,
  compactCount,
  groupDigits,
  labelTicks,
  nearestTick,
  positionToOffset,
  railMode,
  offsetLabel,
  offsetTicks,
  offsetToPosition,
  extentVisible,
  thumbPosition,
  thumbSpan,
  thumbTop,
} from "./model";

describe("offset and position", () => {
  it("maps the first and last offsets to the ends of the track", () => {
    expect(offsetToPosition(0, 101)).toBe(0);
    expect(offsetToPosition(100, 101)).toBe(1);
    expect(offsetToPosition(25, 101)).toBe(0.25);
  });

  it("round-trips every offset", () => {
    const total = 37;
    for (let offset = 0; offset < total; offset++) {
      expect(positionToOffset(offsetToPosition(offset, total), total)).toBe(
        offset,
      );
    }
  });

  it("clamps out-of-range offsets and positions", () => {
    expect(clampOffset(-4, 10)).toBe(0);
    expect(clampOffset(12, 10)).toBe(9);
    expect(clampOffset(3.6, 10)).toBe(4);
    expect(positionToOffset(-0.5, 10)).toBe(0);
    expect(positionToOffset(1.5, 10)).toBe(9);
    expect(offsetToPosition(50, 10)).toBe(1);
  });

  it("puts everything at the start of an empty or single-item order", () => {
    expect(offsetToPosition(0, 0)).toBe(0);
    expect(positionToOffset(0.7, 0)).toBe(0);
    expect(offsetToPosition(0, 1)).toBe(0);
    expect(positionToOffset(0.7, 1)).toBe(0);
  });
});

describe("thumbPosition", () => {
  it("reads the anchor's offset", () => {
    expect(thumbPosition(50, 201)).toBe(0.25);
  });

  it("rests at the start without an anchor", () => {
    expect(thumbPosition(undefined, 201)).toBe(0);
  });
});

describe("labels", () => {
  it("formats counts", () => {
    expect(groupDigits(1234567)).toBe("1,234,567");
    expect(groupDigits(999)).toBe("999");
    expect(compactCount(999)).toBe("999");
    expect(compactCount(1000)).toBe("1k");
    expect(compactCount(12345)).toBe("12.3k");
    expect(compactCount(4_500_000)).toBe("4.5M");
    expect(compactCount(2_000_000_000)).toBe("2B");
  });

  it("reads offsets 1-based", () => {
    expect(offsetLabel(0, 12000)).toBe("1 of 12,000");
    expect(offsetLabel(11999, 12000)).toBe("12,000 of 12,000");
    expect(offsetLabel(20000, 12000)).toBe("12,000 of 12,000");
  });

  it("spaces offset ticks evenly", () => {
    expect(offsetTicks(1001, 5)).toEqual([
      { position: 0, label: "1" },
      { position: 0.25, label: "251" },
      { position: 0.5, label: "501" },
      { position: 0.75, label: "751" },
      { position: 1, label: "1k" },
    ]);
    expect(offsetTicks(1, 5)).toEqual([{ position: 0, label: "1" }]);
    expect(offsetTicks(0, 5)).toEqual([]);
  });

  it("shows a tied block once", () => {
    const values = [
      { offset: 0, label: "1" },
      { offset: 20, label: "1M" },
      { offset: 40, label: "1M" },
      { offset: 60, label: "1M" },
      { offset: 80, label: "2M" },
    ];
    expect(labelTicks(values, 101, 10)).toEqual([
      { position: 0, label: "1" },
      { position: 0.2, label: "1M" },
      { position: 0.8, label: "2M" },
    ]);
  });

  it("subsamples label ticks to the maximum", () => {
    const values = Array.from({ length: 10 }, (_, i) => ({
      offset: i * 10,
      label: String(i),
    }));
    expect(labelTicks(values, 91, 4).map(({ label }) => label)).toEqual([
      "0",
      "2",
      "5",
      "7",
    ]);
  });
});

describe("thumb span", () => {
  it("sizes the thumb as the viewport over the estimated full height", () => {
    // 40 items fill 2,000px, so 1,000 items would be 50,000px tall
    const visible = extentVisible({ items: 40, loaded: 2000, viewport: 600 });
    expect(visible).toBe(12);
    expect(thumbSpan(visible, 1000, 0)).toBe(0.012);
  });

  it("has no size before anything is loaded", () => {
    expect(extentVisible({ items: 0, loaded: 0, viewport: 600 })).toBe(
      undefined,
    );
  });

  it("spans the visible share of the order, at least the minimum", () => {
    expect(thumbSpan(50, 200, 0.02)).toBe(0.25);
    expect(thumbSpan(1, 100000, 0.02)).toBe(0.02);
    expect(thumbSpan(500, 200, 0.02)).toBe(1);
    expect(thumbSpan(undefined, 200, 0.02)).toBe(0.02);
    expect(thumbSpan(50, 0, 0.02)).toBe(0.02);
  });

  it("keeps the thumb on the track", () => {
    expect(thumbTop(0, 0.25)).toBe(0);
    expect(thumbTop(1, 0.25)).toBe(0.75);
    expect(thumbTop(0.5, 0.5)).toBe(0.25);
    expect(thumbTop(1.4, 0.25)).toBe(0.75);
  });
});

describe("rail state", () => {
  it("labels only while hovered or dragged", () => {
    const off = { dragging: false, hovered: false, scrolling: false };
    expect(railMode(off)).toBe("idle");
    expect(railMode({ ...off, scrolling: true })).toBe("awake");
    expect(railMode({ ...off, hovered: true })).toBe("active");
    expect(railMode({ ...off, dragging: true, scrolling: true })).toBe(
      "active",
    );
  });

  it("finds the nearest marker", () => {
    const ticks = offsetTicks(101, 5);
    expect(nearestTick(ticks, 0.1)).toBe(0);
    expect(nearestTick(ticks, 0.4)).toBe(2);
    expect(nearestTick(ticks, 0.99)).toBe(4);
    expect(nearestTick([], 0.5)).toBe(-1);
  });
});

describe("thumbPosition with items on screen", () => {
  it("reaches the end when the last screen is in view", () => {
    expect(thumbPosition(90, 100, 10)).toBe(1);
    expect(thumbPosition(45, 100, 10)).toBe(0.5);
  });

  it("lands a jump where the thumb would sit", () => {
    expect(positionToOffset(1, 100, 10)).toBe(90);
    expect(thumbPosition(positionToOffset(0.5, 100, 10), 100, 10)).toBe(0.5);
  });
});
