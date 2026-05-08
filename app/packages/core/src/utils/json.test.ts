import { describe, expect, it } from "vitest";
import { normalizeData } from "./json";

describe("normalizeData", () => {
  it("should leave primitive values unchanged", () => {
    const primitives = [
      "some string",
      123,
      123.123,
      true,
      false,
      null,
      undefined,
    ];

    primitives.forEach((primitive) =>
      expect(normalizeData(primitive)).toBe(primitive)
    );
  });

  it("should recursively process lists of data", () => {
    // no fields with special handling
    const data = ["some string", { property: "value" }];

    expect(normalizeData(data)).toStrictEqual(data);
  });

  it("should recursively process nested objects", () => {
    const data = {
      foo: {
        bar: "baz",
      },
    };

    expect(normalizeData(data)).toStrictEqual(data);
  });

  /**
   * Dates are expected to be converted from the server-serialized format
   * to an ISO string.
   */
  describe("dates", () => {
    const date = new Date();
    // mimics format of dates serialized by the server
    const serializedDate = {
      _cls: "DateTime",
      datetime: date.getTime(),
    };
    const isoString = date.toISOString();

    it("should convert serialized dates to iso strings", () => {
      expect(normalizeData(serializedDate)).toBe(isoString);
    });

    it("should process dates in nested objects", () => {
      const data = {
        foo: serializedDate,
        bar: "other data",
      };

      const normalized = normalizeData(data);

      expect(typeof normalized).toBe("object");
      expect("foo" in (normalized as object)).toBeTruthy();
      expect((normalized as { foo: unknown }).foo).toBe(isoString);
    });

    it("should process dates in lists", () => {
      const data = [serializedDate];

      const normalized = normalizeData(data);

      expect(Array.isArray(normalized)).toBeTruthy();
      expect((normalized as unknown[]).length).toBe(data.length);
      expect((normalized as unknown[])[0]).toBe(isoString);
    });

    it("should process dates in lists of nested objects", () => {
      const data = [{ foo: serializedDate }];

      const normalized = normalizeData(data);

      expect(Array.isArray(normalized)).toBeTruthy();
      expect((normalized as unknown[]).length).toBe(data.length);

      const obj = (normalized as unknown[])[0];
      expect("foo" in (obj as object)).toBeTruthy();
      expect((obj as { foo: unknown }).foo).toBe(isoString);
    });

    it("should not convert partial dates", () => {
      const data = {
        _cls: "DateTime",
        foo: 123,
      };

      expect(normalizeData(data)).toStrictEqual(data);
    });

    it("should not convert invalid dates", () => {
      const invalidTimestamps: number[] = [NaN, 1e20];

      invalidTimestamps.forEach((invalidTimestamp) => {
        const data = {
          _cls: "DateTime",
          datetime: invalidTimestamp,
        };

        expect(normalizeData(data)).toStrictEqual(data);
      });
    });
  });

  /**
   * MongoDB Extended JSON binary envelopes — `{$binary:{base64:'...'}}` —
   * should normalize to the underlying base64 string so a wrapped value vs.
   * the same value as a plain string compares as a single primitive.
   */
  describe("binary envelopes", () => {
    it("should unwrap a $binary envelope to its base64 string", () => {
      const wrapped = { $binary: { base64: "abc123" } };
      expect(normalizeData(wrapped)).toBe("abc123");
    });

    it("should unwrap nested $binary envelopes", () => {
      const data = {
        mask: { $binary: { base64: "mask-data" } },
        other: "value",
      };
      expect(normalizeData(data)).toStrictEqual({
        mask: "mask-data",
        other: "value",
      });
    });

    it("should treat wrapped and unwrapped masks as structurally equal", () => {
      const wrapped = { mask: { $binary: { base64: "X" } } };
      const unwrapped = { mask: "X" };
      expect(normalizeData(wrapped)).toStrictEqual(normalizeData(unwrapped));
    });

    it("should not unwrap envelopes missing the base64 field", () => {
      const data = { $binary: { encoded: "abc" } };
      expect(normalizeData(data)).toStrictEqual({
        $binary: { encoded: "abc" },
      });
    });
  });
});
