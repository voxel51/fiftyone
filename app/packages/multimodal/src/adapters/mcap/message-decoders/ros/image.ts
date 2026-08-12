import type { DecodeContext } from "../../../../decoders/index";
import type { DecodedOutput } from "../../../../ir/index";
import { buildNormalizedRawImageOutput } from "../normalized-image";
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
  return buildNormalizedRawImageOutput({
    attributes: {
      ...rosHeaderAttributes(header),
      bigEndian,
    },
    bigEndian,
    coordinateFrameId: frameId,
    data,
    encoding,
    height,
    messageTimestamp,
    retainUnsupportedData: false,
    sourceLabel: "ROS Image",
    step,
    timing: timingFromRosHeader(context, header),
    width,
  });
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
