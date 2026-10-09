import { describe, expect, it } from "vitest";
import {
  clampRank,
  compactCount,
  groupDigits,
  jumpTarget,
  labelAt,
  labelTicks,
  nearestTick,
  positionToRank,
  railMode,
  rankLabel,
  rankTicks,
  rankToPosition,
  extentVisible,
  thumbPosition,
  thumbSpan,
  thumbTop,
} from "./model";

describe("rank and position", () => {
  it("maps the first and last ranks to the ends of the track", () => {
    expect(rankToPosition(0, 101)).toBe(0);
    expect(rankToPosition(100, 101)).toBe(1);
    expect(rankToPosition(25, 101)).toBe(0.25);
  });

  it("round-trips every rank", () => {
    const total = 37;
    for (let rank = 0; rank < total; rank++) {
      expect(positionToRank(rankToPosition(rank, total), total)).toBe(rank);
    }
  });

  it("clamps out-of-range ranks and positions", () => {
    expect(clampRank(-4, 10)).toBe(0);
    expect(clampRank(12, 10)).toBe(9);
    expect(clampRank(3.6, 10)).toBe(4);
    expect(positionToRank(-0.5, 10)).toBe(0);
    expect(positionToRank(1.5, 10)).toBe(9);
    expect(rankToPosition(50, 10)).toBe(1);
  });

  it("puts everything at the start of an empty or single-item order", () => {
    expect(rankToPosition(0, 0)).toBe(0);
    expect(positionToRank(0.7, 0)).toBe(0);
    expect(rankToPosition(0, 1)).toBe(0);
    expect(positionToRank(0.7, 1)).toBe(0);
  });
});

describe("thumbPosition", () => {
  it("reads the anchor's rank", () => {
    expect(thumbPosition(50, 201)).toBe(0.25);
  });

  it("rests at the start without an anchor", () => {
    expect(thumbPosition(undefined, 201)).toBe(0);
  });
});

describe("jumpTarget", () => {
  it("targets the page holding the rank", () => {
    expect(jumpTarget(0.5, 1001, 20)).toEqual({ rank: 500, key: 25 });
    expect(jumpTarget(0.5, 1000, 20)).toEqual({ rank: 500, key: 25 });
    expect(jumpTarget(0, 1000, 20)).toEqual({ rank: 0, key: 0 });
    expect(jumpTarget(1, 1000, 20)).toEqual({ rank: 999, key: 49 });
  });

  it("lands on a page boundary exactly", () => {
    expect(jumpTarget(19 / 99, 100, 20)).toEqual({ rank: 19, key: 0 });
    expect(jumpTarget(20 / 99, 100, 20)).toEqual({ rank: 20, key: 1 });
  });

  it("clamps a drag past either end", () => {
    expect(jumpTarget(-0.2, 1000, 20)).toEqual({ rank: 0, key: 0 });
    expect(jumpTarget(1.3, 1000, 20)).toEqual({ rank: 999, key: 49 });
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

  it("reads ranks 1-based", () => {
    expect(rankLabel(0, 12000)).toBe("#1 of 12,000");
    expect(rankLabel(11999, 12000)).toBe("#12,000 of 12,000");
    expect(rankLabel(20000, 12000)).toBe("#12,000 of 12,000");
  });

  it("spaces rank ticks evenly", () => {
    expect(rankTicks(1001, 5)).toEqual([
      { position: 0, label: "1" },
      { position: 0.25, label: "251" },
      { position: 0.5, label: "501" },
      { position: 0.75, label: "751" },
      { position: 1, label: "1k" },
    ]);
    expect(rankTicks(1, 5)).toEqual([{ position: 0, label: "1" }]);
    expect(rankTicks(0, 5)).toEqual([]);
  });

  it("shows a tied block once", () => {
    const values = [
      { rank: 0, label: "1" },
      { rank: 20, label: "1M" },
      { rank: 40, label: "1M" },
      { rank: 60, label: "1M" },
      { rank: 80, label: "2M" },
    ];
    expect(labelTicks(values, 101, 10)).toEqual([
      { position: 0, label: "1" },
      { position: 0.2, label: "1M" },
      { position: 0.8, label: "2M" },
    ]);
  });

  it("subsamples label ticks to the maximum", () => {
    const values = Array.from({ length: 10 }, (_, i) => ({
      rank: i * 10,
      label: String(i),
    }));
    expect(labelTicks(values, 91, 4).map(({ label }) => label)).toEqual([
      "0",
      "2",
      "5",
      "7",
    ]);
  });

  it("finds the label at or before a rank", () => {
    const values = [
      { rank: 0, label: "a" },
      { rank: 20, label: "b" },
      { rank: 40, label: "c" },
    ];
    expect(labelAt(values, 0)).toBe("a");
    expect(labelAt(values, 19)).toBe("a");
    expect(labelAt(values, 20)).toBe("b");
    expect(labelAt(values, 99)).toBe("c");
    expect(labelAt([], 5)).toBe(undefined);
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
    const ticks = rankTicks(101, 5);
    expect(nearestTick(ticks, 0.1)).toBe(0);
    expect(nearestTick(ticks, 0.4)).toBe(2);
    expect(nearestTick(ticks, 0.99)).toBe(4);
    expect(nearestTick([], 0.5)).toBe(-1);
  });
});
