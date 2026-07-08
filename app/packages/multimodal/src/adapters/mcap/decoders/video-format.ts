const VIDEO_FORMAT_LABELS = Object.freeze({
  av1: "AV1",
  h264: "H.264",
  h265: "H.265",
  vp9: "VP9",
} as const);

type SupportedVideoFormat = keyof typeof VIDEO_FORMAT_LABELS;

/**
 * Returns a legible Layer-1 reason for known video codecs.
 */
export function videoRenderingUnsupportedReason(
  format: string,
): string | undefined {
  const videoFormat = normalizedVideoFormat(format);
  return videoFormat
    ? `${VIDEO_FORMAT_LABELS[videoFormat]} video rendering not yet supported`
    : undefined;
}

function normalizedVideoFormat(format: string): SupportedVideoFormat | null {
  switch (format.trim().toLowerCase()) {
    case "av1":
      return "av1";
    case "h264":
    case "h.264":
    case "avc":
      return "h264";
    case "h265":
    case "h.265":
    case "hevc":
      return "h265";
    case "vp9":
      return "vp9";
    default:
      return null;
  }
}
