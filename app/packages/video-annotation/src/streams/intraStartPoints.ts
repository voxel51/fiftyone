/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Making an all-intra H.264 picture usable as a decode start point.
 *
 * Some encoders refresh with a full intra picture at a fixed interval but only
 * emit a true IDR every few refreshes, and the muxer flags every refresh as a
 * sync sample. An all-intra picture references nothing, so decoding from it is
 * sound, but WebCodecs rejects a chunk marked `key` unless its bytes look like
 * a start point: an IDR slice, or a picture carrying a recovery-point SEI.
 * Without one, a seek has to snap back to the previous real IDR, which on such
 * files can be hundreds of frames earlier.
 *
 * These frames genuinely ARE recovery points, so the missing SEI can be
 * supplied: {@link intraStartPointChunk} prepends one. What that buys depends
 * on the browser, since only newer Chromium treats a recovery point as a start
 * point, so the caller probes once per source rather than assuming (the walk
 * back to an IDR remains the fallback).
 *
 * Pure byte work, kept out of the decode worker so it is exhaustively testable.
 */

/** Reads the exponential-Golomb coded fields of a slice header. */
class BitReader {
  private bit = 0;

  constructor(private readonly bytes: Uint8Array) {}

  private read(): number {
    const index = this.bit >> 3;
    if (index >= this.bytes.length) {
      return -1;
    }

    const value = (this.bytes[index] >> (7 - (this.bit & 7))) & 1;
    this.bit += 1;
    return value;
  }

  /** `ue(v)`, or `-1` when the bits run out. */
  unsigned(): number {
    let zeros = 0;
    for (;;) {
      const bit = this.read();
      if (bit < 0) {
        return -1;
      }

      if (bit === 1) {
        break;
      }

      zeros += 1;
      if (zeros > 31) {
        return -1;
      }
    }

    let value = 0;
    for (let i = 0; i < zeros; i++) {
      const bit = this.read();
      if (bit < 0) {
        return -1;
      }

      value = (value << 1) | bit;
    }

    return (1 << zeros) - 1 + value;
  }
}

/**
 * Strip emulation-prevention bytes from the start of a NAL payload. Only the
 * leading bytes matter here: the fields this module reads sit in the first few
 * bytes of the slice header.
 */
function rbsp(bytes: Uint8Array, limit = 16): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < bytes.length && out.length < limit; i++) {
    if (i >= 2 && bytes[i] === 3 && bytes[i - 1] === 0 && bytes[i - 2] === 0) {
      continue;
    }

    out.push(bytes[i]);
  }

  return Uint8Array.from(out);
}

/** H.264 slice types that code every macroblock as intra. */
const INTRA_SLICE_TYPES = new Set([2, 7]);

/**
 * Whether every coded slice in this sample is an I-slice, making the picture
 * self-contained. `false` for a sample with no slices, or one whose header
 * cannot be read: an unreadable header is not evidence of anything.
 */
export function isIntraOnlySample(
  bytes: Uint8Array,
  nalLengthSize: number,
): boolean {
  let position = 0;
  let slices = 0;

  while (position + nalLengthSize < bytes.length) {
    let length = 0;
    for (let i = 0; i < nalLengthSize; i++) {
      length = length * 256 + bytes[position + i];
    }

    if (length <= 0) {
      return false;
    }

    const header = bytes[position + nalLengthSize];
    const type = header & 0x1f;
    // 1 is a non-IDR coded slice, 5 an IDR one; both carry a slice header.
    if (type === 1 || type === 5) {
      const payload = rbsp(
        bytes.subarray(
          position + nalLengthSize + 1,
          position + nalLengthSize + length,
        ),
      );
      const reader = new BitReader(payload);
      // first_mb_in_slice, then slice_type
      if (reader.unsigned() < 0) {
        return false;
      }

      const sliceType = reader.unsigned();
      if (sliceType < 0 || !INTRA_SLICE_TYPES.has(sliceType)) {
        return false;
      }

      slices += 1;
    }

    position += nalLengthSize + length;
  }

  return slices > 0;
}

/**
 * A recovery-point SEI NAL, length-prefixed for `avcC` sample data.
 *
 * Payload type 6 with `recovery_frame_cnt` 0 and `exact_match_flag` set: the
 * picture it precedes is a point from which output is correct immediately,
 * which is exactly true of an all-intra picture.
 */
function recoveryPointSei(nalLengthSize: number): Uint8Array {
  // 0x06 NAL header (type 6), payload type 6, payload size 1, then the
  // payload: recovery_frame_cnt=0, exact_match_flag=1, broken_link_flag=0,
  // changing_slice_group_idc=0, followed by rbsp trailing bits.
  const nal = [0x06, 0x06, 0x01, 0xc4];
  const prefix: number[] = [];
  for (let i = nalLengthSize - 1; i >= 0; i--) {
    prefix.push((nal.length >> (8 * i)) & 0xff);
  }

  return Uint8Array.from([...prefix, ...nal]);
}

/**
 * The sample's bytes with a recovery-point SEI in front, so a decoder will
 * accept the chunk as a start point. Returns `null` when the picture is not
 * all-intra and therefore cannot honestly be marked as one.
 */
export function intraStartPointChunk(
  bytes: Uint8Array,
  nalLengthSize: number,
): Uint8Array | null {
  if (!isIntraOnlySample(bytes, nalLengthSize)) {
    return null;
  }

  const sei = recoveryPointSei(nalLengthSize);
  const out = new Uint8Array(sei.length + bytes.length);
  out.set(sei, 0);
  out.set(bytes, sei.length);
  return out;
}
