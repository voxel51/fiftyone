import {
  type Decoder,
  type FrameTransformVisualization,
  type Quat,
  type Vec3,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { decodeProtobufMessage } from "./protobuf";
import { FOXGLOVE_FRAME_TRANSFORM_PAYLOAD } from "./protobuf/payloads";
import { optionalRecord, optionalString } from "./protobuf/records";
import { timestampNs, timingFromContext } from "./protobuf/timing";

/**
 * Decoder for Foxglove FrameTransform protobuf messages. Emits the
 * structured transform as a visualization payload so the TF tree
 * consumer can typed-access it without re-decoding.
 */
export const foxgloveFrameTransformDecoder: Decoder = {
  id: "foxglove.frame-transform",
  payload: FOXGLOVE_FRAME_TRANSFORM_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_FRAME_TRANSFORM_PAYLOAD,
      context
    );

    const parentFrameId =
      optionalString(message, "parentFrameId", "parent_frame_id") ?? "";
    const childFrameId =
      optionalString(message, "childFrameId", "child_frame_id") ?? "";
    const ts = optionalRecord(message, "timestamp");
    const tsNs = ts ? timestampNs(ts) : undefined;
    const translation = decodeVec3(optionalRecord(message, "translation"));
    const rotation = decodeQuat(optionalRecord(message, "rotation"));

    const visualization: FrameTransformVisualization = {
      kind: VISUALIZATION_KIND.FRAME_TRANSFORM,
      parentFrameId,
      childFrameId,
      timestampNs: tsNs ?? 0n,
      translation,
      rotation,
    };

    return {
      attributes: { parent: parentFrameId, child: childFrameId },
      resourceHints: { sizeBytes: bytes.byteLength },
      timing: timingFromContext(context, tsNs),
      visualization,
    };
  },
};

function decodeVec3(record: Record<string, unknown> | undefined): Vec3 {
  if (!record) return [0, 0, 0];
  return [num(record, "x"), num(record, "y"), num(record, "z")];
}

function decodeQuat(record: Record<string, unknown> | undefined): Quat {
  if (!record) return [0, 0, 0, 1];
  return [
    num(record, "x"),
    num(record, "y"),
    num(record, "z"),
    num(record, "w", 1),
  ];
}

function num(
  record: Record<string, unknown>,
  field: string,
  defaultValue = 0
): number {
  const value = record[field];
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return defaultValue;
}
