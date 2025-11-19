import { describe, expect, it } from "vitest";

import {
  dateFromDateString,
  dateFromDateTimeString,
  formatDateTimePicker,
} from "./datetime";

describe("dateFromDateString", () => {
  it("returns the UTC timestamp for a valid date string", () => {
    const result = dateFromDateString("2024-03-10");
    expect(result).toBe(1710028800000);
  });

  it("handles leading zeros in month and day values", () => {
    const result = dateFromDateString("1999-09-07");
    expect(result).toBe(936662400000);
  });
});

describe("dateFromDateTimeString", () => {
  it("returns the correct timestamp for a datetime string with seconds in UTC", () => {
    const result = dateFromDateTimeString("UTC", "2024-03-10T14:30:45");
    expect(result).toBe(1710081045000);
  });

  it("returns the correct timestamp for a datetime string without seconds in UTC", () => {
    const result = dateFromDateTimeString("UTC", "2024-03-10T14:30");
    expect(result).toBe(1710081000000);
  });

  it("handles different time zones correctly", () => {
    const datetimeString = "2024-03-10T14:30:45";
    const resultUTC = dateFromDateTimeString("UTC", datetimeString);
    const resultEST = dateFromDateTimeString(
      "America/New_York",
      datetimeString
    );

    expect(resultUTC).toBe(1710081045000);
    expect(resultEST).toBe(1710095445000);
  });

  it("handles datetime without seconds in different time zones", () => {
    const datetimeString = "2024-06-15T12:30";
    const resultUTC = dateFromDateTimeString("UTC", datetimeString);
    const resultEst = dateFromDateTimeString(
      "America/New_York",
      datetimeString
    );

    expect(resultEst).toBe(1718469000000);
    expect(resultUTC).toBe(1718454600000);
  });

  it("handles leading zeros in date and time values", () => {
    const result = dateFromDateTimeString("UTC", "1999-09-07T05:03:02");
    expect(result).toBe(936680582000);
  });
});

describe("formatDateTimePicker", () => {
  it("formats a UTC datetime string correctly", () => {
    const result = formatDateTimePicker("UTC", 1718469000000);
    expect(result).toBe("2024-06-15T16:30:00");
  });
});
