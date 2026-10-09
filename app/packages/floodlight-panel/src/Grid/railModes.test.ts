import { describe, expect, it } from "vitest";
import type { Order } from "../order/order";
import { gridRailMode, isRailed } from "./railModes";

const order = (patch: Partial<Order>): Order => ({
  kind: "order",
  token: "t",
  mode: "SMALL",
  total: 1000,
  bounds: null,
  desc: false,
  ticks: [{ fraction: 0.5, label: "501" }],
  ...patch,
});

const loaded = (
  sequences: [string, number][],
  fractions: [string, number][],
) => ({
  sequences: new Map(sequences),
  fractions: new Map(fractions),
});

describe("gridRailMode", () => {
  it("rails a SMALL order over offsets, read as n of N", () => {
    const mode = gridRailMode(order({}), false);
    if (!isRailed(mode)) throw new Error("expected a rail");
    expect(mode.kind).toBe("offset");
    expect(mode.ticks).toEqual([{ position: 0.5, label: "501" }]);
    expect(mode.label(0, 10)).toBe("1 of 1,000");
    expect(mode.label(1, 10)).toBe("991 of 1,000");
    expect(mode.position(0.495, 10)).toBe(0.5);
  });

  it("jumps a SMALL order by page key, in place when loaded, never seeking", () => {
    const mode = gridRailMode(order({ total: 101 }), false);
    if (!isRailed(mode)) throw new Error("expected a rail");
    expect(mode.jump(0.5, 1, loaded([["a", 50]], []), 20)).toEqual({
      anchor: { key: 2, at: { description: "a", fraction: 0 } },
    });
    expect(mode.jump(1, 1, loaded([], []), 20)).toEqual({
      anchor: { key: 5 },
    });
  });

  it("rails an INDEXED order with a scale over values", () => {
    const mode = gridRailMode(
      order({
        mode: "INDEXED",
        total: null,
        bounds: { min: 0, max: 200, scale: "NUMBER" },
        desc: true,
      }),
      false,
    );
    if (!isRailed(mode)) throw new Error("expected a rail");
    expect(mode.kind).toBe("value");
    expect(mode.position(0.3)).toBe(0.3);
    // descending: the top of the grid is the maximum
    expect(mode.label(0)).toBe("200");
    expect(mode.label(0.25)).toBe("150");
  });

  it("seeks an INDEXED order once, unless the target is loaded", () => {
    const mode = gridRailMode(
      order({
        mode: "INDEXED",
        total: null,
        bounds: { min: 0, max: 1, scale: "NUMBER" },
      }),
      false,
    );
    if (!isRailed(mode)) throw new Error("expected a rail");
    expect(mode.jump(0.7, undefined, loaded([], []), 20)).toEqual({
      seek: { fraction: 0.7 },
    });
    const near = loaded(
      [
        ["a", 3],
        ["b", 4],
      ],
      [
        ["a", 0.6],
        ["b", 0.8],
      ],
    );
    expect(mode.jump(0.7, undefined, near, 20)).toEqual({
      anchor: { key: 0, at: { description: "b", fraction: 0 } },
    });
  });

  it("gives a string or boolean sort value jumps only", () => {
    const bounds = { min: "a", max: "z", scale: null };
    expect(
      gridRailMode(order({ mode: "INDEXED", total: null, bounds }), false),
    ).toEqual({ kind: "values", bounds });
  });

  it("gives a SCROLL order, an unordered view and pages no rail", () => {
    expect(gridRailMode(order({ mode: "SCROLL", total: null }), false)).toEqual(
      { kind: "none" },
    );
    expect(gridRailMode({ kind: "unordered" }, false).kind).toBe("none");
    expect(gridRailMode(undefined, false).kind).toBe("none");
    expect(gridRailMode(order({}), true).kind).toBe("none");
  });
});
