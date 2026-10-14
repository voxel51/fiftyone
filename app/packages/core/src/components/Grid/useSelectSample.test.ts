import { describe, expect, it } from "vitest";
import { addRange, removeRange } from "./useSelectSample";

describe("range selection tests", () => {
  it("adds only the clicked sample when all previous locations were evicted", () => {
    expect(
      addRange(20_000, new Set(["old"]), new Map([["new", 20_000]])),
    ).toStrictEqual(new Set(["old", "new"]));
  });

  it("does not capture missing IDs in a partially evicted range", () => {
    expect(
      addRange(
        2,
        new Set(["0"]),
        new Map([
          ["0", 0],
          ["2", 2],
        ]),
      ),
    ).toStrictEqual(new Set(["0", "2"]));
  });

  it("adds a range, and includes selections without an index record", () => {
    const result = addRange(
      2,
      new Set(["0", "other"]),
      new Map([
        ["0", 0],
        ["1", 1],
        ["2", 2],
      ]),
    );
    expect(result).toStrictEqual(new Set(["0", "1", "2", "other"]));
  });

  it("removes a range, and includes selections without an index record", () => {
    const result = removeRange(
      1,
      new Set(["0", "1", "other"]),
      new Map([
        ["0", 0],
        ["1", 1],
      ]),
    );
    expect(result).toStrictEqual(new Set(["other"]));
  });
});
