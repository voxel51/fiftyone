import { describe, expect, it } from "vitest";
import { getDateTimeRangeFormattersWithPrecision } from "./generic";

describe("getDateTimeRangeFormattersWithPrecision", () => {
  it("returns common formatter with date and diff formatter with time when dates are on same day", () => {
    const d1 = new Date("2024-03-10T10:00:00.000Z").getTime();
    const d2 = new Date("2024-03-10T15:30:45.123Z").getTime();

    const result = getDateTimeRangeFormattersWithPrecision("UTC", d1, d2);

    expect(result.common).not.toBeNull();
    expect(result.diff).toBeDefined();

    const commonFormatted = result.common?.format(d1);
    expect(commonFormatted).toContain("2024-03-10");

    const diffFormatted1 = result.diff.format(d1);
    const diffFormatted2 = result.diff.format(d2);
    expect(diffFormatted1).toContain("10:00:00.000");
    expect(diffFormatted2).toContain("15:30:45.123");
  });

  it("returns null for common and full datetime for diff when dates are on different days", () => {
    const d1 = new Date("2024-03-10T10:00:00.000Z").getTime();
    const d2 = new Date("2024-03-11T15:30:45.123Z").getTime();

    const result = getDateTimeRangeFormattersWithPrecision("UTC", d1, d2);

    expect(result.common).toBeNull();
    expect(result.diff).toBeDefined();

    const diffFormatted1 = result.diff.format(d1);
    const diffFormatted2 = result.diff.format(d2);

    expect(diffFormatted1).toContain("2024-03-10, 10:00:00.000");
    expect(diffFormatted2).toContain("2024-03-11, 15:30:45.123");
  });
});
