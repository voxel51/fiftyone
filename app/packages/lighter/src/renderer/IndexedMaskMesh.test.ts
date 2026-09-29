/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { packIndices } from "./IndexedMaskMesh";

const image = (
  indices: Uint8Array | Uint16Array,
  width: number,
  height: number,
) => ({ indices, width, height, lut: new Uint8Array(0) });

describe("packIndices", () => {
  it("uploads an aligned 8-bit mask as-is", () => {
    const indices = new Uint8Array(8 * 2);
    const packed = packIndices(image(indices, 8, 2));

    expect(packed.data).toBe(indices);
    expect(packed.format).toBe("r8unorm");
    expect(packed.textureWidth).toBe(8);
    expect(packed.uvScaleX).toBe(1);
  });

  it("pads 8-bit rows to a 4-byte boundary and scales the UVs to match", () => {
    // width 3: rows of 3 bytes would shear under WebGL's default alignment
    const indices = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const packed = packIndices(image(indices, 3, 2));

    expect(packed.textureWidth).toBe(4);
    expect(Array.from(packed.data)).toEqual([1, 2, 3, 0, 4, 5, 6, 0]);
    expect(packed.uvScaleX).toBe(3 / 4);
  });

  it("splits 16-bit targets into low and high bytes, rows padded to even", () => {
    const indices = new Uint16Array([300, 1, 65535]);
    const packed = packIndices(image(indices, 3, 1));

    expect(packed.format).toBe("rg8unorm");
    expect(packed.textureWidth).toBe(4);
    // 300 = 0x012c -> low 0x2c, high 0x01
    expect(Array.from(packed.data)).toEqual([
      0x2c, 0x01, 1, 0, 0xff, 0xff, 0, 0,
    ]);
    expect(packed.uvScaleX).toBe(3 / 4);
  });
});
