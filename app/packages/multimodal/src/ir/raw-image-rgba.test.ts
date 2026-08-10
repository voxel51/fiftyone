import { describe, expect, it } from "vitest";

import { rawImageRgba } from "./raw-image-rgba";
import { VISUALIZATION_KIND } from "./visualization-kinds";

describe("rawImageRgba", () => {
  it("lazily preserves depth invalid alpha and byte-exact range grayscale", () => {
    const frame = {
      depth: {
        maxValue: 2,
        metersPerUnit: 1,
        minValue: 1,
        values: new Float32Array([
          0,
          Number.NaN,
          -1,
          1,
          1.5,
          2,
          Number.POSITIVE_INFINITY,
        ]),
      },
      height: 1,
      kind: VISUALIZATION_KIND.RAW_IMAGE,
      rgba: new Uint8Array(0),
      sourceEncoding: "32FC1",
      width: 7,
    } as const;

    const rgba = rawImageRgba(frame);
    expect(Array.from(rgba)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 128, 128, 128, 255, 255,
      255, 255, 255, 0, 0, 0, 0,
    ]);
    expect(rawImageRgba(frame)).toBe(rgba);
  });

  it("renders a single-valued valid range as opaque white", () => {
    const frame = {
      depth: {
        maxValue: 7,
        metersPerUnit: 0.001,
        minValue: 7,
        values: new Uint16Array([7, 0]),
      },
      height: 1,
      kind: VISUALIZATION_KIND.RAW_IMAGE,
      rgba: new Uint8Array(0),
      sourceEncoding: "16UC1",
      width: 2,
    } as const;

    expect(Array.from(rawImageRgba(frame))).toEqual([
      255, 255, 255, 255, 0, 0, 0, 0,
    ]);
  });
});
