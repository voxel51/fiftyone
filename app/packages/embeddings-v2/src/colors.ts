/**
 * Maps v2 color columns to the renderer's flat rgb triplets. The
 * palettes are placeholders pending integration with the App's
 * configurable color scheme.
 */
import { PALETTE } from "./renderer";
import type { ColorValues } from "./protocol";

export const MISSING_CATEGORY = 0xffff;

const MISSING_RGB: [number, number, number] = [0.45, 0.45, 0.45];
// Continuous ramp endpoints (cool blue -> Voxel51 orange)
const RAMP_LO: [number, number, number] = [0.15, 0.4, 0.9];
const RAMP_HI: [number, number, number] = [1.0, 0.65, 0.0];

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
export const rampCss = (t: number): string => {
  const at = (channel: number) =>
    Math.round(
      Math.fround(
        RAMP_LO[channel] + t * (RAMP_HI[channel] - RAMP_LO[channel]),
      ) * 255,
    );
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`;
};

/** Expands a color column into Float32Array(n*3) rgb for the renderer */
export function buildColors(
  column: ColorValues,
  range?: { min: number | null; max: number | null },
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
  const span = hi - lo || 1;
  const colors = new Float32Array(values.length * 3);
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (Number.isNaN(value)) {
      colors.set(MISSING_RGB, i * 3);
      continue;
    }
    const t = Math.min(1, Math.max(0, (value - lo) / span));
    colors[i * 3] = RAMP_LO[0] + t * (RAMP_HI[0] - RAMP_LO[0]);
    colors[i * 3 + 1] = RAMP_LO[1] + t * (RAMP_HI[1] - RAMP_LO[1]);
    colors[i * 3 + 2] = RAMP_LO[2] + t * (RAMP_HI[2] - RAMP_LO[2]);
  }
  return colors;
}
