import type {
  DecodeContext,
  DecodedAttributeValue,
  DecodedOutput,
  Decoder,
} from "../../../../decoders";
import {
  MCAP_LOG_ATTRIBUTE_ROWS,
  MCAP_LOG_LEVEL,
  type McapDecodedLogRow,
  logRowsAttribute,
} from "../../log-records";
import { rosDecodersForPayloads } from "../ros/factory";
import { decodeProtobufMessage } from "./protobuf";
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
  const row: McapDecodedLogRow = {
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
  row: McapDecodedLogRow,
): Record<string, DecodedAttributeValue> {
  return {
    ...logRowsAttribute([row])[0],
    [MCAP_LOG_ATTRIBUTE_ROWS]: logRowsAttribute([row]),
  };
}

function foxgloveLogLevel(level: number) {
  switch (level) {
    case 1:
      return MCAP_LOG_LEVEL.DEBUG;
    case 2:
      return MCAP_LOG_LEVEL.INFO;
    case 3:
      return MCAP_LOG_LEVEL.WARN;
    case 4:
      return MCAP_LOG_LEVEL.ERROR;
    case 5:
      return MCAP_LOG_LEVEL.FATAL;
    default:
      return MCAP_LOG_LEVEL.UNKNOWN;
  }
}

function positiveNumberField(
  record: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = numberField(record, field, undefined, Number.NaN);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
