import type { DecodeContext, Decoder } from "../../../../decoders/index";
import type {
  DecodedAttributeValue,
  DecodedOutput,
} from "../../../../ir/index";
import {
  LOG_ATTRIBUTE_ROWS,
  LOG_LEVEL,
  type DecodedLogRow,
  logRowsAttribute,
} from "../../normalization/log-records";
import { rosDecodersForPayloads } from "../ros/factory";
import { decodeProtobufMessage } from "./protobuf/index";
import {
  numberField,
  optionalRecord,
  optionalString,
} from "./protobuf/records";
import { timingFromContext, timestampNs } from "./protobuf/timing";
import { FOXGLOVE_LOG_CDR_PAYLOADS, FOXGLOVE_LOG_PAYLOAD } from "./payloads";

/**
 * Decoder for Foxglove Log protobuf messages.
 */
export const foxgloveLogDecoder: Decoder = {
  id: "foxglove.log",
  payload: FOXGLOVE_LOG_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(bytes, FOXGLOVE_LOG_PAYLOAD, context);
    return decodeFoxgloveLogRecord(message, context);
  },
};

/**
 * Decoders for Foxglove Log messages carried over ROS 2 CDR.
 */
export const foxgloveLogCdrDecoders = rosDecodersForPayloads({
  id: "foxglove.log.cdr",
  map: decodeFoxgloveLogRecord,
  payloads: FOXGLOVE_LOG_CDR_PAYLOADS,
});

export function decodeFoxgloveLogRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const messageTimestamp = timestampNs(optionalRecord(message, "timestamp"));
  const levelNumber = numberField(message, "level");
  const row: DecodedLogRow = {
    file: optionalString(message, "file"),
    kind: "log",
    level: foxgloveLogLevel(levelNumber),
    levelNumber,
    line: positiveNumberField(message, "line"),
    message: optionalString(message, "message") ?? "",
    name: optionalString(message, "name"),
    timestampNs: messageTimestamp,
  };

  return {
    attributes: logOutputAttributes(row),
    timing: timingFromContext(context, messageTimestamp),
  };
}

function logOutputAttributes(
  row: DecodedLogRow,
): Record<string, DecodedAttributeValue> {
  const rows = logRowsAttribute([row]);
  return {
    ...rows[0],
    [LOG_ATTRIBUTE_ROWS]: rows,
  };
}

function foxgloveLogLevel(level: number) {
  switch (level) {
    case 1:
      return LOG_LEVEL.DEBUG;
    case 2:
      return LOG_LEVEL.INFO;
    case 3:
      return LOG_LEVEL.WARN;
    case 4:
      return LOG_LEVEL.ERROR;
    case 5:
      return LOG_LEVEL.FATAL;
    default:
      return LOG_LEVEL.UNKNOWN;
  }
}

function positiveNumberField(
  record: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = numberField(record, field, undefined, Number.NaN);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
