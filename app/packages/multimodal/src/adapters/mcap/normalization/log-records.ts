import type { DecodedAttributeValue } from "../../../ir/index";
import type { DecodedLogRow, LogDetail } from "../../../ir/index";

export {
  LOG_ATTRIBUTE_ROWS,
  LOG_LEVEL,
  LOG_LEVELS,
  type DecodedLogRow,
  type LogDetail,
  type LogLevel,
} from "../../../ir/index";

export function logRowsAttribute(
  rows: readonly DecodedLogRow[],
): readonly Record<string, DecodedAttributeValue>[] {
  return rows.map(logRowAttribute);
}

export function logRowAttribute(
  row: DecodedLogRow,
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
  detail: LogDetail,
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
