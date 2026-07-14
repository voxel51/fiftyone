import { describe, expect, it } from "vitest";
import type {
  McapRawArrayNode,
  McapRawObjectNode,
  McapRawValueNode,
} from "../types";
import {
  DEFAULT_RAW_PRUNE_BUDGETS,
  pruneRawRecord,
  rawNodeToJson,
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
