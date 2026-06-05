import { describe, expect, it } from "vitest";
import { idAlignedDetectionsDelta, normalizeData } from "./json";

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
});

describe("idAlignedDetectionsDelta", () => {
  type Item = { id: string; v?: number };

  const spec = (overrides: Record<string, unknown> = {}) => ({
    currentId: (i: Item) => i.id,
    baselineId: (e: Item) => e.id,
    diffMatched: (cur: Item, base: Item, path: string) =>
      cur.v !== base.v
        ? [{ op: "replace" as const, path: `${path}/v`, value: cur.v }]
        : [],
    serializeAdd: (i: Item) => i,
    ...overrides,
  });

  it("appends current-only items with `/-`", () => {
    const delta = idAlignedDetectionsDelta(
      [{ id: "a" }, { id: "b" }],
      [{ id: "a" }],
      "/p",
      spec()
    );
    expect(delta).toEqual([
      { op: "add", path: "/p/detections/-", value: { id: "b" } },
    ]);
  });

  it("diffs matched items at their baseline index, not array position", () => {
    const delta = idAlignedDetectionsDelta(
      [
        { id: "a", v: 2 },
        { id: "b", v: 9 },
      ],
      [
        { id: "a", v: 1 },
        { id: "b", v: 9 },
      ],
      "/p",
      spec()
    );
    expect(delta).toEqual([
      { op: "replace", path: "/p/detections/0/v", value: 2 },
    ]);
  });

  it("removes baseline-only ids in descending index order (set-diff default)", () => {
    const delta = idAlignedDetectionsDelta(
      [{ id: "a" }],
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      "/p",
      spec()
    );
    expect(delta).toEqual([
      { op: "remove", path: "/p/detections/2" },
      { op: "remove", path: "/p/detections/1" },
    ]);
  });

  it("does not flood replaces when a list shifts (the regression this guards)", () => {
    // `b` deleted, so `c` slides 2 → 1. Index-alignment would see both slots
    // 'change'; id-alignment emits one remove and nothing for the unmoved a/c.
    const delta = idAlignedDetectionsDelta(
      [{ id: "a" }, { id: "c" }],
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      "/p",
      spec()
    );
    expect(delta).toEqual([{ op: "remove", path: "/p/detections/1" }]);
  });

  it("with explicit removalIds, removes only those (absence is not deletion)", () => {
    const delta = idAlignedDetectionsDelta(
      [{ id: "a" }],
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      "/p",
      spec({ removalIds: ["b", "missing"] })
    );
    // `c` is absent from current but NOT removed; "missing" resolves to nothing.
    expect(delta).toEqual([{ op: "remove", path: "/p/detections/1" }]);
  });

  it("skips current items whose id is undefined", () => {
    const delta = idAlignedDetectionsDelta(
      [{ id: "keep" }, { id: "drop" }],
      [],
      "/p",
      spec({ currentId: (i: Item) => (i.id === "drop" ? undefined : i.id) })
    );
    expect(delta).toEqual([
      { op: "add", path: "/p/detections/-", value: { id: "keep" } },
    ]);
  });

  it("skips the add when serializeAdd returns null", () => {
    const delta = idAlignedDetectionsDelta(
      [{ id: "a" }],
      [],
      "/p",
      spec({
        serializeAdd: () => null,
      })
    );
    expect(delta).toEqual([]);
  });
});
