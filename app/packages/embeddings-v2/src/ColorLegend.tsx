/**
 * Floating categorical legend for the plot: a FloatingPanel (grip +
 * chevron collapse, lovable's shell) of class swatch rows. Renders
 * nothing for continuous fields — the numeric gradient + range slider
 * are deferred with the color special-treatments punt. No footer until
 * the interactions it would advertise exist.
 */
import { Text, TextBadge, TextColor, TextVariant } from "@voxel51/voodo";
import { categoryHex } from "./colors";
import { FloatingPanel } from "./FloatingPanel";
import "./panel.css";
import type { ColorMeta } from "./protocol";

export function ColorLegend({
  field,
  meta,
}: {
  field: string;
  meta: ColorMeta;
}) {
  const classes = meta.style === "categorical" ? (meta.classes ?? []) : [];
  if (!classes.length) return null;

  return (
    <FloatingPanel
      aria-label="Color legend"
      title={<TextBadge color={TextColor.Secondary}>{field}</TextBadge>}
      footer={
        <Text variant={TextVariant.Xs} color={TextColor.Muted}>
          Click to highlight · Shift-click to filter grid
        </Text>
      }
    >
      <div className="emb-legend">
        <div className="emb-legend-rows">
          {classes.map((cls, index) => (
            <div key={String(cls.label)} className="emb-legend-row">
              <span
                className="emb-legend-swatch"
                style={{ background: categoryHex(index) }}
              />
              <span className="emb-legend-label">
                <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
                  {String(cls.label)}
                </Text>
              </span>
              <Text variant={TextVariant.Xs} color={TextColor.Tertiary}>
                {cls.count.toLocaleString()}
              </Text>
            </div>
          ))}
        </div>
        {meta.truncated && (
          <Text variant={TextVariant.Xs} color={TextColor.Muted}>
            Top {classes.length} classes
          </Text>
        )}
      </div>
    </FloatingPanel>
  );
}
