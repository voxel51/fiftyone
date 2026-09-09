/** Canonical decoded-frame attribute carrying normalized log rows. */
export const LOG_ATTRIBUTE_ROWS = "logRows";

/** Renderer-neutral log severity values. */
export const LOG_LEVEL = Object.freeze({
  DEBUG: "debug",
  ERROR: "error",
  FATAL: "fatal",
  INFO: "info",
  UNKNOWN: "unknown",
  WARN: "warn",
} as const);

export type LogLevel = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL];

export const LOG_LEVELS: readonly LogLevel[] = Object.freeze([
  LOG_LEVEL.DEBUG,
  LOG_LEVEL.INFO,
  LOG_LEVEL.WARN,
  LOG_LEVEL.ERROR,
  LOG_LEVEL.FATAL,
  LOG_LEVEL.UNKNOWN,
]);

export interface LogDetail {
  readonly key: string;
  readonly value: string;
}

/** Normalized log record produced by any format adapter. */
export interface DecodedLogRow {
  readonly details?: readonly LogDetail[];
  readonly file?: string;
  readonly functionName?: string;
  readonly hardwareId?: string;
  readonly kind?: "diagnostic" | "log";
  readonly level: LogLevel;
  readonly levelNumber?: number;
  readonly line?: number;
  readonly message: string;
  readonly name?: string;
  readonly status?: string;
  readonly timestampNs?: bigint;
  readonly topics?: readonly string[];
}
