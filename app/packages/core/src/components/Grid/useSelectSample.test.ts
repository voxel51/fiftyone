import { describe, expect, it } from "vitest";
import { addRange, removeRange } from "./useSelectSample";

describe("range selection tests", () => {
  it("adds a range, and includes selections without an index record", () => {
    const result = addRange(
      2,
      new Set(["0", "other"]),
      new Map([
        ["0", 0],
        ["1", 1],
        ["2", 2],
      ])
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
      ])
    );
    expect(result).toStrictEqual(new Set(["other"]));
  });
});
