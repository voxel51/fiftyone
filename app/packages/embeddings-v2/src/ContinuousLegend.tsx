/**
 * Floating legend for continuous color-by fields: the selected color ramp as a
 * spectrum bar, labelled with the values its ends stand for. Purely a readout —
 * which fields are continuous is the server's style decision
 * (float fields, and high-cardinality int fields), and the plot
 * already colors them; this shows what the colors mean.
 */
import { Text, TextBadge, TextColor, TextVariant } from "@voxel51/voodo";
import {
  DEFAULT_RAMP,
  rampDomain,
  rampGradient,
  RAMPS,
  type Ramp,
  type RampId,
} from "./colors";
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
  rampId = DEFAULT_RAMP,
}: {
  field: string;
  meta: ColorMeta;
  /** Which palette the plot is coloring with; the bar has to be that one */
  rampId?: RampId;
}) {
  const { min, max } = meta;
  if (meta.style !== "continuous" || min == null || max == null) return null;

  // Typed as Ramp, not the literal RAMPS member: only one member declares
  // `diverging`, so the union hides the flag the domain turns on
  const ramp: Ramp = RAMPS[rampId];
  // The ends label the RAMP's range, not the data's: a zero-centered ramp is
  // symmetric, so one end sits past the data and labelling it with the field's
  // min/max would point at a color nothing ever gets
  const [lo, hi] = rampDomain(min, max, ramp);
  const zeroCentered = lo < 0 && hi > 0 && ramp.diverging === true;

  return (
    <FloatingPanel
      aria-label="Color legend"
      title={<TextBadge color={TextColor.Secondary}>{field}</TextBadge>}
      titleText={field}
    >
      <div className="emb-legend-ramp">
        <div
          className="emb-legend-ramp-track"
          style={{ background: rampGradient(rampId) }}
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
