import type {
  DecodeContext,
  DecodedAttributeValue,
  DecodedOutput,
} from "../../../../decoders";
import { resourceHintsForArrayBufferViews } from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { decodeImageRgba } from "../image-encodings";
import {
  bytesField,
  integerField,
  numberField,
  optionalBoolean,
  rosHeader,
  rosHeaderAttributes,
  rosHeaderFrameId,
  rosHeaderTimestampNs,
  stringField,
  timingFromRosHeader,
} from "./common";
import { rosDecodersForPayloads } from "./factory";
import { ROS_IMAGE_PAYLOADS } from "./payloads";

/**
 * Decoders for ROS Image messages.
 */
export const rosImageDecoders = rosDecodersForPayloads({
  id: "ros.image",
  map: decodeRosImageRecord,
  payloads: ROS_IMAGE_PAYLOADS,
});

/**
 * Normalizes a decoded ROS Image record into raw image output.
 */
export function decodeRosImageRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const header = rosHeader(message);
  const frameId = rosHeaderFrameId(header);
  const messageTimestamp = rosHeaderTimestampNs(header);
  const width = integerField(message, "width");
  const height = integerField(message, "height");
  const step = integerField(message, "step");
  const encoding = stringField(message, "encoding", "unknown");
  const data = bytesField(message, "data");
  const bigEndian = booleanLikeField(message, "is_bigendian");
  const baseAttributes: Record<string, DecodedAttributeValue> = {
    ...rosHeaderAttributes(header),
    bigEndian,
    byteLength: data.byteLength,
    encoding,
    height,
    step,
    width,
  };
  const timing = timingFromRosHeader(context, header);
  const result = decodeImageRgba({
    bigEndian,
    data,
    encoding,
    height,
    sourceLabel: "ROS Image",
    step,
    width,
  });
  const attributes = {
    ...baseAttributes,
    ...result.attributes,
    ...(result.unsupportedReason
      ? { unsupportedReason: result.unsupportedReason }
      : {}),
  };

  if (!result.rgba) {
    return {
      attributes,
      timing,
    };
  }

  return {
    attributes,
    resourceHints: resourceHintsForArrayBufferViews(
      result.rgba,
      ...(result.depth ? [result.depth.values] : []),
    ),
    timing,
    visualization: {
      ...(frameId ? { coordinateFrameId: frameId } : {}),
      ...(result.depth ? { depth: result.depth } : {}),
      height,
      kind: VISUALIZATION_KIND.RAW_IMAGE,
      rgba: result.rgba,
      sourceEncoding: encoding,
      ...(messageTimestamp !== undefined
        ? { timestampNs: messageTimestamp }
        : {}),
      width,
    },
  };
}

function booleanLikeField(
  record: Record<string, unknown>,
  field: string,
): boolean {
  const booleanValue = optionalBoolean(record, field);
  if (booleanValue !== undefined) {
    return booleanValue;
  }

  return numberField(record, field, undefined, 0) !== 0;
}
