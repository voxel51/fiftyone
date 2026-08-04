/**
 * Maps v2 color columns to the renderer's flat rgb triplets. The
 * palettes are placeholders pending integration with the App's
 * configurable color scheme.
 */
import { PALETTE } from "./renderer";
import type { ColorValues } from "./protocol";

export const MISSING_CATEGORY = 0xffff;

const MISSING_RGB: [number, number, number] = [0.45, 0.45, 0.45];

type Rgb = [number, number, number];

/** A continuous ramp: evenly-spaced stops interpolated in rgb.
 *
 * `diverging` anchors the MIDDLE stop at zero by making the range symmetric
 * (±max(|min|, |max|)). Without it zero lands wherever it happens to fall, so
 * a left turn and a right turn of equal size read as the same colour.
 *
 * None of these clip: the ends of the ramp are the true extremes. What a ramp
 * changes is WHERE the perceptual contrast sits, which is the whole point when
 * the interesting values are the rare ones at the edges.
 */
export interface Ramp {
  label: string;
  hint: string;
  stops: Rgb[];
  diverging?: boolean;
}

export const RAMPS = {
  blueOrange: {
    label: "Blue → orange",
    hint: "Two-tone; extremes at the ends",
    stops: [
      [0.15, 0.4, 0.9],
      [1.0, 0.65, 0.0],
    ],
  },
  coolWarm: {
    label: "Diverging (zero-centered)",
    hint: "Signed data: zero is neutral, each direction its own hue",
    diverging: true,
    stops: [
      [0.23, 0.3, 0.75],
      [0.87, 0.87, 0.87],
      [0.71, 0.02, 0.15],
    ],
  },
  viridis: {
    label: "Viridis",
    hint: "Even contrast throughout; best when most values sit mid-range",
    // Viridis sampled from its upper three quarters, not from zero. The canvas
    // clears transparent, so the page shows through: canonical viridis starts
    // at a near-black purple that is invisible against a dark theme, and the
    // lowest values — a whole end of the range — simply would not be there.
    stops: [
      [0.229, 0.322, 0.545],
      [0.147, 0.47, 0.558],
      [0.216, 0.667, 0.5],
      [0.612, 0.858, 0.286],
      [0.993, 0.906, 0.144],
    ],
  },
  cool: {
    label: "Cool",
    hint: "Cyan → magenta; saturated at both ends",
    stops: [
      [0.0, 0.9, 1.0],
      [1.0, 0.2, 0.95],
    ],
  },
  spring: {
    label: "Spring",
    hint: "Magenta → yellow; saturated at both ends",
    stops: [
      [1.0, 0.1, 0.85],
      [1.0, 0.95, 0.2],
    ],
  },
  rainbow: {
    label: "Rainbow",
    hint: "Most separation between nearby values; ranks poorly by eye",
    // Full-hue sweep, but lifted off pure red and pure blue: those are the two
    // dark corners of a canonical rainbow (luminance 0.21 and 0.07) and they
    // are what makes its ends vanish on a dark canvas.
    //
    // Brightness does NOT track value here — it rises, falls and rises again —
    // so this shows WHICH values differ, not which is greater. That is the
    // trade a rainbow makes, and the reason it is not the default.
    stops: [
      [1.0, 0.25, 0.25],
      [1.0, 0.85, 0.1],
      [0.25, 0.95, 0.35],
      [0.2, 0.85, 1.0],
      [0.55, 0.45, 1.0],
    ],
  },
} satisfies Record<string, Ramp>;

export type RampId = keyof typeof RAMPS;

export const DEFAULT_RAMP: RampId = "blueOrange";

export const RAMP_IDS = Object.keys(RAMPS) as RampId[];

/** Whether a remembered choice still names a ramp. Panel state outlives any
 * given build, so a renamed or dropped ramp comes back as a string that would
 * index RAMPS to undefined. */
export const isRampId = (value: unknown): value is RampId =>
  typeof value === "string" && Object.hasOwn(RAMPS, value);

/** The rgb at position `t` in [0, 1] along a ramp's stops. */
function rampAt(ramp: Ramp, t: number): Rgb {
  const clamped = Math.min(1, Math.max(0, t));
  const span = ramp.stops.length - 1;
  const scaled = clamped * span;
  const i = Math.min(span - 1, Math.floor(scaled));
  const f = scaled - i;
  const a = ramp.stops[i];
  const b = ramp.stops[i + 1];
  return [
    a[0] + f * (b[0] - a[0]),
    a[1] + f * (b[1] - a[1]),
    a[2] + f * (b[2] - a[2]),
  ];
}

/** The values the ramp's two ends actually stand for.
 *
 * A diverging ramp is symmetric about zero so its middle stop IS zero, which
 * pushes one end past the data (±max(|min|, |max|)); every other ramp spans
 * min..max. A legend reads its labels from here, so it cannot name a value at
 * an end that end was never given.
 */
export function rampDomain(
  lo: number,
  hi: number,
  ramp: Ramp,
): [number, number] {
  if (ramp.diverging && lo < 0 && hi > 0) {
    const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
    return [-m, m];
  }
  return [lo, hi];
}

/** Where a value sits on the ramp. Nothing clips — the extremes stay the
 * extremes; the ramp only moves where the contrast sits. */
export function rampPosition(
  value: number,
  lo: number,
  hi: number,
  ramp: Ramp,
): number {
  const [min, max] = rampDomain(lo, hi, ramp);
  const span = max - min || 1;
  return (value - min) / span;
}

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

const PALETTE_RGB = PALETTE.map(hexToRgb);

/**
 * The CSS color a categorical class index maps to. The single source
 * for legend swatches, so they cannot drift from the point colors
 * buildColors assigns.
 */
export const categoryHex = (index: number): string =>
  PALETTE[index % PALETTE.length];

/**
 * The CSS color at position t ∈ [0, 1] on the continuous ramp — the
 * same per-channel interpolation buildColors applies (including its
 * float32 quantization), so a legend gradient built from this cannot
 * drift from the point colors.
 */
export const rampCss = (t: number, rampId: RampId = DEFAULT_RAMP): string => {
  const rgb = rampAt(RAMPS[rampId], t);
  const at = (channel: number) => Math.round(Math.fround(rgb[channel]) * 255);
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`;
};

/**
 * A left-to-right CSS gradient of a whole ramp — one color stop per ramp
 * stop, which is exactly what rampAt interpolates between, so the bar a
 * legend or a menu swatch draws is the ramp the points get. Sampling only
 * the ends would flatten every ramp of three or more stops.
 */
export const rampGradient = (rampId: RampId = DEFAULT_RAMP): string => {
  const count = RAMPS[rampId].stops.length;
  const stops = Array.from({ length: count }, (_, i) =>
    rampCss(i / (count - 1), rampId),
  );
  return `linear-gradient(90deg, ${stops.join(", ")})`;
};

/** Expands a color column into Float32Array(n*3) rgb for the renderer */
export function buildColors(
  column: ColorValues,
  range?: { min: number | null; max: number | null },
  rampId: RampId = DEFAULT_RAMP,
): Float32Array {
  if (column.style === "categorical") {
    const { indices } = column;
    const colors = new Float32Array(indices.length * 3);
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];
      const rgb =
        index === MISSING_CATEGORY
          ? MISSING_RGB
          : PALETTE_RGB[index % PALETTE_RGB.length];
      colors.set(rgb, i * 3);
    }
    return colors;
  }

  const { values } = column;
  const lo = range?.min ?? 0;
  const hi = range?.max ?? 1;
  const ramp = RAMPS[rampId];
  const colors = new Float32Array(values.length * 3);
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (Number.isNaN(value)) {
      colors.set(MISSING_RGB, i * 3);
      continue;
    }
    colors.set(rampAt(ramp, rampPosition(value, lo, hi, ramp)), i * 3);
  }
  return colors;
}
