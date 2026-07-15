import type { DecodedAttributeValue } from "../../../decoders";
import {
  MCAP_LOG_ATTRIBUTE_ROWS,
  MCAP_LOG_LEVEL,
  MCAP_LOG_LEVELS,
  type McapLogLevel,
} from "../log-records";
import type { McapDecodedMessage } from "../types";

export interface McapLogConsoleRow {
  readonly details: readonly { readonly key: string; readonly value: string }[];
  readonly file?: string;
  readonly functionName?: string;
  readonly groupLabel?: string;
  readonly hardwareId?: string;
  readonly id: string;
  readonly kind: "diagnostic" | "log";
  readonly level: McapLogLevel;
  readonly levelNumber?: number;
  readonly line?: number;
  readonly message: string;
  readonly name?: string;
  readonly status?: string;
  readonly timeNs: bigint;
  readonly topic: string;
}

const LOG_LEVEL_SET = new Set(MCAP_LOG_LEVELS);

export function logConsoleRowsFromDecodedMessage(
  message: McapDecodedMessage,
): readonly McapLogConsoleRow[] {
  const attributes = message.decoded.output.attributes ?? {};
  const rows = arrayValue(attributes[MCAP_LOG_ATTRIBUTE_ROWS])
    .map(recordValue)
    .filter(isRecord);

  if (rows.length === 0) {
    const fallbackMessage = stringValue(attributes.message);
    if (!fallbackMessage) {
      return [];
    }
    return [
      buildRow({
        index: 0,
        message,
        record: attributes,
      }),
    ];
  }

  return rows.map((record, index) =>
    buildRow({
      index,
      message,
      record,
    }),
  );
}

function buildRow({
  index,
  message,
  record,
}: {
  readonly index: number;
  readonly message: McapDecodedMessage;
  readonly record: Record<string, DecodedAttributeValue>;
}): McapLogConsoleRow {
  const hardwareId = stringValue(record.hardwareId);
  const name = stringValue(record.name);

  return {
    details: arrayValue(record.details)
      .map(recordValue)
      .filter(isRecord)
      .map((detail) => ({
        key: stringValue(detail.key) ?? "",
        value: stringValue(detail.value) ?? "",
      }))
      .filter((detail) => detail.key || detail.value),
    file: stringValue(record.file),
    functionName: stringValue(record.functionName),
    groupLabel: logGroupLabel(hardwareId, name),
    hardwareId,
    id: `${message.topic}:${message.timelineTimeNs.toString()}:${message.sequence}:${index}`,
    kind: stringValue(record.kind) === "diagnostic" ? "diagnostic" : "log",
    level: logLevelValue(record.level),
    levelNumber: numberValue(record.levelNumber),
    line: numberValue(record.line),
    message: stringValue(record.message) ?? "",
    name,
    status: stringValue(record.status),
    timeNs: bigintValue(record.timestampNs) ?? message.timelineTimeNs,
    topic: message.topic,
  };
}

function logGroupLabel(
  hardwareId: string | undefined,
  name: string | undefined,
): string | undefined {
  if (hardwareId && name) return `${hardwareId} / ${name}`;
  return hardwareId ?? name;
}

function logLevelValue(value: DecodedAttributeValue | undefined): McapLogLevel {
  return typeof value === "string" && LOG_LEVEL_SET.has(value as McapLogLevel)
    ? (value as McapLogLevel)
    : MCAP_LOG_LEVEL.UNKNOWN;
}

function arrayValue(
  value: DecodedAttributeValue | undefined,
): readonly DecodedAttributeValue[] {
  return Array.isArray(value) ? value : [];
}

function recordValue(
  value: DecodedAttributeValue,
): Record<string, DecodedAttributeValue> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, DecodedAttributeValue>)
    : null;
}

function isRecord(
  value: Record<string, DecodedAttributeValue> | null,
): value is Record<string, DecodedAttributeValue> {
  return value !== null;
}

function stringValue(value: DecodedAttributeValue | undefined) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: DecodedAttributeValue | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "bigint"
      ? Number(value)
      : undefined;
}

function bigintValue(value: DecodedAttributeValue | undefined) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.round(value));
  }
  if (typeof value === "string" && value) {
    try {
      return BigInt(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}
