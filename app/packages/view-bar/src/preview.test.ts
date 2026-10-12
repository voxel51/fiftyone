/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { fromSource } from "./builder/envelope";
import { previewValue } from "./preview";

const envelopeOf = (source: string) => {
  const result = fromSource(source);
  if (result.status !== "ok") throw new Error(`unparsable: ${source}`);
  return result.envelope;
};

describe("previewValue", () => {
  it("shows an expression as the Python it was written as", () => {
    expect(previewValue(envelopeOf("F('index') > 4"))).toBe("F('index') > 4");
  });

  it("truncates a long expression like any long string", () => {
    expect(previewValue(envelopeOf("F('ground_truth.label') == 'cat'"))).toBe(
      "F('ground_truth.label…",
    );
  });

  it("shows raw MongoDB as its JSON", () => {
    expect(previewValue({ $gt: ["$index", 4] })).toBe('{"$gt":["$index",4]}');
  });

  it("shows a list's first item with a count of the rest", () => {
    expect(previewValue(["a", "b", "c"])).toBe("a +2");
  });

  it("previews a list's first object item like a single value", () => {
    expect(previewValue([{ $gt: ["$index", 4] }, { $lt: 1 }])).toBe(
      '{"$gt":["$index",4]} +1',
    );
  });

  it("shows scalars as-is and an empty value as a dash", () => {
    expect(previewValue(3)).toBe("3");
    expect(previewValue(false)).toBe("false");
    expect(previewValue("")).toBe("—");
    expect(previewValue(null)).toBe("—");
  });
});
