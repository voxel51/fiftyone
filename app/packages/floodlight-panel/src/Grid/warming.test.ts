import { describe, expect, it } from "vitest";
import { warmKeys } from "./warming";

const linked = (key: number) => ({ next: key + 1, previous: key - 1 });

describe("warmKeys", () => {
  it("warms the page before a seek page first, then the one after", () => {
    expect(warmKeys(0, 0, linked(0), "INDEXED")).toEqual([-1, 1]);
    expect(warmKeys(4, 4, linked(4), "SMALL")).toEqual([3, 5]);
  });

  it("warms one page ahead in the direction the instance moved", () => {
    expect(warmKeys(2, 0, linked(2), "INDEXED")).toEqual([3]);
    expect(warmKeys(-2, 0, linked(-2), "INDEXED")).toEqual([-3]);
    expect(warmKeys(1, 4, linked(1), "SMALL")).toEqual([0]);
  });

  it("warms only forward in an order that only scrolls, or a skip-paged view", () => {
    expect(warmKeys(0, 0, linked(0), "SCROLL")).toEqual([1]);
    expect(warmKeys(3, 5, linked(3), "SCROLL")).toEqual([]);
    expect(warmKeys(0, 0, linked(0), undefined)).toEqual([1]);
  });

  it("warms nothing past an end", () => {
    expect(warmKeys(0, 0, { next: null, previous: null }, "SMALL")).toEqual([]);
  });
});
