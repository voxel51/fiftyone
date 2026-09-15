/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { toExtendedJson, transformSampleData } from "./transformer";

describe("transformSampleData", () => {
  it("unwraps a $binary envelope to its base64 string", () => {
    const result = transformSampleData({
      mask: { $binary: { base64: "AAA" } },
    });
    expect(result.mask).toBe("AAA");
  });

  it("unwraps $binary envelopes nested inside detection arrays", () => {
    const result = transformSampleData({
      ground_truth: {
        detections: [
          { _id: "a", mask: { $binary: { base64: "X" } } },
          { _id: "b", mask: { $binary: { base64: "Y" } } },
        ],
      },
    }) as {
      ground_truth: { detections: Array<{ mask: unknown }> };
    };

    expect(result.ground_truth.detections[0].mask).toBe("X");
    expect(result.ground_truth.detections[1].mask).toBe("Y");
  });

  it("leaves a $binary object alone when its base64 field is missing", () => {
    const result = transformSampleData({
      weird: { $binary: { encoded: "x" } },
    });
    expect(result.weird).toEqual({ $binary: { encoded: "x" } });
  });

  it("still unwraps $oid envelopes alongside $binary", () => {
    const result = transformSampleData({
      _id: { $oid: "abc123" },
      mask: { $binary: { base64: "AAA" } },
    });
    expect(result._id).toBe("abc123");
    expect(result.mask).toBe("AAA");
  });

  it("does not mutate the input", () => {
    const input = {
      mask: { $binary: { base64: "AAA" } },
    };
    transformSampleData(input);
    expect(input.mask).toEqual({ $binary: { base64: "AAA" } });
  });

  it("converts $numberDouble non-finites to nonfinite strings", () => {
    const result = transformSampleData({
      keypoints: {
        keypoints: [
          {
            points: [
              [0.5, 0.5],
              [{ $numberDouble: "NaN" }, { $numberDouble: "NaN" }],
              [{ $numberDouble: "Infinity" }, { $numberDouble: "-Infinity" }],
            ],
          },
        ],
      },
    }) as {
      keypoints: { keypoints: Array<{ points: unknown[][] }> };
    };

    expect(result.keypoints.keypoints[0].points).toEqual([
      [0.5, 0.5],
      ["nan", "nan"],
      ["inf", "-inf"],
    ]);
  });

  it("converts a finite $numberDouble to a plain number", () => {
    const result = transformSampleData({
      value: { $numberDouble: "0.25" },
    });
    expect(result.value).toBe(0.25);
  });
});

describe("toExtendedJson", () => {
  it("converts nonfinite strings under a points field to $numberDouble", () => {
    const result = toExtendedJson({
      points: [
        [0.5, 0.5],
        ["nan", "nan"],
        ["inf", "-inf"],
      ],
    });

    expect(result).toEqual({
      points: [
        [0.5, 0.5],
        [{ $numberDouble: "NaN" }, { $numberDouble: "NaN" }],
        [{ $numberDouble: "Infinity" }, { $numberDouble: "-Infinity" }],
      ],
    });
  });

  it("converts non-finite numbers under a points field", () => {
    const result = toExtendedJson({
      points: [[NaN, NaN]],
    });

    expect(result).toEqual({
      points: [[{ $numberDouble: "NaN" }, { $numberDouble: "NaN" }]],
    });
  });

  it("converts non-finite confidence entries", () => {
    const result = toExtendedJson({ confidence: [0.9, "nan"] });

    expect(result).toEqual({
      confidence: [0.9, { $numberDouble: "NaN" }],
    });
  });

  it("keeps the field context through nested label lists", () => {
    const result = toExtendedJson({
      keypoints: [{ points: [["nan", "nan"]] }],
    }) as { keypoints: Array<{ points: unknown[][] }> };

    expect(result.keypoints[0].points[0]).toEqual([
      { $numberDouble: "NaN" },
      { $numberDouble: "NaN" },
    ]);
  });

  it("never touches 'nan' strings outside the gated fields", () => {
    const result = toExtendedJson({
      label: "nan",
      tags: ["nan", "inf"],
      attributes: { note: "nan" },
    });

    expect(result).toEqual({
      label: "nan",
      tags: ["nan", "inf"],
      attributes: { note: "nan" },
    });
  });

  it("still converts _id fields to $oid alongside points", () => {
    const result = toExtendedJson({
      _id: "0123456789abcdef01234567",
      points: [["nan", "nan"]],
    });

    expect(result).toEqual({
      _id: { $oid: "0123456789abcdef01234567" },
      points: [[{ $numberDouble: "NaN" }, { $numberDouble: "NaN" }]],
    });
  });
});
