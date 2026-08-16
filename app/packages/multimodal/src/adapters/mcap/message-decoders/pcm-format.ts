/**
 * PCM sample formats `foxglove.RawAudio` documents: signed/unsigned
 * integer and float, each at a fixed bit depth. Mirrors `video-format.ts`'s
 * shape (a label + exact-match table), since RawAudio's `format` field is
 * a plain string like the video decoders' `format`.
 */
const PCM_FORMATS = Object.freeze({
  "pcm-u8": { label: "8-bit unsigned PCM", bytesPerSample: 1 },
  "pcm-s16": { label: "16-bit signed PCM", bytesPerSample: 2 },
  "pcm-s32": { label: "32-bit signed PCM", bytesPerSample: 4 },
  "pcm-f32": { label: "32-bit float PCM", bytesPerSample: 4 },
} as const);

export type SupportedPcmFormat = keyof typeof PCM_FORMATS;

/** Normalizes a RawAudio `format` string into a supported PCM format, or `null`. */
export function pcmFormatFromString(format: string): SupportedPcmFormat | null {
  const normalized = format.trim().toLowerCase();
  // `Object.hasOwn`, not `in`: the `in` operator also matches inherited
  // `Object.prototype` keys, so a recorded message with
  // `format: "constructor"` (or "toString"/"valueOf") would be accepted as
  // a supported format, then fall through `samplesFromPcmBytes`' switch and
  // emit a RAW_AUDIO visualization with `samples: undefined`.
  return Object.hasOwn(PCM_FORMATS, normalized)
    ? (normalized as SupportedPcmFormat)
    : null;
}

/** Legible reason a RawAudio message's format can't be decoded. */
export function unsupportedPcmFormatReason(format: string): string {
  const trimmed = format.trim();
  return trimmed
    ? `Foxglove RawAudio format '${trimmed}' is unsupported`
    : "Foxglove RawAudio format is missing";
}

/**
 * Interprets raw little-endian bytes as the typed array matching `format`
 * (Foxglove RawAudio has no endianness field; multi-byte PCM is
 * little-endian by specification, same rule `raw-image.ts` documents for
 * RawImage).
 */
export function samplesFromPcmBytes(
  format: SupportedPcmFormat,
  data: Uint8Array,
): Uint8Array | Int16Array | Int32Array | Float32Array {
  // Views require the underlying buffer to be aligned; `data` is decoder
  // output (freshly sliced from message bytes), so copy defensively rather
  // than assume alignment.
  const bytes = data.slice();
  switch (format) {
    case "pcm-u8":
      return bytes;
    case "pcm-s16":
      return new Int16Array(
        bytes.buffer,
        bytes.byteOffset,
        Math.floor(bytes.byteLength / 2),
      );
    case "pcm-s32":
      return new Int32Array(
        bytes.buffer,
        bytes.byteOffset,
        Math.floor(bytes.byteLength / 4),
      );
    case "pcm-f32":
      return new Float32Array(
        bytes.buffer,
        bytes.byteOffset,
        Math.floor(bytes.byteLength / 4),
      );
  }
}

export function pcmFormatLabel(format: SupportedPcmFormat): string {
  return PCM_FORMATS[format].label;
}
