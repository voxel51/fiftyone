import type {
  DecodedAttributeValue,
  Decoder,
  LocationVisualization,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { decodeProtobufMessage } from "./protobuf";
import { FOXGLOVE_LOCATION_FIX_PAYLOAD } from "./protobuf/payloads";
import { optionalRecord, optionalString } from "./protobuf/records";
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
    const latitude = numberField(message, "latitude");
    const longitude = numberField(message, "longitude");
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("Location fix has no finite latitude/longitude");
    }

    const altitude = numberField(message, "altitude");
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
      ...(altitude !== 0 ? { altitude } : {}),
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
  },
};

function covariance(value: unknown): readonly number[] | undefined {
  if (!Array.isArray(value) || value.length !== COVARIANCE_LENGTH) {
    return undefined;
  }

  const values = value.map((entry) =>
    typeof entry === "number" ? entry : Number.NaN,
  );
  return values.every((entry) => Number.isFinite(entry)) ? values : undefined;
}

function numberField(
  record: Record<string, unknown>,
  field: string,
  defaultValue = 0,
): number {
  const value = record[field];
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return defaultValue;
}
