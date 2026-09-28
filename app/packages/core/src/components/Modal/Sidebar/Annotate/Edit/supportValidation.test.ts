import { describe, expect, it } from "vitest";
import { changedBound, supportError, supportIssue } from "./supportValidation";

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

describe("supportError with a frame count", () => {
  it("accepts a stop on the last frame", () => {
    expect(supportError(1, 120, 120)).toBeNull();
  });

  it("rejects a stop past the last frame", () => {
    expect(supportError(1, 121, 120)).toBe("stop must be at most 120");
  });

  it("ignores an unknown frame count", () => {
    expect(supportError(1, 10_000, null)).toBeNull();
    expect(supportError(1, 10_000, undefined)).toBeNull();
    expect(supportError(1, 10_000, 0)).toBeNull();
  });

  it("reports the ordering error before the bound", () => {
    expect(supportError(130, 125, 120)).toBe("start must not be after stop");
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

describe("supportIssue", () => {
  it("returns null for a valid edit", () => {
    expect(supportIssue({ start: 1, stop: 10 }, { start: 2, stop: 10 })).toBe(
      null,
    );
  });

  it("places the message under the bound edited after an invalid edit", () => {
    // stored [5, 30]; stop typed as 3 leaves [5, 3] on screen
    expect(supportIssue({ start: 5, stop: 30 }, { start: 5, stop: 3 })).toEqual(
      { bound: "stop", message: "start must not be after stop" },
    );

    // the form then sends the full snapshot [4, 3] for a start edit
    expect(supportIssue({ start: 5, stop: 3 }, { start: 4, stop: 3 })).toEqual({
      bound: "start",
      message: "start must not be after stop",
    });
  });

  it("places a past-the-end stop under the stop bound", () => {
    expect(
      supportIssue({ start: 5, stop: 30 }, { start: 5, stop: 200 }, 120),
    ).toEqual({ bound: "stop", message: "stop must be at most 120" });
  });
});
