/**
 * Lightweight facts extracted from one Annex-B H.264 access unit.
 */
export interface H264AnnexBAccessUnitInfo {
  readonly codecString?: string;
  readonly hasBFrames: boolean;
  readonly hasFrame: boolean;
  readonly hasStartCodes: boolean;
  readonly keyframe: boolean;
  readonly nalUnitTypes: readonly number[];
  readonly pps?: Uint8Array;
  readonly sps?: Uint8Array;
}

const H264_NAL_TYPE_CODED_SLICE_NON_IDR = 1;
const H264_NAL_TYPE_CODED_SLICE_IDR = 5;
const H264_NAL_TYPE_SPS = 7;
const H264_NAL_TYPE_PPS = 8;

/**
 * Lightweight Annex-B H.264 access-unit inspection. This is deliberately not a
 * full parser; it only extracts facts needed to decide whether WebCodecs can
 * try the frame without allowing known-bad B-frame streams into playback.
 */
export function analyzeH264AnnexBAccessUnit(
  bytes: Uint8Array,
): H264AnnexBAccessUnitInfo {
  const nalUnits = h264AnnexBNalUnits(bytes);
  let codecString: string | undefined;
  let hasBFrames = false;
  let hasFrame = false;
  let keyframe = false;
  let pps: Uint8Array | undefined;
  let sps: Uint8Array | undefined;
  const nalUnitTypes: number[] = [];

  for (const nal of nalUnits.units) {
    if (nal.byteLength === 0) continue;
    const nalType = nal[0] & 0x1f;
    nalUnitTypes.push(nalType);

    if (nalType === H264_NAL_TYPE_SPS) {
      sps = copyBytes(nal);
      codecString = codecStringFromSps(nal) ?? codecString;
    } else if (nalType === H264_NAL_TYPE_PPS) {
      pps = copyBytes(nal);
    } else if (nalType === H264_NAL_TYPE_CODED_SLICE_IDR) {
      hasFrame = true;
      keyframe = true;
      hasBFrames = isBFrameSlice(nal) || hasBFrames;
    } else if (nalType === H264_NAL_TYPE_CODED_SLICE_NON_IDR) {
      hasFrame = true;
      hasBFrames = isBFrameSlice(nal) || hasBFrames;
    }
  }

  return {
    codecString,
    hasBFrames,
    hasFrame,
    hasStartCodes: nalUnits.hasStartCodes,
    keyframe,
    nalUnitTypes,
    pps,
    sps,
  };
}

/**
 * Prepends remembered SPS/PPS parameter sets when a delta frame omits them.
 */
export function h264AccessUnitWithParameterSets({
  bytes,
  pps,
  sps,
}: {
  readonly bytes: Uint8Array;
  readonly pps?: Uint8Array;
  readonly sps?: Uint8Array;
}): Uint8Array {
  if (!sps && !pps) {
    return bytes;
  }

  const chunks = [sps, pps, bytes].filter(
    (chunk): chunk is Uint8Array => chunk !== undefined,
  );
  const startCodeLength = 4;
  const totalLength = chunks.reduce(
    (length, chunk) =>
      length +
      chunk.byteLength +
      (hasLeadingStartCode(chunk) ? 0 : startCodeLength),
    0,
  );
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    if (!hasLeadingStartCode(chunk)) {
      output.set([0, 0, 0, 1], offset);
      offset += startCodeLength;
    }
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function h264AnnexBNalUnits(bytes: Uint8Array): {
  readonly hasStartCodes: boolean;
  readonly units: readonly Uint8Array[];
} {
  const units: Uint8Array[] = [];
  let current = findStartCode(bytes, 0);
  if (!current) {
    return {
      hasStartCodes: false,
      units: bytes.byteLength > 0 ? [bytes] : [],
    };
  }

  while (current) {
    const dataStart = current.index + current.length;
    const next = findStartCode(bytes, dataStart);
    const dataEnd = trimTrailingZeros(
      bytes,
      dataStart,
      next?.index ?? bytes.byteLength,
    );
    if (dataEnd > dataStart) {
      units.push(bytes.subarray(dataStart, dataEnd));
    }
    current = next;
  }

  return {
    hasStartCodes: true,
    units,
  };
}

function findStartCode(
  bytes: Uint8Array,
  from: number,
): { readonly index: number; readonly length: 3 | 4 } | null {
  for (
    let index = Math.max(0, from);
    index + 3 <= bytes.byteLength;
    index += 1
  ) {
    if (bytes[index] !== 0 || bytes[index + 1] !== 0) {
      continue;
    }
    if (bytes[index + 2] === 1) {
      return { index, length: 3 };
    }
    if (
      index + 4 <= bytes.byteLength &&
      bytes[index + 2] === 0 &&
      bytes[index + 3] === 1
    ) {
      return { index, length: 4 };
    }
  }

  return null;
}

function trimTrailingZeros(
  bytes: Uint8Array,
  start: number,
  end: number,
): number {
  let trimmedEnd = end;
  while (trimmedEnd > start && bytes[trimmedEnd - 1] === 0) {
    trimmedEnd -= 1;
  }
  return trimmedEnd;
}

function codecStringFromSps(sps: Uint8Array): string | undefined {
  if (sps.byteLength < 4) {
    return undefined;
  }

  return `avc1.${hexByte(sps[1])}${hexByte(sps[2])}${hexByte(sps[3])}`;
}

function hexByte(value: number): string {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function isBFrameSlice(nal: Uint8Array): boolean {
  try {
    const rbsp = removeEmulationPreventionBytes(nal.subarray(1));
    const reader = new BitReader(rbsp);
    reader.readUnsignedExpGolomb(); // first_mb_in_slice
    const sliceType = reader.readUnsignedExpGolomb();
    return sliceType % 5 === 1;
  } catch {
    return false;
  }
}

function removeEmulationPreventionBytes(bytes: Uint8Array): Uint8Array {
  const output: number[] = [];
  let zeroCount = 0;

  for (const byte of bytes) {
    if (zeroCount >= 2 && byte === 0x03) {
      zeroCount = 0;
      continue;
    }
    output.push(byte);
    zeroCount = byte === 0 ? zeroCount + 1 : 0;
  }

  return Uint8Array.from(output);
}

function hasLeadingStartCode(bytes: Uint8Array): boolean {
  return (
    (bytes.byteLength >= 3 &&
      bytes[0] === 0 &&
      bytes[1] === 0 &&
      bytes[2] === 1) ||
    (bytes.byteLength >= 4 &&
      bytes[0] === 0 &&
      bytes[1] === 0 &&
      bytes[2] === 0 &&
      bytes[3] === 1)
  );
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

class BitReader {
  private bitOffset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  readUnsignedExpGolomb(): number {
    let leadingZeros = 0;
    while (this.readBit() === 0) {
      leadingZeros += 1;
      if (leadingZeros > 31) {
        throw new Error("Exp-Golomb code is too large");
      }
    }

    let value = (1 << leadingZeros) - 1;
    for (let index = 0; index < leadingZeros; index += 1) {
      value += this.readBit() << (leadingZeros - index - 1);
    }

    return value;
  }

  private readBit(): number {
    if (this.bitOffset >= this.bytes.byteLength * 8) {
      throw new Error("Unexpected end of H.264 slice header");
    }

    const byte = this.bytes[this.bitOffset >> 3];
    const bit = (byte >> (7 - (this.bitOffset & 7))) & 1;
    this.bitOffset += 1;
    return bit;
  }
}
