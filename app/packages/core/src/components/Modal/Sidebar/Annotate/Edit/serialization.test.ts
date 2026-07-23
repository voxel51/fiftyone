import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import {
  dateOnlyToUTC,
  parseDatabaseValue,
  serializeDateValue,
  serializeFieldValue,
  toPickerDate,
} from "./serialization";

// midnight UTC, July 22 2026 — how a `date` field value is stored
const JULY_22_DATE_MS = Date.UTC(2026, 6, 22);

// an arbitrary instant: 2026-07-22T00:30:00Z
const INSTANT_MS = Date.UTC(2026, 6, 22, 0, 30);

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

describe("parseDatabaseValue", () => {
  it("converts database date wrappers to picker dates", () => {
    const parsed = parseDatabaseValue(
      "date",
      { _cls: "DateTime", datetime: JULY_22_DATE_MS },
      "UTC",
    );
    expect(parsed).toBeInstanceOf(Date);
    expect((parsed as Date).getDate()).toBe(22);
  });

  it("converts transient ISO strings to picker dates", () => {
    const parsed = parseDatabaseValue(
      "datetime",
      new Date(INSTANT_MS).toISOString(),
      "America/New_York",
    );
    expect(parsed).toBeInstanceOf(Date);
    expect((parsed as Date).getDate()).toBe(21);
    expect((parsed as Date).getHours()).toBe(20);
  });

  it("returns non-date values unchanged", () => {
    expect(parseDatabaseValue("str", "hello", "UTC")).toBe("hello");
    expect(parseDatabaseValue("int", 5, "UTC")).toBe(5);
  });

  it("returns invalid date strings unchanged", () => {
    expect(parseDatabaseValue("datetime", "not a date", "UTC")).toBe(
      "not a date",
    );
  });
});

describe("serializeFieldValue", () => {
  it("round-trips a datetime edit end to end in a non-UTC app timezone", () => {
    const zone = "America/New_York";
    const parsed = parseDatabaseValue(
      "datetime",
      { _cls: "DateTime", datetime: INSTANT_MS },
      zone,
    ) as Date;
    // simulate the user picking a new time on the previous local day
    const picked = new Date(parsed);
    picked.setHours(9, 15, 0, 0);
    const stored = serializeFieldValue(picked, "datetime", zone);
    expect(stored).toBe(
      DateTime.fromObject(
        { year: 2026, month: 7, day: 21, hour: 9, minute: 15 },
        { zone },
      )
        .toUTC()
        .toISO(),
    );
  });

  it("passes non-date primitives through", () => {
    expect(serializeFieldValue(3.14, "float", "UTC")).toBe(3.14);
  });

  it("parses dict fields from JSON strings", () => {
    expect(serializeFieldValue('{"a": 1}', "dict", "UTC")).toEqual({ a: 1 });
  });
});
