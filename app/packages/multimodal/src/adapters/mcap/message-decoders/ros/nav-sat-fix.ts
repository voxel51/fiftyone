import type { DecodeContext } from "../../../../decoders/index";
import type {
  DecodedAttributeValue,
  DecodedOutput,
  LocationVisualization,
} from "../../../../ir/index";
import { VISUALIZATION_KIND } from "../../../../ir/index";
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
const COVARIANCE_TYPE_UNKNOWN = 0;

/**
 * Decoders for ROS NavSatFix messages.
 */
export const rosNavSatFixDecoders = rosDecodersForPayloads({
  id: "ros.nav-sat-fix",
  map: decodeRosNavSatFixRecord,
  payloads: ROS_NAV_SAT_FIX_PAYLOADS,
});

/**
 * Normalizes a decoded ROS NavSatFix record into location output.
 */
export function decodeRosNavSatFixRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const header = rosHeader(message);
  const frameId = rosHeaderFrameId(header);
  const messageTimestamp = rosHeaderTimestampNs(header);
  const latitude = numberField(message, "latitude", undefined, Number.NaN);
  const longitude = numberField(message, "longitude", undefined, Number.NaN);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("NavSatFix has no finite latitude/longitude");
  }

  const altitude = numberField(message, "altitude", undefined, Number.NaN);
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
  const positionCovariance =
    Number.isFinite(covarianceType) &&
    covarianceType !== COVARIANCE_TYPE_UNKNOWN
      ? covariance(message)
      : undefined;

  const navSatStatus = navSatStatusValues(recordField(message, "status"));
  if (navSatStatus.attributes) {
    attributes.status = navSatStatus.attributes;
  }

  // Match the Foxglove LocationFix heuristic: many drivers emit altitude 0
  // when altitude is unknown, even though true sea-level fixes are valid.
  const visualization: LocationVisualization = {
    ...(Number.isFinite(altitude) && altitude !== 0 ? { altitude } : {}),
    ...(frameId ? { coordinateFrameId: frameId } : {}),
    kind: VISUALIZATION_KIND.LOCATION,
    ...(navSatStatus.fixService !== undefined
      ? { fixService: navSatStatus.fixService }
      : {}),
    ...(navSatStatus.fixStatus !== undefined
      ? { fixStatus: navSatStatus.fixStatus }
      : {}),
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
}

function covariance(
  record: Record<string, unknown>,
): readonly number[] | undefined {
  const values = finiteNumberArrayField(record, "position_covariance");
  return values.length === COVARIANCE_LENGTH ? values : undefined;
}

function navSatStatusValues(status: Record<string, unknown> | undefined): {
  readonly attributes?: DecodedAttributeValue;
  readonly fixService?: number;
  readonly fixStatus?: number;
} {
  if (!status) {
    return {};
  }

  const statusValue = numberField(status, "status", undefined, Number.NaN);
  const service = numberField(status, "service", undefined, Number.NaN);
  const fixStatus = Number.isFinite(statusValue) ? statusValue : undefined;
  const fixService = Number.isFinite(service) ? service : undefined;

  const result: Record<string, DecodedAttributeValue> = {};
  if (fixStatus !== undefined) {
    result.status = fixStatus;
  }
  if (fixService !== undefined) {
    result.service = fixService;
  }

  return {
    attributes: Object.keys(result).length > 0 ? result : undefined,
    fixService,
    fixStatus,
  };
}
