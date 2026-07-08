import {
  resourceHintsForArrayBufferViews,
  type DecodedAttributeValue,
  type DecodedOutput,
  type EncodedVideoVisualization,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
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
import { analyzeH264AnnexBAccessUnit } from "../../../../utils/h264-annexb";
import {
  videoCodecFromFormat,
  videoRenderingUnsupportedReason,
} from "../video-format";

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
      const codec = videoCodecFromFormat(format);
      if (codec === "h264") {
        return h264CompressedImageOutput({
          attributes,
          data,
          format,
          frameId: rosHeaderFrameId(header),
          timestampNs: rosHeaderTimestampNs(header),
          timing: timingFromRosHeader(context, header),
        });
      }

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
    attributes.unsupportedReason =
      "H.264 video requires Annex-B NAL start codes";
    return {
      attributes,
      resourceHints: resourceHintsForArrayBufferViews(data),
      timing,
    };
  }

  if (h264.hasBFrames) {
    attributes.unsupportedReason =
      "H.264 video streams with B-frames are unsupported";
    return {
      attributes,
      resourceHints: resourceHintsForArrayBufferViews(data),
      timing,
    };
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
