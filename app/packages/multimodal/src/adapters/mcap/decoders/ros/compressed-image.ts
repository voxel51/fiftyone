import {
  resourceHintsForArrayBufferViews,
  type DecodeContext,
} from "../../../../decoders";
import type {
  DecodedAttributeValue,
  DecodedOutput,
  EncodedVideoVisualization,
} from "../../../../ir";
import { VISUALIZATION_KIND } from "../../../../ir";
import {
  bytesField,
  rosHeader,
  rosHeaderAttributes,
  rosHeaderFrameId,
  rosHeaderTimestampNs,
  stringField,
  timingFromRosHeader,
} from "./common";
import { rosDecodersForPayloads } from "./factory";
import { ROS_COMPRESSED_IMAGE_PAYLOADS } from "./payloads";
import { analyzeH264AnnexBAccessUnit } from "../../../../codecs/h264-annexb";
import {
  videoCodecFromFormat,
  videoRenderingUnsupportedReason,
} from "../video-format";

/**
 * Decoders for ROS CompressedImage messages.
 */
export const rosCompressedImageDecoders = rosDecodersForPayloads({
  id: "ros.compressed-image",
  map: decodeRosCompressedImageRecord,
  payloads: ROS_COMPRESSED_IMAGE_PAYLOADS,
});

/**
 * Normalizes a decoded ROS CompressedImage record into image/video output.
 */
export function decodeRosCompressedImageRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const header = rosHeader(message);
  const data = bytesField(message, "data");
  const format = stringField(message, "format", "unknown");
  const timing = timingFromRosHeader(context, header);
  const attributes: Record<string, DecodedAttributeValue> = {
    ...rosHeaderAttributes(header),
    byteLength: data.byteLength,
    format,
  };
  const mimeType = mimeTypeFromRosCompressedImageFormat(format);

  if (!mimeType) {
    const codec = videoCodecFromFormat(format);
    if (codec === "h264") {
      return h264CompressedImageOutput({
        attributes,
        data,
        format,
        frameId: rosHeaderFrameId(header),
        timestampNs: rosHeaderTimestampNs(header),
        timing,
      });
    }

    return unsupportedCompressedImageOutput({
      attributes,
      data,
      reason: unsupportedCompressedImageReason(format),
      timing,
    });
  }

  return {
    attributes,
    resourceHints: resourceHintsForArrayBufferViews(data),
    timing,
    visualization: {
      bytes: data,
      kind: VISUALIZATION_KIND.ENCODED_IMAGE,
      mimeType,
    },
  };
}

function h264CompressedImageOutput({
  attributes,
  data,
  format,
  frameId,
  timestampNs,
  timing,
}: {
  readonly attributes: Record<string, DecodedAttributeValue>;
  readonly data: Uint8Array;
  readonly format: string;
  readonly frameId?: string;
  readonly timestampNs?: bigint;
  readonly timing: ReturnType<typeof timingFromRosHeader>;
}): DecodedOutput {
  const h264 = analyzeH264AnnexBAccessUnit(data);
  if (!h264.hasStartCodes) {
    return unsupportedCompressedImageOutput({
      attributes,
      data,
      reason: "H.264 video requires Annex-B NAL start codes",
      timing,
    });
  }

  if (!h264.hasFrame) {
    return unsupportedCompressedImageOutput({
      attributes,
      data,
      reason: "H.264 video requires frame NAL units",
      timing,
    });
  }

  if (h264.hasBFrames) {
    return unsupportedCompressedImageOutput({
      attributes,
      data,
      reason: "H.264 video streams with B-frames are unsupported",
      timing,
    });
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
    format,
    h264: {
      ...(h264.codecString ? { codecString: h264.codecString } : {}),
      hasFrame: h264.hasFrame,
      ...(h264.pps ? { pps: h264.pps } : {}),
      ...(h264.sps ? { sps: h264.sps } : {}),
    },
    keyframe: h264.keyframe,
    kind: VISUALIZATION_KIND.ENCODED_VIDEO,
    ...(timestampNs !== undefined ? { timestampNs } : {}),
  } satisfies EncodedVideoVisualization;

  return {
    attributes,
    resourceHints: resourceHintsForArrayBufferViews(data),
    timing,
    visualization,
  };
}

function unsupportedCompressedImageOutput({
  attributes,
  data,
  reason,
  timing,
}: {
  readonly attributes: Record<string, DecodedAttributeValue>;
  readonly data: Uint8Array;
  readonly reason: string;
  readonly timing: ReturnType<typeof timingFromRosHeader>;
}): DecodedOutput {
  attributes.unsupportedReason = reason;
  return {
    attributes,
    resourceHints: resourceHintsForArrayBufferViews(data),
    timing,
  };
}

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
