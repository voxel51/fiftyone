import { relativeTimeParts } from "../../../utils/relative-time";

/** One displayable state/action value with its exact copyable form. */
export interface FormattedStateActionValue {
  readonly exact: string;
  readonly invalid: boolean;
  readonly kind: "value";
  readonly text: string;
}

/** Compact display value plus the exact parsed value for copy and hover. */
export function formatStateActionValue(
  value: unknown,
): FormattedStateActionValue {
  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return { exact: "NaN", invalid: true, kind: "value", text: "NaN" };
    }
    if (!Number.isFinite(value)) {
      return {
        exact: String(value),
        invalid: true,
        kind: "value",
        text: value > 0 ? "∞" : "-∞",
      };
    }
    if (Number.isInteger(value)) {
      return {
        exact: String(value),
        invalid: false,
        kind: "value",
        text: String(value),
      };
    }
    return {
      exact: String(value),
      invalid: false,
      kind: "value",
      text: compactStateActionFloat(value),
    };
  }
  if (typeof value === "bigint" || typeof value === "boolean") {
    const text = value.toString();
    return { exact: text, invalid: false, kind: "value", text };
  }
  if (value === null || value === undefined) {
    return { exact: "null", invalid: true, kind: "value", text: "null" };
  }
  const text = String(value);
  return { exact: text, invalid: true, kind: "value", text };
}

/** Compact float rendering that keeps scanability without losing scale. */
export function compactStateActionFloat(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e6 || magnitude < 1e-4)) {
    return value.toExponential(4);
  }
  return String(Number(value.toPrecision(6)));
}

/** Formats an episode-local time for the header, exact to the millisecond. */
export function formatEpisodeTime(timeNs: bigint, originNs: bigint): string {
  const { milliseconds, negative, seconds } = relativeTimeParts(
    timeNs - originNs,
  );
  return `t=${negative ? "-" : "+"}${seconds}.${milliseconds}s`;
}
