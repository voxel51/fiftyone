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

    if (frameId) {
      attributes.frameId = frameId;
    }

    return {
      attributes,
      resourceHints: resourceHintsForArrayBufferViews(data),
      timing: timingFromContext(context, messageTimestamp),
      visualization: {
        bytes: data,
        kind: VISUALIZATION_KIND.ENCODED_IMAGE,
        mimeType: mimeTypeFromFormat(format),
      },
    };
  },
};

function mimeTypeFromFormat(format: string): string | undefined {
  const lowerFormat = format.trim().toLowerCase();
  if (!lowerFormat || lowerFormat === "unknown") {
    return undefined;
  }

  const normalized = lowerFormat === "jpg" ? "jpeg" : lowerFormat;
  return normalized.startsWith("image/") ? normalized : `image/${normalized}`;
}
