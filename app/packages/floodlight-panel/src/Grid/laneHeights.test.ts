import { describe, expect, test } from "vitest";
import {
  clampLaneHeight,
  fieldLaneKey,
  groupLaneKey,
  laneHeight,
  MAX_LANE_HEIGHT,
  MIN_LANE_HEIGHT,
  rowAspectOverride,
  setLaneHeight,
  withRowAspects,
} from "./laneHeights";

type Item = { aspectRatio: number; group?: string };

const page = (items: Item[]) => ({ items, next: null, previous: null });

describe("laneHeights", () => {
  test("clamps and rounds heights", () => {
    expect(clampLaneHeight(10)).toBe(MIN_LANE_HEIGHT);
    expect(clampLaneHeight(5000)).toBe(MAX_LANE_HEIGHT);
    expect(clampLaneHeight(120.6)).toBe(121);
  });

  test("keys lanes by group id, or by field path and value", () => {
    expect(groupLaneKey("g1")).toBe("group:g1");
    expect(fieldLaneKey("ground_truth.label", "cat")).toBe(
      'lane:ground_truth.label:"cat"',
    );
    expect(fieldLaneKey("flag", true)).toBe("lane:flag:true");
    expect(fieldLaneKey("flag", null)).toBe("lane:flag:null");
    expect(fieldLaneKey("tag", "true")).not.toBe(fieldLaneKey("tag", true));
  });

  test("sets a clamped height and resets to the default", () => {
    const set = setLaneHeight({}, "group:a", 20);
    expect(set).toEqual({ "group:a": MIN_LANE_HEIGHT });
    expect(laneHeight(set, "group:a", 200)).toBe(MIN_LANE_HEIGHT);

    const reset = setLaneHeight({ ...set, "group:b": 300 }, "group:a");
    expect(reset).toEqual({ "group:b": 300 });
    expect(laneHeight(reset, "group:a", 200)).toBe(200);
  });

  test("returns the same heights when nothing changes", () => {
    const heights = { "group:a": 300 };
    expect(setLaneHeight(heights, "group:a", 300)).toBe(heights);
    expect(setLaneHeight(heights, "group:b")).toBe(heights);
  });

  test("overrides only rows of groups with a custom height", () => {
    const heights = { "group:tall": 400, "lane:x:1": 100 };
    const override = rowAspectOverride<Item>(heights, 1028, (i) => i.group)!;

    // 1028 wide less the 28px scrollbar gutters
    expect(override({ aspectRatio: 3, group: "tall" })).toBe(2.5);
    expect(override({ aspectRatio: 3, group: "other" })).toBe(undefined);
    expect(override({ aspectRatio: 3 })).toBe(undefined);
  });

  test("leaves pages untouched without custom group heights", () => {
    expect(rowAspectOverride<Item>({}, 1028, (i) => i.group)).toBe(undefined);
    expect(
      rowAspectOverride<Item>({ "lane:x:1": 100 }, 1028, (i) => i.group),
    ).toBe(undefined);

    const original = page([{ aspectRatio: 3, group: "a" }]);
    expect(withRowAspects(original, undefined)).toBe(original);
    const none = rowAspectOverride<Item>(
      { "group:b": 200 },
      1028,
      (i) => i.group,
    );
    expect(withRowAspects(original, none)).toBe(original);
  });

  test("applies the override per item", () => {
    const override = rowAspectOverride<Item>(
      { "group:b": 500 },
      1028,
      (i) => i.group,
    );
    const a = { aspectRatio: 3, group: "a" };
    const result = withRowAspects(
      page([a, { aspectRatio: 3, group: "b" }]),
      override,
    );

    expect(result.items).toEqual([a, { aspectRatio: 2, group: "b" }]);
    expect(result.items[0]).toBe(a);
  });
});
