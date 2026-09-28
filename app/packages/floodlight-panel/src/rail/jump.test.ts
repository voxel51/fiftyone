import { describe, expect, it } from "vitest";
import { jumpAnchor, offsetRanks } from "./jump";
import { jumpTarget } from "./model";

describe("jumpAnchor", () => {
  const ranks = new Map([
    ["a", 40],
    ["b", 41],
    ["c", 42],
  ]);

  it("starts at the target item when it is loaded", () => {
    expect(jumpAnchor({ rank: 41, key: 2 }, ranks)).toEqual({
      key: 2,
      at: { description: "b", fraction: 0 },
    });
  });

  it("starts at the top of the target page otherwise", () => {
    expect(jumpAnchor({ rank: 500, key: 25 }, ranks)).toEqual({ key: 25 });
  });

  it("composes with a drag position", () => {
    const target = jumpTarget(42 / 99, 100, 20);
    expect(target).toEqual({ rank: 42, key: 2 });
    expect(jumpAnchor(target, ranks)).toEqual({
      key: 2,
      at: { description: "c", fraction: 0 },
    });
  });
});

describe("offsetRanks", () => {
  const records = new Map([
    ["a", 5],
    ["b", 100],
    ["c", 142],
    ["d", 200],
  ]);
  const lane = offsetRanks(records, 100, 100);

  it("reads only the lane's records, as ranks", () => {
    expect(lane.get("b")).toBe(0);
    expect(lane.get("c")).toBe(42);
    expect(lane.get("a")).toBe(undefined);
    expect(lane.get("d")).toBe(undefined);
    expect([...lane]).toEqual([
      ["b", 0],
      ["c", 42],
    ]);
  });

  it("anchors a jump within the lane", () => {
    expect(jumpAnchor({ rank: 42, key: 2 }, lane)).toEqual({
      key: 2,
      at: { description: "c", fraction: 0 },
    });
  });
});
