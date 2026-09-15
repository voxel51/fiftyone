/**
 * Annex B byte-stream framing, shared by the H.264 and HEVC paths. Both carry
 * length-prefixed NAL units inside ISO BMFF samples and both need start-code
 * framing plus in-band parameter sets once a WebCodecs decoder is configured
 * without an out-of-band description.
 */

const START_CODE_LENGTH = 4;

/** Frames raw NAL units — a container's codec record — as one Annex B blob. */
export function annexBFromNalUnits(
  units: readonly Uint8Array[],
): Uint8Array | undefined {
  const present = units.filter((unit) => unit.byteLength > 0);
  if (present.length === 0) return undefined;
  const output = new Uint8Array(
    present.reduce(
      (length, unit) => length + START_CODE_LENGTH + unit.byteLength,
      0,
    ),
  );
  let offset = 0;
  for (const unit of present) {
    output.set([0, 0, 0, 1], offset);
    offset += START_CODE_LENGTH;
    output.set(unit, offset);
    offset += unit.byteLength;
  }
  return output;
}

/** Joins Annex B blobs that already carry their own start codes. */
export function concatAnnexB(
  chunks: readonly (Uint8Array | undefined)[],
): Uint8Array {
  const present = chunks.filter(
    (chunk): chunk is Uint8Array => chunk !== undefined && chunk.byteLength > 0,
  );
  if (present.length === 1) return present[0];
  const output = new Uint8Array(
    present.reduce((length, chunk) => length + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of present) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
