import {
  resourceHintsForArrayBufferViews,
  type DecodedAttributeValue,
  type DecodedOutput,
  type Decoder,
} from "../../../../decoders";
import { bytesField, recordField, rosTimestampNs } from "../ros/common";
import { rosDecodersForPayloads } from "../ros/factory";
import { decodeProtobufMessage } from "./protobuf";
import {
  FOXGLOVE_COMPRESSED_VIDEO_CDR_PAYLOADS,
  FOXGLOVE_COMPRESSED_VIDEO_PAYLOAD,
} from "./payloads";
import {
  optionalRecord,
  optionalString,
  requiredBytes,
} from "./protobuf/records";
import { timingFromContext } from "./protobuf/timing";
import { videoRenderingUnsupportedReason } from "../video-format";

/**
 * Decoder for Foxglove compressed video protobuf messages. Layer 1 makes
 * these topics visible and inspectable, but does not emit renderable video
 * visualizations until the WebCodecs playback layer exists.
 */
export const foxgloveCompressedVideoDecoder: Decoder = {
  id: "foxglove.compressed-video",
  payload: FOXGLOVE_COMPRESSED_VIDEO_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_COMPRESSED_VIDEO_PAYLOAD,
      context,
    );
    return compressedVideoOutput({
      data: requiredBytes(message, "data"),
      format: optionalString(message, "format") ?? "unknown",
      frameId: optionalString(message, "frameId", "frame_id"),
      messageTimestamp: rosTimestampNs(optionalRecord(message, "timestamp")),
      source: "Foxglove CompressedVideo",
      timingContext: context,
    });
  },
};

/**
 * Decoders for Foxglove CompressedVideo messages carried over ROS 2 CDR.
 */
export const foxgloveCompressedVideoCdrDecoders = rosDecodersForPayloads({
  id: "foxglove.compressed-video.cdr",
  map(message, context) {
    return compressedVideoOutput({
      data: bytesField(message, "data"),
      format: optionalString(message, "format") ?? "unknown",
      frameId: optionalString(message, "frame_id", "frameId"),
      messageTimestamp: rosTimestampNs(recordField(message, "timestamp")),
      source: "Foxglove CompressedVideo",
      timingContext: context,
    });
  },
  payloads: FOXGLOVE_COMPRESSED_VIDEO_CDR_PAYLOADS,
});

function compressedVideoOutput({
  data,
  format,
  frameId,
  messageTimestamp,
  source,
  timingContext,
}: {
  readonly data: Uint8Array;
  readonly format: string;
  readonly frameId?: string;
  readonly messageTimestamp?: bigint;
  readonly source: string;
  readonly timingContext: Parameters<typeof timingFromContext>[0];
}): DecodedOutput {
  const attributes: Record<string, DecodedAttributeValue> = {
    byteLength: data.byteLength,
    format,
    unsupportedReason: unsupportedCompressedVideoReason(source, format),
  };

  if (frameId) {
    attributes.frameId = frameId;
  }

  return {
    attributes,
    resourceHints: resourceHintsForArrayBufferViews(data),
    timing: timingFromContext(timingContext, messageTimestamp),
  };
}

function unsupportedCompressedVideoReason(source: string, format: string) {
  return (
    videoRenderingUnsupportedReason(format) ??
    (format.trim()
      ? `${source} format '${format}' is unsupported`
      : `${source} format is missing`)
  );
}
