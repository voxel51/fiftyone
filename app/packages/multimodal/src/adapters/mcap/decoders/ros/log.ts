import type {
  DecodeContext,
  DecodedAttributeValue,
  DecodedOutput,
} from "../../../../decoders";
import {
  MCAP_LOG_ATTRIBUTE_ROWS,
  MCAP_LOG_LEVEL,
  type McapDecodedLogRow,
  logRowsAttribute,
} from "../../log-records";
import { optionalString } from "../foxglove/protobuf/records";
import { timingFromContext } from "../foxglove/protobuf/timing";
import {
  arrayField,
  numberField,
  recordField,
  rosHeader,
  rosHeaderAttributes,
  rosHeaderTimestampNs,
  rosTimestampNs,
  timingFromRosHeader,
} from "./common";
import { rosDecodersForPayloads } from "./factory";
import {
  ROS_DIAGNOSTIC_ARRAY_PAYLOADS,
  ROS_RCL_LOG_PAYLOADS,
  ROS_ROSGRAPH_LOG_PAYLOADS,
} from "./payloads";

/**
 * Decoders for ROS1 rosgraph_msgs/Log messages.
 */
export const rosRosgraphLogDecoders = rosDecodersForPayloads({
  id: "ros.rosgraph-log",
  map: decodeRosgraphLogRecord,
  payloads: ROS_ROSGRAPH_LOG_PAYLOADS,
});

/**
 * Decoders for ROS2 rcl_interfaces/msg/Log messages.
 */
export const rosRclLogDecoders = rosDecodersForPayloads({
  id: "ros.rcl-log",
  map: decodeRclLogRecord,
  payloads: ROS_RCL_LOG_PAYLOADS,
});

/**
 * Decoders for ROS diagnostic_msgs/(msg/)DiagnosticArray messages.
 */
export const rosDiagnosticArrayDecoders = rosDecodersForPayloads({
  id: "ros.diagnostic-array",
  map: decodeDiagnosticArrayRecord,
  payloads: ROS_DIAGNOSTIC_ARRAY_PAYLOADS,
});

export function decodeRosgraphLogRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const header = rosHeader(message);
  const timestampNs = rosHeaderTimestampNs(header);
  const levelNumber = numberField(message, "level", undefined, 0);
  const row: McapDecodedLogRow = {
    file: optionalString(message, "file"),
    functionName: optionalString(message, "function"),
    kind: "log",
    level: rosgraphLogLevel(levelNumber),
    levelNumber,
    line: positiveNumberField(message, "line"),
    message: optionalString(message, "msg") ?? "",
    name: optionalString(message, "name"),
    timestampNs,
    topics: stringArrayField(message, "topics"),
  };

  return {
    attributes: logOutputAttributes(row, rosHeaderAttributes(header)),
    timing: timingFromRosHeader(context, header),
  };
}

export function decodeRclLogRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const timestampNs = rosTimestampNs(recordField(message, "stamp"));
  const levelNumber = numberField(message, "level", undefined, 0);
  const row: McapDecodedLogRow = {
    file: optionalString(message, "file"),
    functionName: optionalString(message, "function"),
    kind: "log",
    level: rclLogLevel(levelNumber),
    levelNumber,
    line: positiveNumberField(message, "line"),
    message: optionalString(message, "msg") ?? "",
    name: optionalString(message, "name"),
    timestampNs,
  };

  return {
    attributes: logOutputAttributes(row),
    timing: timingFromContext(context, timestampNs),
  };
}

export function decodeDiagnosticArrayRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const header = rosHeader(message);
  const timestampNs = rosHeaderTimestampNs(header);
  const rows = arrayField(message, "status")
    .map(asRecord)
    .filter(isRecord)
    .map((status) => diagnosticStatusRow(status, timestampNs));
  const counts = diagnosticCounts(rows);

  return {
    attributes: {
      ...rosHeaderAttributes(header),
      [MCAP_LOG_ATTRIBUTE_ROWS]: logRowsAttribute(rows),
      diagnosticCount: rows.length,
      errorCount: counts.error,
      okCount: counts.ok,
      staleCount: counts.stale,
      warnCount: counts.warn,
    },
    timing: timingFromRosHeader(context, header),
  };
}

function logOutputAttributes(
  row: McapDecodedLogRow,
  base: Record<string, DecodedAttributeValue> = {},
): Record<string, DecodedAttributeValue> {
  const rows = logRowsAttribute([row]);
  return {
    ...base,
    ...rows[0],
    [MCAP_LOG_ATTRIBUTE_ROWS]: rows,
  };
}

function diagnosticStatusRow(
  status: Record<string, unknown>,
  timestampNs: bigint | undefined,
): McapDecodedLogRow {
  const levelNumber = numberValue(status.level);
  const statusName = diagnosticStatusName(levelNumber);
  const name = optionalString(status, "name");
  const message = optionalString(status, "message") ?? statusName;
  const hardwareId = optionalString(status, "hardware_id", "hardwareId");

  return {
    details: diagnosticDetails(status),
    hardwareId,
    kind: "diagnostic",
    level: diagnosticLogLevel(levelNumber),
    message,
    name,
    status: statusName,
    timestampNs,
    ...(levelNumber !== undefined ? { levelNumber } : {}),
  };
}

function diagnosticDetails(
  status: Record<string, unknown>,
): readonly { readonly key: string; readonly value: string }[] {
  return arrayField(status, "values")
    .map(asRecord)
    .filter(isRecord)
    .map((value) => ({
      key: optionalString(value, "key") ?? "",
      value: stringValue(value["value"]) ?? "",
    }))
    .filter((value) => value.key || value.value);
}

function diagnosticCounts(rows: readonly McapDecodedLogRow[]) {
  const counts = {
    error: 0,
    ok: 0,
    stale: 0,
    warn: 0,
  };
  for (const row of rows) {
    switch (row.status) {
      case "ERROR":
        counts.error += 1;
        break;
      case "STALE":
        counts.stale += 1;
        break;
      case "WARN":
        counts.warn += 1;
        break;
      case "OK":
        counts.ok += 1;
        break;
    }
  }

  return counts;
}

function rosgraphLogLevel(level: number) {
  if ((level & 16) !== 0) return MCAP_LOG_LEVEL.FATAL;
  if ((level & 8) !== 0) return MCAP_LOG_LEVEL.ERROR;
  if ((level & 4) !== 0) return MCAP_LOG_LEVEL.WARN;
  if ((level & 2) !== 0) return MCAP_LOG_LEVEL.INFO;
  if ((level & 1) !== 0) return MCAP_LOG_LEVEL.DEBUG;
  return MCAP_LOG_LEVEL.UNKNOWN;
}

function rclLogLevel(level: number) {
  if (level >= 50) return MCAP_LOG_LEVEL.FATAL;
  if (level >= 40) return MCAP_LOG_LEVEL.ERROR;
  if (level >= 30) return MCAP_LOG_LEVEL.WARN;
  if (level >= 20) return MCAP_LOG_LEVEL.INFO;
  if (level >= 10) return MCAP_LOG_LEVEL.DEBUG;
  return MCAP_LOG_LEVEL.UNKNOWN;
}

function diagnosticLogLevel(level: number | undefined) {
  if (level === 2) return MCAP_LOG_LEVEL.ERROR;
  if (level === 1 || level === 3) return MCAP_LOG_LEVEL.WARN;
  if (level === 0) return MCAP_LOG_LEVEL.INFO;
  return MCAP_LOG_LEVEL.UNKNOWN;
}

function diagnosticStatusName(level: number | undefined): string {
  switch (level) {
    case 0:
      return "OK";
    case 1:
      return "WARN";
    case 2:
      return "ERROR";
    case 3:
      return "STALE";
    default:
      return "UNKNOWN";
  }
}

function positiveNumberField(
  record: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = numberValue(record[field]);
  return value !== undefined && value > 0 ? value : undefined;
}

function stringArrayField(
  record: Record<string, unknown>,
  field: string,
): readonly string[] | undefined {
  const values = arrayField(record, field).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return values.length > 0 ? values : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isRecord(
  value: Record<string, unknown> | null,
): value is Record<string, unknown> {
  return value !== null;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  return undefined;
}
