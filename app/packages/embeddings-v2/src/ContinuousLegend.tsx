/**
 * Floating legend for continuous color-by fields: the color ramp as a
 * spectrum bar with the field's min/max at the ends. Purely a readout —
 * which fields are continuous is the server's style decision
 * (float fields, and high-cardinality int fields), and the plot
 * already colors them; this shows what the colors mean.
 */
import { Text, TextBadge, TextColor, TextVariant } from "@voxel51/voodo";
import { rampCss, type Colorscale } from "./colors";
import { FloatingPanel } from "./FloatingPanel";
import "./panel.css";
import type { ColorMeta } from "./protocol";

const FLOAT_FORMAT = new Intl.NumberFormat(undefined, {
  maximumSignificantDigits: 3,
});

/** Compact display for a ramp endpoint: integers verbatim, floats to
 * three significant digits (uniqueness-style scores read as "0.512") */
export function formatRampValue(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString();
  return FLOAT_FORMAT.format(value);
}

export function ContinuousLegend({
  field,
  meta,
  colorscale,
}: {
  field: string;
  meta: ColorMeta;
  colorscale: Colorscale;
}) {
  const { min, max } = meta;
  if (meta.style !== "continuous" || min == null || max == null) return null;

  return (
    <FloatingPanel
      aria-label="Color legend"
      title={<TextBadge color={TextColor.Secondary}>{field}</TextBadge>}
    >
      <div className="emb-legend-ramp">
        <div
          className="emb-legend-ramp-track"
          style={{
            background: `linear-gradient(90deg, ${rampCss(
              0,
              colorscale,
            )}, ${rampCss(0.5, colorscale)}, ${rampCss(1, colorscale)})`,
          }}
        />
        <div className="emb-legend-ramp-labels">
          <Text variant={TextVariant.Sm} color={TextColor.Tertiary}>
            {formatRampValue(min)}
          </Text>
          <Text variant={TextVariant.Sm} color={TextColor.Tertiary}>
            {formatRampValue(max)}
          </Text>
        </div>
      </div>
    </FloatingPanel>
  );
}
