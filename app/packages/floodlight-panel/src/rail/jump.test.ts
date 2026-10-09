import { describe, expect, it } from "vitest";
import { fractionJump, laneOffsets, offsetAnchor } from "./jump";
import { positionToOffset } from "./model";

describe("offsetAnchor", () => {
  const offsets = new Map([
    ["a", 40],
    ["b", 41],
    ["c", 42],
  ]);

  it("starts at the target item when it is loaded", () => {
    expect(offsetAnchor(41, 20, offsets)).toEqual({
      key: 2,
      at: { description: "b", fraction: 0 },
    });
  });

  it("starts at the top of the target page otherwise", () => {
    expect(offsetAnchor(500, 20, offsets)).toEqual({ key: 25 });
  });

  it("composes with a drag position", () => {
    const offset = positionToOffset(42 / 99, 100);
    expect(offsetAnchor(offset, 20, offsets)).toEqual({
      key: 2,
      at: { description: "c", fraction: 0 },
    });
  });
});

describe("fractionJump", () => {
  const sequences = new Map([
    ["a", -2],
    ["b", -1],
    ["c", 0],
    ["d", 21],
  ]);
  const fractions = new Map([
    ["a", 0.3],
    ["b", 0.4],
    ["c", 0.5],
    ["d", 0.9],
  ]);

  it("jumps in place when the loaded items run across the target", () => {
    expect(fractionJump(0.45, 20, sequences, fractions)).toEqual({
      anchor: { key: 0, at: { description: "c", fraction: 0 } },
    });
    expect(fractionJump(0.35, 20, sequences, fractions)).toEqual({
      anchor: { key: -1, at: { description: "b", fraction: 0 } },
    });
  });

  it("seeks once where the loaded items have a gap", () => {
    expect(fractionJump(0.7, 20, sequences, fractions)).toEqual({
      seek: { fraction: 0.7 },
    });
  });

  it("seeks once outside what is loaded", () => {
    expect(fractionJump(0.1, 20, sequences, fractions)).toEqual({
      seek: { fraction: 0.1 },
    });
    expect(fractionJump(0.95, 20, sequences, fractions)).toEqual({
      seek: { fraction: 0.95 },
    });
  });
});

describe("laneOffsets", () => {
  const records = new Map([
    ["a", 5],
    ["b", 100],
    ["c", 142],
    ["d", 200],
  ]);
  const lane = laneOffsets(records, 100, 100);

  it("reads only the lane's records, as offsets", () => {
    expect(lane.get("b")).toBe(0);
    expect(lane.get("c")).toBe(42);
    expect(lane.get("a")).toBe(undefined);
    expect(lane.get("d")).toBe(undefined);
    expect([...lane]).toEqual([
      ["b", 0],
      ["c", 42],
    ]);
  });
});
