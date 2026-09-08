import { describe, expect, it } from "vitest";

import { decodeImageRgba } from "./image-encodings";

const HOST_IS_LITTLE_ENDIAN =
  new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

describe("native depth image decoding", () => {
  it("views aligned packed same-endian 16UC1 without an RGBA allocation", () => {
    const data = new Uint8Array(6);
    const view = new DataView(data.buffer);
    view.setUint16(0, 0, HOST_IS_LITTLE_ENDIAN);
    view.setUint16(2, 1_000, HOST_IS_LITTLE_ENDIAN);
    view.setUint16(4, 2_000, HOST_IS_LITTLE_ENDIAN);

    const result = decodeDepth({
      bigEndian: !HOST_IS_LITTLE_ENDIAN,
      data,
      encoding: "16UC1",
      height: 1,
      step: 6,
      width: 3,
    });

    expect(result.rgba).toBeUndefined();
    expect(result.depth?.values).toBeInstanceOf(Uint16Array);
    expect(result.depth?.values.buffer).toBe(data.buffer);
    expect(Array.from(result.depth?.values ?? [])).toEqual([0, 1_000, 2_000]);
    expect(result.depth).toMatchObject({
      maxValue: 2_000,
      metersPerUnit: 0.001,
      minValue: 1_000,
    });
  });

  it("views aligned packed same-endian 32FC1 and preserves NaN", () => {
    const data = new Uint8Array(12);
    const view = new DataView(data.buffer);
    view.setFloat32(0, Number.NaN, HOST_IS_LITTLE_ENDIAN);
    view.setFloat32(4, 1.5, HOST_IS_LITTLE_ENDIAN);
    view.setFloat32(8, 3, HOST_IS_LITTLE_ENDIAN);

    const result = decodeDepth({
      bigEndian: !HOST_IS_LITTLE_ENDIAN,
      data,
      encoding: "32FC1",
      height: 1,
      step: 12,
      width: 3,
    });

    expect(result.depth?.values).toBeInstanceOf(Float32Array);
    expect(result.depth?.values.buffer).toBe(data.buffer);
    expect(Number.isNaN(result.depth?.values[0])).toBe(true);
    expect(Array.from(result.depth?.values.slice(1) ?? [])).toEqual([1.5, 3]);
    expect(result.depth).toMatchObject({
      maxValue: 3,
      metersPerUnit: 1,
      minValue: 1.5,
    });
  });

  it("copies padded rows through the generic stride path", () => {
    const data = new Uint8Array(12);
    const view = new DataView(data.buffer);
    for (const [offset, value] of [
      [0, 1],
      [2, 2],
      [6, 3],
      [8, 4],
    ] as const) {
      view.setUint16(offset, value, HOST_IS_LITTLE_ENDIAN);
    }

    const result = decodeDepth({
      bigEndian: !HOST_IS_LITTLE_ENDIAN,
      data,
      encoding: "16UC1",
      height: 2,
      step: 6,
      width: 2,
    });

    expect(result.depth?.values.buffer).not.toBe(data.buffer);
    expect(Array.from(result.depth?.values ?? [])).toEqual([1, 2, 3, 4]);
  });

  it("copies padded 32FC1 rows through the generic stride path", () => {
    const data = new Uint8Array(24);
    const view = new DataView(data.buffer);
    for (const [offset, value] of [
      [0, 1.25],
      [4, 2.5],
      [12, 3.75],
      [16, 5],
    ] as const) {
      view.setFloat32(offset, value, HOST_IS_LITTLE_ENDIAN);
    }

    const result = decodeDepth({
      bigEndian: !HOST_IS_LITTLE_ENDIAN,
      data,
      encoding: "32FC1",
      height: 2,
      step: 12,
      width: 2,
    });

    expect(result.depth?.values.buffer).not.toBe(data.buffer);
    expect(Array.from(result.depth?.values ?? [])).toEqual([
      1.25, 2.5, 3.75, 5,
    ]);
  });

  it("copies opposite-endian packed rows through the generic endian path", () => {
    const data = new Uint8Array(8);
    const sourceLittleEndian = !HOST_IS_LITTLE_ENDIAN;
    const view = new DataView(data.buffer);
    view.setFloat32(0, 1.25, sourceLittleEndian);
    view.setFloat32(4, 2.5, sourceLittleEndian);

    const result = decodeDepth({
      bigEndian: !sourceLittleEndian,
      data,
      encoding: "32FC1",
      height: 1,
      step: 8,
      width: 2,
    });

    expect(result.depth?.values.buffer).not.toBe(data.buffer);
    expect(Array.from(result.depth?.values ?? [])).toEqual([1.25, 2.5]);
  });

  it("copies opposite-endian packed 16UC1 rows", () => {
    const data = new Uint8Array(4);
    const sourceLittleEndian = !HOST_IS_LITTLE_ENDIAN;
    const view = new DataView(data.buffer);
    view.setUint16(0, 1_000, sourceLittleEndian);
    view.setUint16(2, 2_000, sourceLittleEndian);

    const result = decodeDepth({
      bigEndian: !sourceLittleEndian,
      data,
      encoding: "16UC1",
      height: 1,
      step: 4,
      width: 2,
    });

    expect(result.depth?.values.buffer).not.toBe(data.buffer);
    expect(Array.from(result.depth?.values ?? [])).toEqual([1_000, 2_000]);
  });

  it("copies a misaligned packed view instead of constructing an invalid typed view", () => {
    const buffer = new ArrayBuffer(5);
    const data = new Uint8Array(buffer, 1, 4);
    const view = new DataView(buffer, 1, 4);
    view.setUint16(0, 11, HOST_IS_LITTLE_ENDIAN);
    view.setUint16(2, 22, HOST_IS_LITTLE_ENDIAN);

    const result = decodeDepth({
      bigEndian: !HOST_IS_LITTLE_ENDIAN,
      data,
      encoding: "16UC1",
      height: 1,
      step: 4,
      width: 2,
    });

    expect(result.depth?.values.buffer).not.toBe(buffer);
    expect(Array.from(result.depth?.values ?? [])).toEqual([11, 22]);
  });

  it("represents all-invalid depth with a null range", () => {
    const data = new Uint8Array(12);
    const view = new DataView(data.buffer);
    view.setFloat32(0, 0, HOST_IS_LITTLE_ENDIAN);
    view.setFloat32(4, Number.NaN, HOST_IS_LITTLE_ENDIAN);
    view.setFloat32(8, Number.POSITIVE_INFINITY, HOST_IS_LITTLE_ENDIAN);

    const result = decodeDepth({
      bigEndian: !HOST_IS_LITTLE_ENDIAN,
      data,
      encoding: "32FC1",
      height: 1,
      step: 12,
      width: 3,
    });

    expect(result.depth).toMatchObject({ maxValue: null, minValue: null });
    expect(result.attributes).toBeUndefined();
  });
});

function decodeDepth({
  bigEndian,
  data,
  encoding,
  height,
  step,
  width,
}: {
  readonly bigEndian: boolean;
  readonly data: Uint8Array;
  readonly encoding: "16UC1" | "32FC1";
  readonly height: number;
  readonly step: number;
  readonly width: number;
}) {
  return decodeImageRgba({
    bigEndian,
    data,
    encoding,
    height,
    sourceLabel: "test image",
    step,
    width,
  });
}
