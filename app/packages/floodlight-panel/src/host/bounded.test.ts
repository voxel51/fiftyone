import { describe, expect, it } from "vitest";
import { BoundedMap } from "./bounded";

describe("BoundedMap", () => {
  it("never holds more than its limit, dropping the least recently set", () => {
    const map = new BoundedMap<number, number>(100);
    for (let i = 0; i < 10_000; i++) {
      map.set(i, i);
      expect(map.size).toBeLessThanOrEqual(100);
    }
    expect(map.has(9_899)).toBe(false);
    expect(map.get(9_900)).toBe(9_900);
  });

  it("setting a key again makes it the most recent", () => {
    const map = new BoundedMap<string, number>(2);
    map.set("a", 1).set("b", 2).set("a", 3).set("c", 4);
    expect([...map.keys()]).toEqual(["a", "c"]);
  });
});
