import {
  resourceHintsForArrayBufferViews,
  type DecodeContext,
  type DecodedAttributeValue,
  type DecodedOutput,
  type Decoder,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { decodeImageRgba } from "../image-encodings";
import {
  bytesField,
  integerField,
  recordField,
  rosTimestampNs,
  stringField,
} from "../ros/common";
import { rosDecodersForPayloads } from "../ros/factory";
import { FOXGLOVE_RAW_IMAGE_CDR_PAYLOADS } from "./payloads";
import { decodeProtobufMessage } from "./protobuf";
import { FOXGLOVE_RAW_IMAGE_PAYLOAD } from "./protobuf/payloads";
import {
  numberField,
  optionalRecord,
  optionalString,
  requiredBytes,
} from "./protobuf/records";
import { timestampNs, timingFromContext } from "./protobuf/timing";

/**
 * Decoder for Foxglove RawImage protobuf messages.
 */
export const foxgloveRawImageDecoder: Decoder = {
  id: "foxglove.raw-image",
  payload: FOXGLOVE_RAW_IMAGE_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_RAW_IMAGE_PAYLOAD,
      context,
    );
    return rawImageOutput({
      data: requiredBytes(message, "data"),
      encoding: optionalString(message, "encoding") ?? "unknown",
      frameId: optionalString(message, "frameId", "frame_id"),
      height: numberField(message, "height"),
      messageTimestamp: timestampNs(optionalRecord(message, "timestamp")),
      step: numberField(message, "step"),
      timingContext: context,
      width: numberField(message, "width"),
    });
  },
};

/**
 * Decoders for Foxglove RawImage messages carried over ROS 2 CDR.
 */
export const foxgloveRawImageCdrDecoders = rosDecodersForPayloads({
  id: "foxglove.raw-image.cdr",
  map(message, context) {
    return rawImageOutput({
      data: bytesField(message, "data"),
      encoding: stringField(message, "encoding", "unknown"),
      frameId: stringField(message, "frame_id") || undefined,
      height: integerField(message, "height"),
      messageTimestamp: rosTimestampNs(recordField(message, "timestamp")),
      step: integerField(message, "step"),
      timingContext: context,
      width: integerField(message, "width"),
    });
  },
  payloads: FOXGLOVE_RAW_IMAGE_CDR_PAYLOADS,
});

function rawImageOutput({
  data,
  encoding,
  frameId,
  height,
  messageTimestamp,
  step,
  timingContext,
  width,
}: {
  readonly data: Uint8Array;
  readonly encoding: string;
  readonly frameId?: string;
  readonly height: number;
  readonly messageTimestamp?: bigint;
  readonly step: number;
  readonly timingContext: DecodeContext;
  readonly width: number;
}): DecodedOutput {
  const baseAttributes: Record<string, DecodedAttributeValue> = {
    byteLength: data.byteLength,
    encoding,
    height,
    step,
    width,
  };
  if (frameId) {
    baseAttributes.frameId = frameId;
  }

  const timing = timingFromContext(timingContext, messageTimestamp);
  // Foxglove RawImage has no endianness field; multi-byte encodings are
  // little-endian by specification.
  const result = decodeImageRgba({
    bigEndian: false,
    data,
    encoding,
    height,
    sourceLabel: "Foxglove RawImage",
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
      resourceHints: resourceHintsForArrayBufferViews(data),
      timing,
    };
  }

  return {
    attributes,
    resourceHints: resourceHintsForArrayBufferViews(result.rgba),
    timing,
    visualization: {
      ...(frameId ? { coordinateFrameId: frameId } : {}),
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
