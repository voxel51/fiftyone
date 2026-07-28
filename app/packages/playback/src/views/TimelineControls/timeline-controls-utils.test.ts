import { describe, expect, it } from "vitest";
import { formatTime } from "./timeline-controls-utils";

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
