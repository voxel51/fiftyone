import { describe, expect, it, vi } from "vitest";
import { rawNodeToJson } from "../../../ir/index";
import type {
  McapRawArrayNode,
  McapRawObjectNode,
  McapRawValueNode,
} from "../contracts/index";
import {
  DEFAULT_RAW_PRUNE_BUDGETS,
  pruneRawRecord,
  rawRecordToJsonText,
} from "./raw-record-prune";

describe("pruneRawRecord", () => {
  it("passes small records through untouched", () => {
    const { root, truncated } = pruneRawRecord({
      armed: true,
      label: "ego",
      missing: null,
      speed: 3.5,
      twist: { linear: { x: 1.25 } },
      values: [1, 2, 3],
    });

    expect(truncated).toBe(false);
    const record = rawNodeToJson(root);
    expect(record).toEqual({
      armed: true,
      label: "ego",
      missing: null,
      speed: 3.5,
      twist: { linear: { x: 1.25 } },
      values: [1, 2, 3],
    });
  });

  it("caps arrays and reports the true length", () => {
    const { root, truncated } = pruneRawRecord(
      { data: Array.from({ length: 1_000 }, (_, index) => index) },
      { maxArrayLength: 4 },
    );

    expect(truncated).toBe(true);
    const data = entry(root.entries, "data") as McapRawArrayNode;
    expect(data.kind).toBe("array");
    expect(data.totalLength).toBe(1_000);
    expect(data.items).toHaveLength(4);
  });

  it("caps typed arrays like plain arrays", () => {
    const { root, truncated } = pruneRawRecord(
      { intensities: Float32Array.from({ length: 200 }, (_, i) => i) },
      { maxArrayLength: 3 },
    );

    expect(truncated).toBe(true);
    const data = entry(root.entries, "intensities") as McapRawArrayNode;
    expect(data.totalLength).toBe(200);
    expect(rawNodeToJson(data)).toEqual([0, 1, 2, "… 197 more items"]);
  });

  it("summarizes byte payloads with a hex preview", () => {
    const bytes = Uint8Array.from({ length: 64 }, (_, index) => index);
    const { root, truncated } = pruneRawRecord({ data: bytes });

    expect(truncated).toBe(false);
    const node = entry(root.entries, "data");
    expect(node).toEqual({
      byteLength: 64,
      kind: "bytes",
      preview: "00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f",
    });
  });

  it("cuts long strings at the string budget", () => {
    const { root, truncated } = pruneRawRecord(
      { frame_id: "x".repeat(600) },
      { maxStringLength: 10 },
    );

    expect(truncated).toBe(true);
    expect(entry(root.entries, "frame_id")).toEqual({
      kind: "scalar",
      truncated: true,
      value: "xxxxxxxxxx",
      valueType: "string",
    });
  });

  it("collapses subtrees past the depth budget", () => {
    const deep = { a: { b: { c: { d: 1 } } } };
    const { root, truncated } = pruneRawRecord(deep, { maxDepth: 2 });

    expect(truncated).toBe(true);
    const a = entry(root.entries, "a") as McapRawObjectNode;
    expect(a.kind).toBe("object");
    expect(entry(a.entries, "b")).toEqual({
      kind: "truncated",
      reason: "depth",
    });
  });

  it("stops emitting nodes at the total budget and reports drops", () => {
    const wide: Record<string, unknown> = {};
    for (let index = 0; index < 100; index += 1) {
      wide[`k${index}`] = index;
    }
    const { root, truncated } = pruneRawRecord(wide, { maxTotalNodes: 11 });

    expect(truncated).toBe(true);
    expect(root.entries).toHaveLength(10);
    expect(root.droppedEntries).toBe(90);
  });

  it("stringifies 64-bit and non-finite values", () => {
    const { root } = pruneRawRecord({
      big: 9_007_199_254_740_993n,
      inf: Number.POSITIVE_INFINITY,
      long: {
        high: 1,
        low: 2,
        toNumber: () => 42,
        toString: () => "4294967298",
      },
      nan: Number.NaN,
    });

    expect(entry(root.entries, "big")).toEqual({
      kind: "scalar",
      value: "9007199254740993",
      valueType: "bigint",
    });
    expect(entry(root.entries, "long")).toEqual({
      kind: "scalar",
      value: "4294967298",
      valueType: "bigint",
    });
    expect(entry(root.entries, "inf")).toEqual({
      kind: "scalar",
      value: "Infinity",
      valueType: "number",
    });
    expect(entry(root.entries, "nan")).toEqual({
      kind: "scalar",
      value: "NaN",
      valueType: "number",
    });
  });

  it("has defaults that bound a grid-sized payload to a small tree", () => {
    const { root, truncated } = pruneRawRecord({
      data: new Array(400_000).fill(0),
      info: { resolution: 0.05 },
    });

    expect(truncated).toBe(true);
    const data = entry(root.entries, "data") as McapRawArrayNode;
    expect(data.items).toHaveLength(DEFAULT_RAW_PRUNE_BUDGETS.maxArrayLength);
    expect(data.totalLength).toBe(400_000);
  });
});

describe("rawNodeToJson", () => {
  it("marks truncations legibly in the copy payload", () => {
    const { root } = pruneRawRecord(
      {
        data: new Array(100).fill(7),
        note: "y".repeat(600),
      },
      { maxArrayLength: 2, maxStringLength: 3 },
    );

    expect(rawNodeToJson(root)).toEqual({
      data: [7, 7, "… 98 more items"],
      note: "yyy…",
    });
  });

  it("keeps non-finite numbers and unsafe integers as strings", () => {
    const { root } = pruneRawRecord({
      big: 9_007_199_254_740_993n,
      nan: Number.NaN,
      small: 12n,
    });

    expect(rawNodeToJson(root)).toEqual({
      big: "9007199254740993",
      nan: "NaN",
      small: 12,
    });
  });
});

describe("rawRecordToJsonText", () => {
  it("serializes complete arrays, strings, bytes, and 64-bit values", () => {
    const text = rawRecordToJsonText({
      big: 9_007_199_254_740_993n,
      bytes: Uint8Array.from([0, 1, 2, 255]),
      data: Array.from({ length: 100 }, (_, index) => index),
      long: {
        high: 1,
        low: 2,
        toNumber: () => 42,
        toString: () => "4294967298",
      },
      note: "x".repeat(600),
    });

    expect(JSON.parse(text)).toEqual({
      big: "9007199254740993",
      bytes: {
        $binary: { base64: "AAEC/w==", byteLength: 4 },
      },
      data: Array.from({ length: 100 }, (_, index) => index),
      long: 4_294_967_298,
      note: "x".repeat(600),
    });
  });

  it("rejects whole-message JSON before exceeding the output bound", () => {
    expect(() =>
      rawRecordToJsonText({ note: "x".repeat(100) }, 64),
    ).toThrowError(
      expect.objectContaining({
        name: "EpisodeReadUnsupportedError",
        operation: "raw-record-json-output",
      }),
    );
  });

  it("preflights byte arrays without expanding them into number arrays", () => {
    expect(() =>
      rawRecordToJsonText({ bytes: new Uint8Array(100) }, 100),
    ).toThrowError(
      expect.objectContaining({ operation: "raw-record-json-output" }),
    );
  });

  it("keeps a one-mebibyte byte payload near base64 size", () => {
    const text = rawRecordToJsonText({ bytes: new Uint8Array(1024 * 1024) });
    const parsed = JSON.parse(text) as {
      readonly bytes: {
        readonly $binary: {
          readonly base64: string;
          readonly byteLength: number;
        };
      };
    };

    expect(parsed.bytes.$binary.byteLength).toBe(1024 * 1024);
    expect(parsed.bytes.$binary.base64).toHaveLength(1_398_104);
    expect(text.length).toBeLessThan(1.5 * 1024 * 1024);
  });

  it("rejects custom toJSON before special-value serialization", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    Object.defineProperty(bytes, "toJSON", {
      value: () => "x".repeat(1_000),
    });
    const int64Like = {
      high: 0,
      low: 42,
      toJSON: () => "x".repeat(1_000),
      toNumber: () => 42,
      toString: () => "42",
    };
    const stringify = vi.spyOn(JSON, "stringify");
    try {
      for (const value of [bytes, int64Like]) {
        expect(() => rawRecordToJsonText({ value }, 64)).toThrowError(
          expect.objectContaining({ operation: "raw-record-json-output" }),
        );
      }
      expect(stringify).not.toHaveBeenCalled();
    } finally {
      stringify.mockRestore();
    }
  });

  it("preflights lone UTF-16 surrogates at their escaped JSON size", () => {
    const stringify = vi.spyOn(JSON, "stringify");
    try {
      expect(() =>
        rawRecordToJsonText({ value: "\ud800".repeat(20) }, 64),
      ).toThrowError(
        expect.objectContaining({ operation: "raw-record-json-output" }),
      );
      expect(stringify).not.toHaveBeenCalled();
    } finally {
      stringify.mockRestore();
    }
  });

  it("rejects accessor-backed values without invoking them", () => {
    const getter = vi.fn(() => "x".repeat(1_000));
    const record: Record<string, unknown> = {};
    Object.defineProperty(record, "dynamic", {
      enumerable: true,
      get: getter,
    });
    const stringify = vi.spyOn(JSON, "stringify");
    try {
      expect(() => rawRecordToJsonText(record, 64)).toThrowError(
        expect.objectContaining({ operation: "raw-record-json-output" }),
      );
      expect(getter).not.toHaveBeenCalled();
      expect(stringify).not.toHaveBeenCalled();
    } finally {
      stringify.mockRestore();
    }
  });

  it("rejects inherited toJSON accessors without invoking them", () => {
    const getter = vi.fn(() => () => "x".repeat(1_000));
    const prototype: Record<string, unknown> = {};
    Object.defineProperty(prototype, "toJSON", { get: getter });
    const record = Object.assign(Object.create(prototype) as object, {
      value: 1,
    });
    const stringify = vi.spyOn(JSON, "stringify");
    try {
      expect(() => rawRecordToJsonText(record, 64)).toThrowError(
        expect.objectContaining({ operation: "raw-record-json-output" }),
      );
      expect(getter).not.toHaveBeenCalled();
      expect(stringify).not.toHaveBeenCalled();
    } finally {
      stringify.mockRestore();
    }
  });

  it("normalizes boxed primitives consistently with the preflight", () => {
    expect(
      JSON.parse(
        rawRecordToJsonText({
          boolean: Object(true),
          number: Object(Number.POSITIVE_INFINITY),
          string: Object("value"),
        }),
      ),
    ).toEqual({ boolean: true, number: "Infinity", string: "value" });
  });

  it("normalizes safe and unsafe boxed BigInt values", () => {
    expect(
      JSON.parse(
        rawRecordToJsonText({
          safe: Object(42n),
          unsafe: Object(9_007_199_254_740_993n),
        }),
      ),
    ).toEqual({ safe: 42, unsafe: "9007199254740993" });
  });
});

function entry(
  entries: readonly (readonly [string, McapRawValueNode])[],
  key: string,
): McapRawValueNode {
  const found = entries.find(([name]) => name === key);
  if (!found) {
    throw new Error(`Missing entry '${key}'`);
  }
  return found[1];
}
