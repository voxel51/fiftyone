/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Bitstream-level keyframe checks for demuxed samples.
 *
 * A container's sync-sample table can flag a sample as a keyframe when the
 * coded picture is not one: open-GOP H.264 encoders flag their non-IDR
 * I-frames (they carry a recovery-point SEI), and re-muxed files inherit
 * whatever the muxer believed. WebCodecs verifies the first chunk after
 * `configure()`/`flush()` and rejects one marked `key` whose bytes are not a
 * keyframe, which fails the whole chunk. The decode worker therefore checks
 * the bytes of every sample it is about to decode and trusts them over the
 * table. Pure and free of mp4box so it is unit-testable.
 */

export type CodecFamily = "avc" | "hevc" | "vp9" | "other";

/** How to read keyframe-ness out of a sample's bytes for one codec. */
export interface KeyframeProbe {
  family: CodecFamily;
  /** Byte width of each NAL unit's length prefix (`lengthSizeMinusOne + 1`). */
  nalLengthSize: number;
}

/** Codec family from an RFC 6381 codec string (`avc1.640028`, `vp09.00.10.08`, …). */
export function codecFamily(codec: string): CodecFamily {
  switch (codec.split(".")[0].toLowerCase()) {
    case "avc1":
    case "avc3":
      return "avc";
    case "hvc1":
    case "hev1":
      return "hevc";
    case "vp09":
      return "vp9";
    default:
      return "other";
  }
}

/**
 * The probe for a decoder config: its codec string plus the codec description
 * payload (`avcC` / `hvcC`) that carries the NAL length size.
 */
export function keyframeProbe(
  codec: string,
  description?: Uint8Array,
): KeyframeProbe {
  const family = codecFamily(codec);
  return { family, nalLengthSize: nalLengthSize(family, description) };
}

function nalLengthSize(family: CodecFamily, description?: Uint8Array): number {
  // avcC byte 4 and hvcC byte 21 hold lengthSizeMinusOne in their low 2 bits.
  const index = family === "avc" ? 4 : family === "hevc" ? 21 : -1;
  if (index < 0 || !description || description.length <= index) {
    return 4;
  }

  return (description[index] & 0x03) + 1;
}

/**
 * Whether `bytes` code a keyframe a decoder can start from. `null` when the
 * codec is not one we inspect, so the caller falls back to the container flag.
 */
export function isKeyframeSample(
  bytes: Uint8Array,
  probe: KeyframeProbe,
): boolean | null {
  switch (probe.family) {
    case "avc":
      return hasNalType(bytes, probe.nalLengthSize, (h) => (h & 0x1f) === 5);
    case "hevc":
      // IRAP pictures (BLA / IDR / CRA and the reserved IRAP range).
      return hasNalType(bytes, probe.nalLengthSize, (h) => {
        const type = (h >> 1) & 0x3f;
        return type >= 16 && type <= 23;
      });
    case "vp9":
      return isVp9Keyframe(bytes);
    default:
      return null;
  }
}

/** Walk the length-prefixed NAL units of a sample; true if any header matches. */
function hasNalType(
  bytes: Uint8Array,
  lengthSize: number,
  matches: (header: number) => boolean,
): boolean {
  let p = 0;
  while (p + lengthSize < bytes.length) {
    let length = 0;
    for (let i = 0; i < lengthSize; i++) {
      length = length * 256 + bytes[p + i];
    }

    if (matches(bytes[p + lengthSize])) {
      return true;
    }

    if (length <= 0) {
      return false;
    }

    p += lengthSize + length;
  }

  return false;
}

/**
 * VP9 uncompressed header: a 2-bit frame marker, two profile bits (plus a
 * reserved bit for profile 3), `show_existing_frame`, then `frame_type`, where
 * 0 is a keyframe.
 */
function isVp9Keyframe(bytes: Uint8Array): boolean {
  if (bytes.length === 0) {
    return false;
  }

  const b = bytes[0];
  if (b >> 6 !== 0b10) {
    return false;
  }

  const profile = ((b >> 5) & 1) | (((b >> 4) & 1) << 1);
  let bit = profile === 3 ? 5 : 4;
  const showExistingFrame = (b >> (7 - bit)) & 1;
  if (showExistingFrame) {
    return false;
  }

  bit += 1;
  return ((b >> (7 - bit)) & 1) === 0;
}
