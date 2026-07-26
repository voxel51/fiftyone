import type {
  DecodeContext,
  DecodedAttributeValue,
  DecodedOutput,
  Decoder,
  LocationVisualization,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { rosDecodersForPayloads } from "../ros/factory";
import { decodeProtobufMessage } from "./protobuf";
import {
  FOXGLOVE_LOCATION_FIX_CDR_PAYLOADS,
  FOXGLOVE_LOCATION_FIX_PAYLOAD,
} from "./payloads";
import {
  numberField,
  optionalRecord,
  optionalString,
} from "./protobuf/records";
import { timingFromContext, timestampNs } from "./protobuf/timing";

const COVARIANCE_LENGTH = 9;

/**
 * Decoder for Foxglove LocationFix protobuf messages. Emits a geographic
 * fix for telemetry readouts and future map panels.
 */
export const foxgloveLocationFixDecoder: Decoder = {
  id: "foxglove.location-fix",
  payload: FOXGLOVE_LOCATION_FIX_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_LOCATION_FIX_PAYLOAD,
      context,
    );
    return decodeFoxgloveLocationFixRecord(message, context);
  },
};

/**
 * Decoders for Foxglove LocationFix messages carried over ROS 2 CDR.
 */
export const foxgloveLocationFixCdrDecoders = rosDecodersForPayloads({
  id: "foxglove.location-fix.cdr",
  map: decodeFoxgloveLocationFixRecord,
  payloads: FOXGLOVE_LOCATION_FIX_CDR_PAYLOADS,
});

export function decodeFoxgloveLocationFixRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const latitude = numberField(message, "latitude", undefined, Number.NaN);
  const longitude = numberField(message, "longitude", undefined, Number.NaN);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Location fix has no finite latitude/longitude");
  }

  const hasAltitude =
    message.altitude !== undefined && message.altitude !== null;
  const altitude = hasAltitude
    ? numberField(message, "altitude", undefined, Number.NaN)
    : undefined;
  const frameId = optionalString(message, "frameId", "frame_id");
  const messageTimestamp = timestampNs(optionalRecord(message, "timestamp"));
  const positionCovariance = covariance(
    message["positionCovariance"] ?? message["position_covariance"],
  );

  const attributes: Record<string, DecodedAttributeValue> = {
    latitude,
    longitude,
  };
  if (frameId) {
    attributes.frameId = frameId;
  }

  const visualization: LocationVisualization = {
    ...(altitude !== undefined && Number.isFinite(altitude)
      ? { altitude }
      : {}),
    ...(frameId ? { coordinateFrameId: frameId } : {}),
    kind: VISUALIZATION_KIND.LOCATION,
    latitude,
    longitude,
    ...(positionCovariance ? { positionCovariance } : {}),
    ...(messageTimestamp !== undefined
      ? { timestampNs: messageTimestamp }
      : {}),
  };

  return {
    attributes,
    timing: timingFromContext(context, messageTimestamp),
    visualization,
  };
}

function covariance(value: unknown): readonly number[] | undefined {
  if (!Array.isArray(value) || value.length !== COVARIANCE_LENGTH) {
    return undefined;
  }

  const values = value.map((entry) =>
    typeof entry === "number" ? entry : Number.NaN,
  );
  return values.every((entry) => Number.isFinite(entry)) ? values : undefined;
}
