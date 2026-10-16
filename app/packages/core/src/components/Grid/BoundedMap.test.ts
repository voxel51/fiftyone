import { describe, expect, it } from "vitest";
import BoundedMap from "./BoundedMap";

describe("bounded navigation cache", () => {
  it("bounds visited entries and refreshes entries that are fetched again", () => {
    const records = new BoundedMap<string, number>(100);
    for (let i = 0; i < 1_000_000; i++) records.set(String(i), i);
    expect(records.size).toBe(100);
    expect(records.has("0")).toBe(false);
    records.set("999900", 999900);
    records.set("1000000", 1000000);
    expect(records.has("999900")).toBe(true);
    expect(records.has("999901")).toBe(false);
  });
});
