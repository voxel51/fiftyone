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

/** A CSS gradient with one color stop per colorscale stop, blended the same
 * way buildColors interpolates between them — sampling only the endpoints
 * would wash out any stop in between (e.g. viridis) */
export function gradientCss(colorscale: Colorscale): string {
  const n = colorscale.length;
  if (n <= 1) return `${rampCss(0, colorscale)}, ${rampCss(1, colorscale)}`;

  const stops: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    stops.push(`${rampCss(t, colorscale)} ${t * 100}%`);
  }
  return stops.join(", ");
}

export function ContinuousLegend({
  field,
  meta,
  colorscale,
  domain = null,
}: {
  field: string;
  meta: ColorMeta;
  colorscale: Colorscale;
  /** The domain the plot actually mapped values through (a zero-centered
   * read widens it to ±max(|min|, |max|)); null = meta's min..max. The ends
   * label THIS range — the bar must not name a value an end was never given,
   * and a zero-centered bar gains its "0" anchor. */
  domain?: readonly [number, number] | null;
}) {
  const { min, max } = meta;
  if (meta.style !== "continuous" || min == null || max == null) return null;

  const [lo, hi] = domain ?? [min, max];
  const zeroCentered = domain != null && lo < 0 && hi > 0;

  return (
    <FloatingPanel
      aria-label="Color legend"
      title={<TextBadge color={TextColor.Secondary}>{field}</TextBadge>}
      titleText={field}
    >
      <div className="emb-legend-ramp">
        <div
          className="emb-legend-ramp-track"
          style={{
            background: `linear-gradient(90deg, ${gradientCss(colorscale)})`,
          }}
        />
        <div className="emb-legend-ramp-labels">
          <Text variant={TextVariant.Sm} color={TextColor.Tertiary}>
            {formatRampValue(lo)}
          </Text>
          {zeroCentered && (
            <Text variant={TextVariant.Sm} color={TextColor.Tertiary}>
              0
            </Text>
          )}
          <Text variant={TextVariant.Sm} color={TextColor.Tertiary}>
            {formatRampValue(hi)}
          </Text>
        </div>
      </div>
    </FloatingPanel>
  );
}
