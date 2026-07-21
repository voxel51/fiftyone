import {
  resourceHintsForArrayBufferViews,
  type DecodeContext,
  type Decoder,
} from "../../../../decoders";
import type { DecodedAttributeValue, DecodedOutput } from "../../../../ir";
import { VISUALIZATION_KIND } from "../../../../ir";
import { rosDecodersForPayloads } from "../ros/factory";
import { decodeProtobufMessage } from "./protobuf";
import {
  FOXGLOVE_COMPRESSED_IMAGE_CDR_PAYLOADS,
  FOXGLOVE_COMPRESSED_IMAGE_PAYLOAD,
} from "./payloads";
import {
  optionalRecord,
  optionalString,
  requiredBytes,
} from "./protobuf/records";
import { timingFromContext, timestampNs } from "./protobuf/timing";
import {
  unsupportedSourceFormatReason,
  unsupportedVideoFormatReason,
  videoCodecFromFormat,
} from "../video-format";

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
    return decodeFoxgloveCompressedImageRecord(message, context);
  },
};

/**
 * Decoders for Foxglove CompressedImage messages carried over ROS 2 CDR.
 */
export const foxgloveCompressedImageCdrDecoders = rosDecodersForPayloads({
  id: "foxglove.compressed-image.cdr",
  map: decodeFoxgloveCompressedImageRecord,
  payloads: FOXGLOVE_COMPRESSED_IMAGE_CDR_PAYLOADS,
});

export function decodeFoxgloveCompressedImageRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
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
}

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
  // Keep Foxglove CompressedImage H.264 as image-only metadata; H.264 rendering
  // is handled by video-specific message types with different expectations.
  if (videoCodecFromFormat(format) === "h264") {
    return unsupportedSourceFormatReason("Foxglove CompressedImage", format);
  }

  return unsupportedVideoFormatReason("Foxglove CompressedImage", format);
}
