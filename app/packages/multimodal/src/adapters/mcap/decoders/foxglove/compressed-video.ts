import {
  resourceHintsForArrayBufferViews,
  type DecodedAttributeValue,
  type DecodedOutput,
  type Decoder,
  type EncodedVideoVisualization,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../ir";
import { bytesField, recordField, rosTimestampNs } from "../ros/common";
import { rosDecodersForPayloads } from "../ros/factory";
import { analyzeH264AnnexBAccessUnit } from "../../../../utils/h264-annexb";
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
import {
  unsupportedVideoFormatReason,
  videoCodecFromFormat,
} from "../video-format";

/**
 * Decoder for Foxglove compressed video protobuf messages.
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
      format: optionalString(message, "format"),
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
      format: optionalString(message, "format"),
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
  readonly format?: string;
  readonly frameId?: string;
  readonly messageTimestamp?: bigint;
  readonly source: string;
  readonly timingContext: Parameters<typeof timingFromContext>[0];
}): DecodedOutput {
  const rawFormatForReason = format ?? "";
  const displayFormat = format?.trim() ? format : "unknown";
  const attributes: Record<string, DecodedAttributeValue> = {
    byteLength: data.byteLength,
    format: displayFormat,
  };
  const codec = videoCodecFromFormat(rawFormatForReason);

  if (frameId) {
    attributes.frameId = frameId;
  }

  const metadataOnlyOutput = (reason: string): DecodedOutput => {
    attributes.unsupportedReason = reason;
    return {
      attributes,
      resourceHints: resourceHintsForArrayBufferViews(data),
      timing: timingFromContext(timingContext, messageTimestamp),
    };
  };

  if (codec !== "h264") {
    // Keep missing raw formats available to unsupportedSourceFormatReason while
    // attributes use a display fallback.
    return metadataOnlyOutput(
      unsupportedVideoFormatReason(source, rawFormatForReason),
    );
  }

  const h264 = analyzeH264AnnexBAccessUnit(data);
  if (!h264.hasStartCodes) {
    return metadataOnlyOutput("H.264 video requires Annex-B NAL start codes");
  }

  if (!h264.hasFrame) {
    return metadataOnlyOutput("H.264 video requires frame NAL units");
  }

  if (h264.hasBFrames) {
    return metadataOnlyOutput(
      "H.264 video streams with B-frames are unsupported",
    );
  }

  attributes.codec = "h264";
  attributes.keyframe = h264.keyframe;
  if (h264.codecString) {
    attributes.codecString = h264.codecString;
  }

  const visualization = {
    bytes: data,
    codec: "h264",
    ...(frameId ? { coordinateFrameId: frameId } : {}),
    format: displayFormat,
    h264: {
      ...(h264.codecString ? { codecString: h264.codecString } : {}),
      hasFrame: h264.hasFrame,
      ...(h264.pps ? { pps: h264.pps } : {}),
      ...(h264.sps ? { sps: h264.sps } : {}),
    },
    keyframe: h264.keyframe,
    kind: VISUALIZATION_KIND.ENCODED_VIDEO,
    ...(messageTimestamp !== undefined
      ? { timestampNs: messageTimestamp }
      : {}),
  } satisfies EncodedVideoVisualization;

  return {
    attributes,
    resourceHints: resourceHintsForArrayBufferViews(data),
    timing: timingFromContext(timingContext, messageTimestamp),
    visualization,
  };
}
