import type { DecodedAttributeValue } from "../../ir";
import {
  LOG_ATTRIBUTE_ROWS,
  LOG_LEVEL,
  LOG_LEVELS,
  type LogLevel,
} from "../../ir";
import type { DecodedFrame } from "../../ir";

/**
 * One normalized row ready for display by a format-neutral log console.
 *
 * `timelineTimeNs` is the source/playback position and owns every operational
 * decision (windowing, retention, ordering, and seeking). `messageTimeNs` is
 * embedded payload metadata and is only suitable for display.
 */
export interface EpisodeLogConsoleRow {
  /** Stable state identity for diagnostic upserts; absent for ordinary logs. */
  readonly diagnosticId?: string;
  readonly details: readonly { readonly key: string; readonly value: string }[];
  readonly file?: string;
  readonly functionName?: string;
  readonly groupLabel?: string;
  readonly hardwareId?: string;
  readonly id: string;
  readonly kind: "diagnostic" | "log";
  readonly level: LogLevel;
  readonly levelNumber?: number;
  readonly line?: number;
  readonly message: string;
  readonly messageTimeNs?: bigint;
  readonly name?: string;
  readonly status?: string;
  readonly stream: string;
  readonly timelineTimeNs: bigint;
}

const LOG_LEVEL_SET = new Set(LOG_LEVELS);

/** Normalizes decoded log or diagnostic evidence into display-ready rows. */
export function logConsoleRowsFromDecodedMessage(
  message: DecodedFrame,
): readonly EpisodeLogConsoleRow[] {
  const attributes = message.output.attributes ?? {};
  const rows = arrayValue(attributes[LOG_ATTRIBUTE_ROWS])
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
  readonly message: DecodedFrame;
  readonly record: Record<string, DecodedAttributeValue>;
}): EpisodeLogConsoleRow {
  const hardwareId = stringValue(record.hardwareId);
  const name = stringValue(record.name);
  const kind = stringValue(record.kind) === "diagnostic" ? "diagnostic" : "log";

  return {
    diagnosticId:
      kind === "diagnostic"
        ? diagnosticConsoleIdentity(message.streamId, hardwareId, name)
        : undefined,
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
    id: `${message.streamId}:${message.timestampNs.toString()}:${message.sequence ?? ""}:${index}`,
    kind,
    level: logLevelValue(record.level),
    levelNumber: numberValue(record.levelNumber),
    line: numberValue(record.line),
    message: stringValue(record.message) ?? "",
    messageTimeNs: bigintValue(record.timestampNs),
    name,
    status: stringValue(record.status),
    stream: message.streamId,
    timelineTimeNs: message.timestampNs,
  };
}

/**
 * ROS diagnostic identity is source-local name plus optional hardware id.
 * Length prefixes avoid delimiter collisions while keeping the key opaque to
 * presentation code. Malformed rows with neither field degrade to one held
 * stream-level state instead of disappearing from Diagnostics.
 */
export function diagnosticConsoleIdentity(
  stream: string,
  hardwareId: string | undefined,
  name: string | undefined,
): string {
  return [stream, hardwareId ?? "", name ?? ""]
    .map((part) => `${part.length}:${part}`)
    .join("");
}

function logGroupLabel(
  hardwareId: string | undefined,
  name: string | undefined,
): string | undefined {
  if (hardwareId && name) return `${hardwareId} / ${name}`;
  return hardwareId ?? name;
}

function logLevelValue(value: DecodedAttributeValue | undefined): LogLevel {
  return typeof value === "string" && LOG_LEVEL_SET.has(value as LogLevel)
    ? (value as LogLevel)
    : LOG_LEVEL.UNKNOWN;
}

function arrayValue(
  value: DecodedAttributeValue | undefined,
): readonly DecodedAttributeValue[] {
  return isDecodedAttributeArray(value) ? value : [];
}

function isDecodedAttributeArray(
  value: DecodedAttributeValue | undefined,
): value is readonly DecodedAttributeValue[] {
  return Array.isArray(value);
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
