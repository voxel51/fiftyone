/**
 * Floating legend for categorical color-by fields: one clickable row
 * per class (swatch, label, count). Clicking a row highlights that
 * class on the plot; shift-clicking filters the grid — the host
 * supplies both behaviors via onClassClick. Continuous fields render
 * no legend.
 */
import { Text, TextBadge, TextColor, TextVariant } from "@voxel51/voodo";
import { categoryHex } from "./colors";
import { FloatingPanel } from "./FloatingPanel";
import "./panel.css";
import type { ColorMeta } from "./protocol";

export function ColorLegend({
  field,
  meta,
  activeClass,
  onClassClick,
}: {
  field: string;
  meta: ColorMeta;
  /** Class index currently highlighted on the plot, if any */
  activeClass: number | null;
  onClassClick: (index: number, shiftKey: boolean) => void;
}) {
  const classes = meta.style === "categorical" ? (meta.classes ?? []) : [];
  if (!classes.length) return null;

  return (
    <FloatingPanel
      aria-label="Color legend"
      title={<TextBadge color={TextColor.Secondary}>{field}</TextBadge>}
      footer={
        <Text variant={TextVariant.Sm} color={TextColor.Muted}>
          Click to highlight · Shift-click to filter grid
        </Text>
      }
    >
      <div className="emb-legend">
        <div className="emb-legend-rows">
          {classes.map((cls, index) => (
            <button
              type="button"
              key={String(cls.label)}
              className="emb-legend-row"
              data-active={index === activeClass ? "true" : "false"}
              onClick={(event) => onClassClick(index, event.shiftKey)}
            >
              <span
                className="emb-legend-swatch"
                style={{ background: categoryHex(index) }}
              />
              <span className="emb-legend-label">
                <Text variant={TextVariant.Md} color={TextColor.Secondary}>
                  {String(cls.label)}
                </Text>
              </span>
              <Text variant={TextVariant.Md} color={TextColor.Tertiary}>
                {cls.count.toLocaleString()}
              </Text>
            </button>
          ))}
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
