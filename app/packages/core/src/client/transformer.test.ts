/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { transformSampleData } from "./transformer";

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
});
