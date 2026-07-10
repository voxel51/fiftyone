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
import { categoryHex } from "./colors";
import { FloatingPanel } from "./FloatingPanel";
import "./panel.css";
import type { ColorMeta } from "./protocol";

export function ColorLegend({
  field,
  meta,
  offLabels,
  onToggle,
  onSolo,
}: {
  field: string;
  meta: ColorMeta;
  /** Classes the field's filter hides; null = filtering unavailable */
  offLabels: ReadonlySet<string> | null;
  onToggle: (label: string) => void;
  onSolo: (label: string) => void;
}) {
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
                onClick={() => onToggle(label)}
                onDoubleClick={() => onSolo(label)}
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
                <Text variant={TextVariant.Md} color={TextColor.Tertiary}>
                  {cls.count.toLocaleString()}
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
