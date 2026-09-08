import { describe, expect, it } from "vitest";
import { parseDatabaseValue, serializeFieldValue } from "./serialization";

// an arbitrary instant: 2026-07-22T00:30:00Z
const INSTANT_MS = Date.UTC(2026, 6, 22, 0, 30);

describe("parseDatabaseValue", () => {
  it("converts database date wrappers to ISO instant strings", () => {
    const parsed = parseDatabaseValue({
      _cls: "DateTime",
      datetime: INSTANT_MS,
    });
    expect(parsed).toBe(new Date(INSTANT_MS).toISOString());
  });

  it("returns non-date values unchanged", () => {
    expect(parseDatabaseValue("hello")).toBe("hello");
    expect(parseDatabaseValue(5)).toBe(5);
  });

  it("returns transient ISO strings unchanged", () => {
    const iso = new Date(INSTANT_MS).toISOString();
    expect(parseDatabaseValue(iso)).toBe(iso);
  });
});

describe("serializeFieldValue", () => {
  it("passes non-dict primitives through", () => {
    expect(serializeFieldValue(3.14, "float")).toBe(3.14);
    const iso = new Date(INSTANT_MS).toISOString();
    expect(serializeFieldValue(iso, "datetime")).toBe(iso);
  });

  it("parses dict fields from JSON strings", () => {
    expect(serializeFieldValue('{"a": 1}', "dict")).toEqual({ a: 1 });
  });

  it("returns null for empty dict fields", () => {
    expect(serializeFieldValue("  ", "dict")).toBe(null);
  });

  it("throws on invalid JSON for dict fields", () => {
    expect(() => serializeFieldValue("{nope", "dict")).toThrow("Invalid JSON");
  });
});
