import { describe, expect, it } from "vitest";
import {
  fmtBound,
  formatDisplayValue,
  formatTime,
  formatTimeOfDay,
} from "./timeline-controls-utils";

describe("formatTime", () => {
  it("renders sub-minute values as 0:ss.cs", () => {
    expect(formatTime(0)).toBe("0:00.00");
    expect(formatTime(12.34)).toBe("0:12.34");
    expect(formatTime(59.99)).toBe("0:59.99");
  });

  it("rolls over to whole minutes when t >= 60s", () => {
    expect(formatTime(60)).toBe("1:00.00");
    expect(formatTime(83.45)).toBe("1:23.45");
    expect(formatTime(3725.5)).toBe("62:05.50"); // > 1h is fine, just minutes
  });

  it("pads seconds and centiseconds to two digits", () => {
    expect(formatTime(61.05)).toBe("1:01.05");
  });

  it("clamps non-finite / negative input to zero", () => {
    expect(formatTime(NaN)).toBe("0:00.00");
    expect(formatTime(-5)).toBe("0:00.00");
    expect(formatTime(Infinity)).toBe("0:00.00");
  });
});

describe("formatTimeOfDay", () => {
  it("renders a Date as HH:MM:SS.mmm", () => {
    expect(formatTimeOfDay(new Date("1970-01-01T00:00:10.500Z"))).toBe(
      "00:00:10.500",
    );
  });

  it("renders a sentinel instead of throwing on an out-of-range Date", () => {
    // Date's valid range is ~±8.64e15ms from the epoch.
    expect(formatTimeOfDay(new Date(1e17))).toBe("--:--:--.---");
  });

  it("renders the time-of-day correctly for extended-year (year > 9999) dates", () => {
    // Years outside 0000-9999 make toISOString() emit an extended
    // `±YYYYYY-MM-DD` date portion, shifting where the time substring
    // starts — a fixed slice(11, 23) would grab the wrong characters.
    expect(formatTimeOfDay(new Date(8.64e15))).toBe("00:00:00.000");
  });
});

describe("formatDisplayValue", () => {
  it("formats sequence mode as a #-prefixed frame number", () => {
    expect(formatDisplayValue(5, { kind: "sequence", fps: 12 })).toBe("#5");
    expect(formatDisplayValue(5.9, { kind: "sequence", fps: 12 })).toBe("#6");
  });

  it("formats absolute mode as a wall-clock time", () => {
    expect(
      formatDisplayValue(new Date("1970-01-01T00:00:10.000Z"), {
        kind: "absolute",
        epochAnchorMs: 0,
      }),
    ).toBe("00:00:10.000");
  });

  it("defaults duration mode to formatTime (m:ss.cs)", () => {
    expect(formatDisplayValue(83.45, { kind: "duration" })).toBe("1:23.45");
  });

  it("uses a caller-supplied formatter for duration mode", () => {
    expect(formatDisplayValue(2.5, { kind: "duration" }, fmtBound)).toBe(
      "2.50s",
    );
  });
});
