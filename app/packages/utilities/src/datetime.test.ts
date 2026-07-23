import { describe, expect, it } from "vitest";

import {
  dateFromDateString,
  dateFromDateTimeString,
  dateOnlyToUTC,
  formatDatePicker,
  formatDateTimePicker,
  serializeDateValue,
  toPickerDate,
} from "./datetime";

// midnight UTC, July 22 2026 — how a `date` field value is stored
const JULY_22_DATE_MS = Date.UTC(2026, 6, 22);

// an arbitrary instant: 2026-07-22T00:30:00Z
const INSTANT_MS = Date.UTC(2026, 6, 22, 0, 30);

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
      datetimeString,
    );

    expect(resultUTC).toBe(1710081045000);
    expect(resultEST).toBe(1710095445000);
  });

  it("handles datetime without seconds in different time zones", () => {
    const datetimeString = "2024-06-15T12:30";
    const resultUTC = dateFromDateTimeString("UTC", datetimeString);
    const resultEst = dateFromDateTimeString(
      "America/New_York",
      datetimeString,
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

describe("formatDatePicker", () => {
  it("formats a UTC timestamp as YYYY-MM-DD string", () => {
    const morning = 1710028800000;
    const afternoon = 1710081000000;
    const night = 1710115200000;

    expect(formatDatePicker(morning)).toBe("2024-03-10");
    expect(formatDatePicker(afternoon)).toBe("2024-03-10");
    expect(formatDatePicker(night)).toBe("2024-03-11");
  });

  it("handles dates with leading zeros in month and day", () => {
    const result = formatDatePicker(936662400000);
    expect(result).toBe("1999-09-07");
  });

  it("uses UTC timezone regardless of local timezone", () => {
    const utcMidnight = 1704067200000;
    const result = formatDatePicker(utcMidnight);
    expect(result).toBe("2024-01-01");
  });
});

describe("toPickerDate", () => {
  it("preserves the UTC calendar date for date fields in any local timezone", () => {
    const picker = toPickerDate("date", JULY_22_DATE_MS, "UTC");
    expect(picker.getFullYear()).toBe(2026);
    expect(picker.getMonth()).toBe(6);
    expect(picker.getDate()).toBe(22);
  });

  it("shows datetime fields as the wall clock in the app timezone", () => {
    // 2026-07-22T00:30Z is 2026-07-21T20:30 in New York (EDT)
    const picker = toPickerDate("datetime", INSTANT_MS, "America/New_York");
    expect(picker.getFullYear()).toBe(2026);
    expect(picker.getMonth()).toBe(6);
    expect(picker.getDate()).toBe(21);
    expect(picker.getHours()).toBe(20);
    expect(picker.getMinutes()).toBe(30);
  });

  it("shows datetime fields as the UTC wall clock for the default timezone", () => {
    const picker = toPickerDate("datetime", INSTANT_MS, "UTC");
    expect(picker.getFullYear()).toBe(2026);
    expect(picker.getMonth()).toBe(6);
    expect(picker.getDate()).toBe(22);
    expect(picker.getHours()).toBe(0);
    expect(picker.getMinutes()).toBe(30);
  });
});

describe("serializeDateValue", () => {
  it("stores date fields at noon UTC of the picked calendar date", () => {
    const picker = toPickerDate("date", JULY_22_DATE_MS, "UTC");
    expect(serializeDateValue("date", picker, "UTC")).toBe(
      "2026-07-22T12:00:00.000Z",
    );
  });

  it("interprets datetime picker values in the app timezone", () => {
    const picker = toPickerDate("datetime", INSTANT_MS, "America/New_York");
    expect(serializeDateValue("datetime", picker, "America/New_York")).toBe(
      new Date(INSTANT_MS).toISOString(),
    );
  });

  it("round-trips datetime values through the picker in UTC", () => {
    const picker = toPickerDate("datetime", INSTANT_MS, "UTC");
    expect(serializeDateValue("datetime", picker, "UTC")).toBe(
      new Date(INSTANT_MS).toISOString(),
    );
  });

  it("throws on an invalid timezone instead of returning null", () => {
    const picker = new Date(INSTANT_MS);
    expect(() => serializeDateValue("datetime", picker, "Not/AZone")).toThrow(
      "invalid date or timezone",
    );
  });
});

describe("dateOnlyToUTC", () => {
  it("keeps the same calendar date when re-parsed", () => {
    const picker = toPickerDate("date", JULY_22_DATE_MS, "UTC");
    const stored = dateOnlyToUTC(picker);
    const roundTripped = toPickerDate(
      "date",
      new Date(stored).getTime(),
      "UTC",
    );
    expect(roundTripped.getDate()).toBe(picker.getDate());
    expect(roundTripped.getMonth()).toBe(picker.getMonth());
    expect(roundTripped.getFullYear()).toBe(picker.getFullYear());
  });
});
