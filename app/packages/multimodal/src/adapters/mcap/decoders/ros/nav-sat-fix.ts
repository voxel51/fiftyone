import type {
  DecodedAttributeValue,
  LocationVisualization,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import {
  finiteNumberArrayField,
  numberField,
  recordField,
  rosHeader,
  rosHeaderAttributes,
  rosHeaderFrameId,
  rosHeaderTimestampNs,
  timingFromRosHeader,
} from "./common";
import { rosDecodersForPayloads } from "./factory";
import { ROS_NAV_SAT_FIX_PAYLOADS } from "./payloads";

const COVARIANCE_LENGTH = 9;

export const rosNavSatFixDecoders = rosDecodersForPayloads({
  id: "ros.nav-sat-fix",
  map(message, context) {
    const header = rosHeader(message);
    const frameId = rosHeaderFrameId(header);
    const messageTimestamp = rosHeaderTimestampNs(header);
    const latitude = numberField(message, "latitude", undefined, Number.NaN);
    const longitude = numberField(message, "longitude", undefined, Number.NaN);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("NavSatFix has no finite latitude/longitude");
    }

    const altitude = numberField(message, "altitude", undefined, Number.NaN);
    const positionCovariance = covariance(message);
    const attributes: Record<string, DecodedAttributeValue> = {
      ...rosHeaderAttributes(header),
      latitude,
      longitude,
    };
    const covarianceType = numberField(
      message,
      "position_covariance_type",
      undefined,
      Number.NaN,
    );
    if (Number.isFinite(covarianceType)) {
      attributes.positionCovarianceType = covarianceType;
    }

    const status = statusAttributes(recordField(message, "status"));
    if (status) {
      attributes.status = status;
    }

    // Match the Foxglove LocationFix heuristic: many drivers emit altitude 0
    // when altitude is unknown, even though true sea-level fixes are valid.
    const visualization: LocationVisualization = {
      ...(Number.isFinite(altitude) && altitude !== 0 ? { altitude } : {}),
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
      timing: timingFromRosHeader(context, header),
      visualization,
    };
  },
  payloads: ROS_NAV_SAT_FIX_PAYLOADS,
});

function covariance(
  record: Record<string, unknown>,
): readonly number[] | undefined {
  const values = finiteNumberArrayField(record, "position_covariance");
  return values.length === COVARIANCE_LENGTH ? values : undefined;
}

function statusAttributes(
  status: Record<string, unknown> | undefined,
): DecodedAttributeValue | undefined {
  if (!status) {
    return undefined;
  }

  const result: Record<string, DecodedAttributeValue> = {};
  const statusValue = numberField(status, "status", undefined, Number.NaN);
  const service = numberField(status, "service", undefined, Number.NaN);
  if (Number.isFinite(statusValue)) {
    result.status = statusValue;
  }
  if (Number.isFinite(service)) {
    result.service = service;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
