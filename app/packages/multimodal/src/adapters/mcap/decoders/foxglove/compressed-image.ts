import {
  resourceHintsForArrayBufferViews,
  type DecodedAttributeValue,
  type Decoder,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { decodeProtobufMessage } from "./protobuf";
import { FOXGLOVE_COMPRESSED_IMAGE_PAYLOAD } from "./protobuf/payloads";
import {
  optionalRecord,
  optionalString,
  requiredBytes,
} from "./protobuf/records";
import { timingFromContext, timestampNs } from "./protobuf/timing";
import { videoRenderingUnsupportedReason } from "../video-format";

/**
 * Decoder for Foxglove compressed image protobuf messages.
 */
export const foxgloveCompressedImageDecoder: Decoder = {
  id: "foxglove.compressed-image",
  payload: FOXGLOVE_COMPRESSED_IMAGE_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_COMPRESSED_IMAGE_PAYLOAD,
      context,
    );
    const data = requiredBytes(message, "data");
    const format = optionalString(message, "format") ?? "unknown";
    const frameId = optionalString(message, "frameId", "frame_id");
    const messageTimestamp = timestampNs(optionalRecord(message, "timestamp"));
    const attributes: Record<string, DecodedAttributeValue> = {
      byteLength: data.byteLength,
      format,
    };
    const mimeType = mimeTypeFromFormat(format);
    const unsupportedReason =
      mimeType === null ? unsupportedImageReason(format) : undefined;

    if (frameId) {
      attributes.frameId = frameId;
    }

    if (unsupportedReason) {
      attributes.unsupportedReason = unsupportedReason;
      return {
        attributes,
        resourceHints: resourceHintsForArrayBufferViews(data),
        timing: timingFromContext(context, messageTimestamp),
      };
    }

    return {
      attributes,
      resourceHints: resourceHintsForArrayBufferViews(data),
      timing: timingFromContext(context, messageTimestamp),
      visualization: {
        bytes: data,
        kind: VISUALIZATION_KIND.ENCODED_IMAGE,
        mimeType: mimeType ?? undefined,
      },
    };
  },
};

function mimeTypeFromFormat(format: string): string | null | undefined {
  const lowerFormat = format.trim().toLowerCase();
  if (!lowerFormat || lowerFormat === "unknown") {
    return undefined;
  }

  const normalized = lowerFormat.startsWith("image/")
    ? lowerFormat.slice("image/".length)
    : lowerFormat;
  const imageFormat = normalized === "jpg" ? "jpeg" : normalized;

  switch (imageFormat) {
    case "avif":
    case "jpeg":
    case "png":
    case "webp":
      return `image/${imageFormat}`;
    default:
      return null;
  }
}

function unsupportedImageReason(format: string): string {
  return (
    videoRenderingUnsupportedReason(format) ??
    `Foxglove CompressedImage format '${format}' is unsupported`
  );
}
