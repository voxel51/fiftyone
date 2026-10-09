/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Input, Size } from "@voxel51/voodo";
import { useState } from "react";
import type { OrderBounds } from "../order/order";
import styles from "./Rail.module.css";

/** A typed value as the sort field holds it: booleans parse, strings stay. */
export const parseValue = (text: string, bounds: OrderBounds) =>
  typeof bounds.min === "boolean" || typeof bounds.max === "boolean"
    ? text.trim().toLowerCase() === "true"
    : text;

/**
 * Jumps a string or boolean sort to the first sample at or past a typed
 * value, once, on Enter. Such a sort has no scale to rail over.
 */
export default function ValueJump({
  bounds,
  field,
  onSeek,
}: {
  bounds: OrderBounds;
  field: string;
  onSeek: (value: unknown) => void;
}) {
  const [text, setText] = useState("");
  const range =
    bounds.min !== null && bounds.max !== null
      ? ` (${String(bounds.min)} … ${String(bounds.max)})`
      : "";

  return (
    <div className={styles.valueJump} data-cy="fo-grid-value-jump">
      <Input
        aria-label={`Jump to a ${field} value`}
        placeholder={`Jump to ${field}${range}`}
        size={Size.Sm}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && text.trim()) {
            onSeek(parseValue(text.trim(), bounds));
          } else if (event.key === "Escape") {
            setText("");
          }
        }}
      />
    </div>
  );
}
