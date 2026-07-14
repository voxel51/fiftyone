import type { DecodedAttributeValue } from "../../decoders";

export const MCAP_LOG_ATTRIBUTE_ROWS = "logRows";

export const MCAP_LOG_LEVEL = {
  DEBUG: "debug",
  ERROR: "error",
  FATAL: "fatal",
  INFO: "info",
  UNKNOWN: "unknown",
  WARN: "warn",
} as const;

export type McapLogLevel = (typeof MCAP_LOG_LEVEL)[keyof typeof MCAP_LOG_LEVEL];

export const MCAP_LOG_LEVELS: readonly McapLogLevel[] = [
  MCAP_LOG_LEVEL.DEBUG,
  MCAP_LOG_LEVEL.INFO,
  MCAP_LOG_LEVEL.WARN,
  MCAP_LOG_LEVEL.ERROR,
  MCAP_LOG_LEVEL.FATAL,
  MCAP_LOG_LEVEL.UNKNOWN,
];

export interface McapLogDetail {
  readonly key: string;
  readonly value: string;
}

export interface McapDecodedLogRow {
  readonly details?: readonly McapLogDetail[];
  readonly file?: string;
  readonly functionName?: string;
  readonly hardwareId?: string;
  readonly kind?: "diagnostic" | "log";
  readonly level: McapLogLevel;
  readonly levelNumber?: number;
  readonly line?: number;
  readonly message: string;
  readonly name?: string;
  readonly status?: string;
  readonly timestampNs?: bigint;
  readonly topics?: readonly string[];
}

export function logRowsAttribute(
  rows: readonly McapDecodedLogRow[],
): readonly Record<string, DecodedAttributeValue>[] {
  return rows.map(logRowAttribute);
}

export function logRowAttribute(
  row: McapDecodedLogRow,
): Record<string, DecodedAttributeValue> {
  const attributes: Record<string, DecodedAttributeValue> = {
    level: row.level,
    message: row.message,
  };
  assignOptional(attributes, "details", row.details?.map(logDetailAttribute));
  assignOptional(attributes, "file", row.file);
  assignOptional(attributes, "functionName", row.functionName);
  assignOptional(attributes, "hardwareId", row.hardwareId);
  assignOptional(attributes, "kind", row.kind);
  assignOptional(attributes, "levelNumber", row.levelNumber);
  assignOptional(attributes, "line", row.line);
  assignOptional(attributes, "name", row.name);
  assignOptional(attributes, "status", row.status);
  assignOptional(attributes, "timestampNs", row.timestampNs);
  assignOptional(attributes, "topics", row.topics);

  return attributes;
}

function logDetailAttribute(
  detail: McapLogDetail,
): Record<string, DecodedAttributeValue> {
  return {
    key: detail.key,
    value: detail.value,
  };
}

function assignOptional(
  target: Record<string, DecodedAttributeValue>,
  key: string,
  value: DecodedAttributeValue | undefined,
) {
  if (value !== undefined) {
    target[key] = value;
  }
}
