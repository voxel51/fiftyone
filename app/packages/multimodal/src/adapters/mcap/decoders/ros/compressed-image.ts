import {
  resourceHintsForArrayBufferViews,
  type DecodedAttributeValue,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import {
  bytesField,
  rosHeader,
  rosHeaderAttributes,
  stringField,
  timingFromRosHeader,
} from "./common";
import { rosDecodersForPayloads } from "./factory";
import { ROS_COMPRESSED_IMAGE_PAYLOADS } from "./payloads";
import { videoRenderingUnsupportedReason } from "../video-format";

/**
 * Decoders for ROS CompressedImage messages.
 */
export const rosCompressedImageDecoders = rosDecodersForPayloads({
  id: "ros.compressed-image",
  map(message, context) {
    const header = rosHeader(message);
    const data = bytesField(message, "data");
    const format = stringField(message, "format", "unknown");
    const attributes: Record<string, DecodedAttributeValue> = {
      ...rosHeaderAttributes(header),
      byteLength: data.byteLength,
      format,
    };
    const mimeType = mimeTypeFromRosCompressedImageFormat(format);

    if (!mimeType) {
      attributes.unsupportedReason = unsupportedCompressedImageReason(format);
      return {
        attributes,
        resourceHints: resourceHintsForArrayBufferViews(data),
        timing: timingFromRosHeader(context, header),
      };
    }

    return {
      attributes,
      resourceHints: resourceHintsForArrayBufferViews(data),
      timing: timingFromRosHeader(context, header),
      visualization: {
        bytes: data,
        kind: VISUALIZATION_KIND.ENCODED_IMAGE,
        mimeType,
      },
    };
  },
  payloads: ROS_COMPRESSED_IMAGE_PAYLOADS,
});

function mimeTypeFromRosCompressedImageFormat(
  format: string,
): string | undefined {
  const lowerFormat = format.trim().toLowerCase();
  if (
    !lowerFormat ||
    lowerFormat === "unknown" ||
    lowerFormat.includes("compresseddepth")
  ) {
    return undefined;
  }

  if (lowerFormat.startsWith("image/")) {
    return lowerFormat;
  }
  if (lowerFormat.includes("jpeg") || lowerFormat.includes("jpg")) {
    return "image/jpeg";
  }
  if (lowerFormat.includes("png")) {
    return "image/png";
  }

  return undefined;
}

function unsupportedCompressedImageReason(format: string): string {
  return (
    videoRenderingUnsupportedReason(format) ??
    `ROS CompressedImage format '${format}' is unsupported`
  );
}
