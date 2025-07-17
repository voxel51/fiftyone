import { describe, expect, it } from "vitest";
import { helperFunction } from "./numeric";

describe("helperFunction tests", () => {
  it("handles start or end", () => {
    expect(helperFunction(-1, false, 0, null)).toBe(false);
    expect(helperFunction(1, false, 0, null)).toBe(true);

    expect(helperFunction(-1, false, null, 0)).toBe(true);
    expect(helperFunction(1, false, null, 0)).toBe(false);
  });

  it("handles start and end", () => {
    expect(helperFunction(0.5, false, 0, 1)).toBe(true);
    expect(helperFunction(1.5, false, 0, 1)).toBe(false);
  });

  it("handles datetime", () => {
    expect(
      helperFunction({ _cls: "DateTime", datetime: 0.5 }, false, 0, 1)
    ).toBe(true);
    expect(
      helperFunction({ _cls: "DateTime", datetime: 1.5 }, false, 0, 1)
    ).toBe(false);
  });
});
