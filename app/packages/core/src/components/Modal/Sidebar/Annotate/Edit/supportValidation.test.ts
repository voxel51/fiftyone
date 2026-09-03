import { describe, expect, it } from "vitest";
import { changedBound, supportError } from "./supportValidation";

describe("supportError", () => {
  it("accepts whole frame numbers with start <= stop", () => {
    expect(supportError(1, 1)).toBeNull();
    expect(supportError(2, 10)).toBeNull();
  });

  it("rejects a stop before the start", () => {
    // the Angio repro: end typed before start persisted a [20, 10] support
    expect(supportError(20, 10)).toBe("start must not be after stop");
  });

  it("rejects a start before frame 1", () => {
    expect(supportError(0, 5)).toBe("start must be at least 1");
    expect(supportError(-3, 5)).toBe("start must be at least 1");
  });

  it("rejects fractional frame numbers", () => {
    expect(supportError(1.5, 3)).toBe("frame numbers must be whole numbers");
    expect(supportError(1, 3.2)).toBe("frame numbers must be whole numbers");
  });
});

describe("changedBound", () => {
  it("names the bound that differs from the current span", () => {
    expect(changedBound({ start: 1, stop: 10 }, { start: 5, stop: 10 })).toBe(
      "start",
    );
    expect(changedBound({ start: 1, stop: 10 }, { start: 1, stop: 3 })).toBe(
      "stop",
    );
  });
});
