const VIDEO_FORMATS = Object.freeze({
  av1: {
    exact: ["av1"],
    label: "AV1",
    prefixes: ["av01"],
  },
  h264: {
    exact: ["h264", "h.264", "avc"],
    label: "H.264",
    prefixes: ["avc"],
  },
  h265: {
    exact: ["h265", "h.265", "hevc"],
    label: "H.265",
    prefixes: ["hev", "hvc"],
  },
  vp9: {
    exact: ["vp9"],
    label: "VP9",
    prefixes: ["vp09"],
  },
} as const);

type SupportedVideoFormat = keyof typeof VIDEO_FORMATS;
type VideoFormatDefinition = (typeof VIDEO_FORMATS)[keyof typeof VIDEO_FORMATS];
const VIDEO_FORMAT_ENTRIES = Object.entries(VIDEO_FORMATS) as Array<
  readonly [SupportedVideoFormat, VideoFormatDefinition]
>;

/**
 * Returns a legible unsupported-rendering reason for known video codecs.
 */
export function videoRenderingUnsupportedReason(
  format: string,
): string | undefined {
  const videoFormat = videoCodecFromFormat(format);
  return videoFormat
    ? `${VIDEO_FORMATS[videoFormat].label} video rendering not yet supported`
    : undefined;
}

/**
 * Returns a source-specific unsupported-format reason with a shared fallback
 * for known-but-unrenderable video codecs.
 */
export function unsupportedVideoFormatReason(
  source: string,
  format: string,
): string {
  return (
    videoRenderingUnsupportedReason(format) ??
    unsupportedSourceFormatReason(source, format)
  );
}

/**
 * Returns the generic source-specific unsupported-format reason.
 */
export function unsupportedSourceFormatReason(
  source: string,
  format: string,
): string {
  const trimmed = format.trim();
  return trimmed
    ? `${source} format '${trimmed}' is unsupported`
    : `${source} format is missing`;
}

/**
 * Normalizes source format strings into the video codecs the adapter can
 * reason about.
 */
export function videoCodecFromFormat(
  format: string,
): SupportedVideoFormat | null {
  const normalized = format.trim().toLowerCase();
  return (
    normalized
      .split(/[^a-z0-9.]+/)
      .map(videoCodecFromToken)
      .find((codec): codec is SupportedVideoFormat => codec !== null) ?? null
  );
}

function videoCodecFromToken(token: string): SupportedVideoFormat | null {
  for (const [codec, definition] of VIDEO_FORMAT_ENTRIES) {
    if (definition.exact.some((exact) => exact === token)) {
      return codec;
    }
    if (definition.prefixes.some((prefix) => token.startsWith(prefix))) {
      return codec;
    }
  }

  return null;
}
