/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Sort values on a value rail: the order's bounds as numbers on their
 * scale, the value at a rail position, and its label. Dates and ids read
 * like a calendar, in UTC as the server's ticks do.
 */

import type { OrderBounds, OrderScale } from "../order/order";
import { clamp01 } from "./model";

const DAY = 86_400_000;
const YEAR = 365 * DAY;

/** A bound as a number on its scale: dates and ids in epoch milliseconds. */
export const toNumber = (
  value: unknown,
  scale: OrderScale,
): number | undefined => {
  if (scale === "ID") {
    return typeof value === "string" && /^[0-9a-f]{8}/i.test(value)
      ? parseInt(value.slice(0, 8), 16) * 1000
      : undefined;
  }

  const number =
    scale === "DATE" && value && typeof value === "object"
      ? (value as { datetime?: unknown }).datetime
      : value;
  return typeof number === "number" && Number.isFinite(number)
    ? number
    : undefined;
};

/** The ends of a scaled order, in view order; undefined without a scale. */
export const scaleEnds = (bounds: OrderBounds | null, desc: boolean) => {
  if (!bounds?.scale) return undefined;
  const lo = toNumber(bounds.min, bounds.scale);
  const hi = toNumber(bounds.max, bounds.scale);
  if (lo === undefined || hi === undefined) return undefined;
  return { first: desc ? hi : lo, last: desc ? lo : hi, scale: bounds.scale };
};

/** The sort value at a rail fraction, interpolated between the ends. */
export const valueAt = (
  fraction: number,
  ends: { first: number; last: number },
) => ends.first + clamp01(fraction) * (ends.last - ends.first);

const dateFormat = (span: number): Intl.DateTimeFormatOptions => {
  if (span > 2 * YEAR) return { month: "short", year: "numeric" };
  if (span > 2 * DAY) {
    return { day: "numeric", month: "short", year: "numeric" };
  }
  return { day: "numeric", hour: "2-digit", minute: "2-digit", month: "short" };
};

const numberLabel = (value: number, span: number) => {
  const abs = Math.abs(value);
  for (const [bound, suffix] of [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "k"],
  ] as const) {
    if (abs >= bound)
      return `${Number((value / bound).toPrecision(3))}${suffix}`;
  }
  // enough digits to tell apart values a hundredth of the range apart
  const digits = span > 0 ? Math.max(0, 2 - Math.floor(Math.log10(span))) : 2;
  return String(Number(value.toFixed(Math.min(digits, 6))));
};

/** A value's label, at a precision fit for the order's range. */
export const valueLabel = (
  value: number,
  ends: { first: number; last: number; scale: OrderScale },
) => {
  const span = Math.abs(ends.last - ends.first);
  if (ends.scale === "NUMBER") return numberLabel(value, span);
  return new Date(value).toLocaleString("en-US", {
    ...dateFormat(span),
    timeZone: "UTC",
  });
};
