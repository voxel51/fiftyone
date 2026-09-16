/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { intraStartPointChunk, isIntraOnlySample } from "./intraStartPoints";

/**
 * A length-prefixed NAL. `slice` supplies the first header bytes of a coded
 * slice: `first_mb_in_slice` 0 then `slice_type`, both exp-Golomb.
 */
const nal = (header: number, payload: number[] = [0], lengthSize = 4) => {
  const length = payload.length + 1;
  const prefix: number[] = [];
  for (let i = lengthSize - 1; i >= 0; i--) {
    prefix.push((length >> (8 * i)) & 0xff);
  }

  return [...prefix, header, ...payload];
};

/**
 * Header byte of a slice whose `first_mb_in_slice` is 0 and whose `slice_type`
 * is `type`. ue(0) is `1`, ue(2) is `011`, ue(7) is `0001000`, ue(0 as P) is
 * `1`, so the two fields pack into the leading bits of one byte.
 */
const sliceHeader = (type: number): number[] => {
  const bits = ["1"]; // first_mb_in_slice = 0
  const ue = (value: number) => {
    const n = value + 1;
    const width = n.toString(2).length;
    return "0".repeat(width - 1) + n.toString(2);
  };
  bits.push(ue(type));
  const packed = (bits.join("") + "0".repeat(8)).slice(0, 8);
  return [parseInt(packed, 2)];
};

const AUD = 0x09;
const SEI = 0x06;
const SPS = 0x67;
const IDR_SLICE = 0x65;
const NON_IDR_SLICE = 0x41;

const bytes = (...parts: number[][]) => Uint8Array.from(parts.flat());

describe("isIntraOnlySample", () => {
  it("accepts a non-IDR slice that codes every macroblock as intra", () => {
    // The shape an industrial camera emits every refresh interval: an
    // access-unit delimiter then an I-slice that is not tagged as an IDR.
    const sample = bytes(nal(AUD), nal(NON_IDR_SLICE, sliceHeader(2)));
    expect(isIntraOnlySample(sample, 4)).toBe(true);
  });

  it("accepts slice_type 7, the all-slices-intra form", () => {
    expect(
      isIntraOnlySample(bytes(nal(NON_IDR_SLICE, sliceHeader(7))), 4),
    ).toBe(true);
  });

  it("rejects a predicted slice", () => {
    expect(
      isIntraOnlySample(bytes(nal(NON_IDR_SLICE, sliceHeader(0))), 4),
    ).toBe(false);
    expect(
      isIntraOnlySample(bytes(nal(NON_IDR_SLICE, sliceHeader(5))), 4),
    ).toBe(false);
  });

  it("rejects a sample where any slice is predicted", () => {
    const sample = bytes(
      nal(NON_IDR_SLICE, sliceHeader(2)),
      nal(NON_IDR_SLICE, sliceHeader(0)),
    );
    expect(isIntraOnlySample(sample, 4)).toBe(false);
  });

  it("accepts an IDR, which is trivially intra", () => {
    expect(isIntraOnlySample(bytes(nal(IDR_SLICE, sliceHeader(7))), 4)).toBe(
      true,
    );
  });

  it("ignores non-slice NALs but requires at least one slice", () => {
    expect(isIntraOnlySample(bytes(nal(AUD), nal(SPS), nal(SEI)), 4)).toBe(
      false,
    );
    expect(isIntraOnlySample(new Uint8Array(0), 4)).toBe(false);
  });

  it("honors a two-byte length prefix", () => {
    const sample = bytes(nal(NON_IDR_SLICE, sliceHeader(2), 2));
    expect(isIntraOnlySample(sample, 2)).toBe(true);
  });

  it("stops on a zero-length NAL rather than spinning", () => {
    expect(isIntraOnlySample(Uint8Array.from([0, 0, 0, 0, 0x41]), 4)).toBe(
      false,
    );
  });

  it("reads a header carrying emulation-prevention bytes", () => {
    // 00 00 03 inside the payload is an escape; the 03 is not data.
    const sample = bytes(
      nal(NON_IDR_SLICE, [0x00, 0x00, 0x03, ...sliceHeader(2)]),
    );
    expect(isIntraOnlySample(sample, 4)).toBe(false);
  });
});

describe("intraStartPointChunk", () => {
  it("prepends a recovery-point SEI to an all-intra picture", () => {
    const sample = bytes(nal(NON_IDR_SLICE, sliceHeader(2)));
    const chunk = intraStartPointChunk(sample, 4);

    expect(chunk).not.toBeNull();
    // 4-byte length, then the SEI NAL: header 0x06, payload type 6, size 1.
    expect(Array.from(chunk!.subarray(0, 8))).toEqual([
      0, 0, 0, 4, 0x06, 0x06, 0x01, 0xc4,
    ]);
    // the original sample follows untouched
    expect(Array.from(chunk!.subarray(8))).toEqual(Array.from(sample));
  });

  it("sizes the SEI's length prefix to the codec's field width", () => {
    const sample = bytes(nal(NON_IDR_SLICE, sliceHeader(2), 2));
    const chunk = intraStartPointChunk(sample, 2);

    expect(Array.from(chunk!.subarray(0, 6))).toEqual([
      0, 4, 0x06, 0x06, 0x01, 0xc4,
    ]);
  });

  it("refuses a picture it cannot honestly mark as a start point", () => {
    const sample = bytes(nal(NON_IDR_SLICE, sliceHeader(0)));
    expect(intraStartPointChunk(sample, 4)).toBeNull();
  });
});
