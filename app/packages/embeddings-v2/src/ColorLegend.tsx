/**
 * Floating legend for categorical color-by fields: one row per class
 * (swatch, label, count). The legend is a view over the sidebar filter
 * for the field — rows the filter hides render greyed — and clicks ask
 * the host for the next filter: single click toggles a class, double
 * click isolates it. Hosts that cannot filter the field (non-string
 * classes) pass `offLabels: null` and the rows render inert.
 * Continuous fields render no legend.
 */
import { Text, TextBadge, TextColor, TextVariant } from "@voxel51/voodo";
import { useEffect, useRef } from "react";
import { categoryHex } from "./colors";
import { FloatingPanel } from "./FloatingPanel";
import "./panel.css";
import type { ColorMeta } from "./protocol";

// A double click physically contains a single click, so the toggle is
// deferred by this window and cancelled when the second click arrives —
// otherwise every isolate flashes the toggled state first. Matches the
// legacy panel, whose plotly legend used the same deferral (plotly.js
// DBLCLICKDELAY).
const DOUBLE_CLICK_DELAY_MS = 300;

export function ColorLegend({
  field,
  meta,
  offLabels,
  scopedCounts,
  onToggle,
  onSolo,
}: {
  field: string;
  meta: ColorMeta;
  /** Classes the field's filter hides; null = filtering unavailable */
  offLabels: ReadonlySet<string> | null;
  /** Per-class counts for the current selection/scope, aligned with
   * `meta.classes`; rows then render "scoped / total". Null = no
   * scope, rows show the run's full counts alone */
  scopedCounts?: readonly number[] | null;
  onToggle: (label: string) => void;
  onSolo: (label: string) => void;
}) {
  // per-label: a pending single-click toggle on one row must only be
  // cancelled by a second click on the same row, not a click elsewhere
  const clickTimeouts = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  useEffect(
    () => () => {
      for (const timeout of clickTimeouts.current.values()) {
        clearTimeout(timeout);
      }
    },
    [],
  );

  const handleRowClick = (label: string, detail: number) => {
    const pending = clickTimeouts.current.get(label);
    if (pending) {
      clearTimeout(pending);
      clickTimeouts.current.delete(label);
    }
    if (detail >= 2) {
      onSolo(label);
      return;
    }
    if (detail === 0) {
      // keyboard activation reports detail 0; no double press exists on
      // that path, so the toggle applies immediately
      onToggle(label);
      return;
    }
    clickTimeouts.current.set(
      label,
      setTimeout(() => {
        clickTimeouts.current.delete(label);
        onToggle(label);
      }, DOUBLE_CLICK_DELAY_MS),
    );
  };

  const classes = meta.style === "categorical" ? (meta.classes ?? []) : [];
  if (!classes.length) return null;

  const interactive = offLabels !== null;

  return (
    <FloatingPanel
      aria-label="Color legend"
      title={<TextBadge color={TextColor.Secondary}>{field}</TextBadge>}
      footer={
        interactive ? (
          <Text variant={TextVariant.Sm} color={TextColor.Muted}>
            Click to hide · Double-click to isolate
          </Text>
        ) : undefined
      }
    >
      <div className="emb-legend">
        <div className="emb-legend-rows">
          {classes.map((cls, index) => {
            const label = String(cls.label);
            return (
              <button
                type="button"
                key={label}
                className="emb-legend-row"
                disabled={!interactive}
                data-off={offLabels?.has(label) ? "true" : "false"}
                onClick={(event) => handleRowClick(label, event.detail)}
              >
                <span
                  className="emb-legend-swatch"
                  style={{ background: categoryHex(index) }}
                />
                <span className="emb-legend-label">
                  <Text variant={TextVariant.Md} color={TextColor.Secondary}>
                    {label}
                  </Text>
                </span>
                <Text
                  className="emb-legend-count"
                  variant={TextVariant.Md}
                  color={TextColor.Tertiary}
                >
                  {scopedCounts
                    ? `${scopedCounts[index]?.toLocaleString() ?? 0} / ${cls.count.toLocaleString()}`
                    : cls.count.toLocaleString()}
                </Text>
              </button>
            );
          })}
        </div>
        {meta.truncated && (
          <Text variant={TextVariant.Sm} color={TextColor.Muted}>
            Top {classes.length} classes
          </Text>
        )}
      </div>
    </FloatingPanel>
  );
}
