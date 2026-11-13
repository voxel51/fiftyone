/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { sourceOf } from "./builder/envelope";

const MAX_LENGTH = 24;

const truncate = (s: string) =>
  s.length > MAX_LENGTH ? `${s.slice(0, MAX_LENGTH - 3)}…` : s;

/**
 * Render a kwarg value as a short preview string for the collapsed
 * stage card. Keeps strings under ~24 chars; lists show the first item
 * with a `+N` tail; numbers/booleans show as-is; an expression shows the
 * Python it was written as, and raw MongoDB its JSON.
 */
export const previewValue = (value: unknown): string => {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const head = value.length ? previewValue(value[0]) : "";
    return value.length > 1 ? `${head} +${value.length - 1}` : head;
  }
  if (typeof value === "object") {
    return truncate(sourceOf(value) ?? JSON.stringify(value));
  }
  return truncate(String(value));
};
