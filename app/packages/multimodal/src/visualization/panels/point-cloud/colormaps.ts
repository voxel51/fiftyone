import colormap from "colormap";

import { clamp01 } from "./utils";

export interface PointCloudColorStop {
  readonly color: string;
  readonly value: number;
}

export interface PointCloudCustomColormap {
  readonly list: readonly PointCloudColorStop[];
  readonly name?: string;
}

export const POINT_CLOUD_COLORMAPS = [
  "coolwarm",
  "grayscale",
  "inferno",
  "jet",
  "magma",
  "plasma",
  "turbo",
  "viridis",
  "cyantoyellow",
] as const;

export type PointCloudColormapName = (typeof POINT_CLOUD_COLORMAPS)[number];

export type PointCloudColormap =
  | PointCloudColormapName
  | PointCloudCustomColormap;

export interface PointCloudColormapLookup {
  readonly colors: Float32Array;
  readonly colormap: PointCloudColormap;
  readonly size: number;
}

export const DEFAULT_POINT_CLOUD_COLORMAP: PointCloudColormapName = "coolwarm";

export const POINT_CLOUD_COLORMAP_LABELS: Record<
  PointCloudColormapName,
  string
> = {
  coolwarm: "Cool-warm",
  cyantoyellow: "Cyan to yellow",
  grayscale: "Grayscale",
  inferno: "Inferno",
  jet: "Jet",
  magma: "Magma",
  plasma: "Plasma",
  turbo: "Turbo",
  viridis: "Viridis",
};

export const MIN_POINT_CLOUD_COLORMAP_STOPS = 2;
export const MAX_POINT_CLOUD_COLORMAP_STOPS = 256;

const DEFAULT_PRESET_STOP_COUNT = 128;
const LOOKUP_SIZE = 256;
const RGB_COMPONENTS = 3;
const RGB_MAX = 255;

const EXPLICIT_COLOR_MAPS: Record<string, readonly PointCloudColorStop[]> = {
  coolwarm: [
    { value: 0, color: "#408cff" },
    { value: 0.5, color: "#40e6ff" },
    { value: 1, color: "#ffe685" },
  ],
  grayscale: [
    { value: 0, color: "#000000" },
    { value: 0.1111, color: "#1c1c1c" },
    { value: 0.2222, color: "#383838" },
    { value: 0.3333, color: "#555555" },
    { value: 0.4444, color: "#717171" },
    { value: 0.5556, color: "#8e8e8e" },
    { value: 0.6667, color: "#aaaaaa" },
    { value: 0.7778, color: "#c7c7c7" },
    { value: 0.8889, color: "#e3e3e3" },
    { value: 1, color: "#ffffff" },
  ],
  turbo: [
    { value: 0, color: "#30123b" },
    { value: 0.1111, color: "#4661d6" },
    { value: 0.2222, color: "#37a8fa" },
    { value: 0.3333, color: "#1ae4b6" },
    { value: 0.4444, color: "#71fe5f" },
    { value: 0.5556, color: "#c8ef34" },
    { value: 0.6667, color: "#faba39" },
    { value: 0.7778, color: "#f56918" },
    { value: 0.8889, color: "#ca2a04" },
    { value: 1, color: "#7a0403" },
  ],
  cyantoyellow: [
    { value: 0, color: "#00ffff" },
    { value: 0.1111, color: "#008fff" },
    { value: 0.2222, color: "#001fff" },
    { value: 0.3333, color: "#3838e2" },
    { value: 0.4444, color: "#8383bd" },
    { value: 0.5556, color: "#aca892" },
    { value: 0.6667, color: "#b1a764" },
    { value: 0.7778, color: "#beb13a" },
    { value: 0.8889, color: "#ded81d" },
    { value: 1, color: "#ffff00" },
  ],
};

const HEX_COLOR_PATTERN = /^#?([0-9a-f]{6})$/i;

export function getGradientFromSchemeName(
  schemeName: string,
  numStops = DEFAULT_PRESET_STOP_COUNT,
): readonly PointCloudColorStop[] {
  const normalizedName = normalizePointCloudColormapName(schemeName);
  if (normalizedName in EXPLICIT_COLOR_MAPS) {
    return EXPLICIT_COLOR_MAPS[normalizedName];
  }

  const stopCount = normalizeStopCount(numStops);
  try {
    const colors = colormap({
      alpha: 1,
      colormap: normalizedName,
      format: "hex",
      nshades: stopCount,
    }) as string[];

    return colors.map((color, index) => ({
      color: normalizeHexColor(color) ?? "#000000",
      value: index / (stopCount - 1),
    }));
  } catch {
    return EXPLICIT_COLOR_MAPS[DEFAULT_POINT_CLOUD_COLORMAP];
  }
}

export function createPointCloudColormapLookup(
  colormap: PointCloudColormap,
  size = LOOKUP_SIZE,
): PointCloudColormapLookup {
  const normalized = normalizePointCloudColormap(colormap);
  const stops = getPointCloudColormapStops(normalized);
  const lookupSize = Math.max(2, Math.round(size));
  const colors = new Float32Array(lookupSize * RGB_COMPONENTS);

  for (let index = 0; index < lookupSize; index++) {
    writeSampledStopColor(
      colors,
      index * RGB_COMPONENTS,
      stops,
      index / (lookupSize - 1),
    );
  }

  return { colors, colormap: normalized, size: lookupSize };
}

export function writeColormapLookupColor(
  target: Float32Array,
  offset: number,
  lookup: PointCloudColormapLookup,
  t: number,
): void {
  const value = clamp01(t) * (lookup.size - 1);
  const lowerIndex = Math.floor(value);
  const upperIndex = Math.min(lookup.size - 1, lowerIndex + 1);
  const factor = value - lowerIndex;
  const lowerOffset = lowerIndex * RGB_COMPONENTS;
  const upperOffset = upperIndex * RGB_COMPONENTS;

  target[offset] =
    lookup.colors[lowerOffset] +
    (lookup.colors[upperOffset] - lookup.colors[lowerOffset]) * factor;
  target[offset + 1] =
    lookup.colors[lowerOffset + 1] +
    (lookup.colors[upperOffset + 1] - lookup.colors[lowerOffset + 1]) * factor;
  target[offset + 2] =
    lookup.colors[lowerOffset + 2] +
    (lookup.colors[upperOffset + 2] - lookup.colors[lowerOffset + 2]) * factor;
}

export function writeColormapColor(
  target: Float32Array,
  offset: number,
  colormap: PointCloudColormap,
  t: number,
): void {
  writeSampledStopColor(
    target,
    offset,
    getPointCloudColormapStops(normalizePointCloudColormap(colormap)),
    t,
  );
}

export function sampleColormap(
  colormap: PointCloudColormap,
  t: number,
): readonly [number, number, number] {
  const sample = new Float32Array(RGB_COMPONENTS);
  writeColormapColor(sample, 0, colormap, t);
  return [sample[0], sample[1], sample[2]];
}

export function colormapCssGradient(colormap: PointCloudColormap): string {
  const stops = getPointCloudColormapStops(
    normalizePointCloudColormap(colormap),
  );
  return `linear-gradient(90deg, ${stops
    .map((stop) => `${stop.color} ${Math.round(stop.value * 100)}%`)
    .join(", ")})`;
}

export function pointCloudColormapKey(colormap: PointCloudColormap): string {
  const normalized = normalizePointCloudColormap(colormap);
  if (typeof normalized === "string") {
    return normalized;
  }

  const name = normalized.name ?? "custom";
  return `${name}:${normalized.list
    .map((stop) => `${roundStopValue(stop.value)}=${stop.color}`)
    .join(";")}`;
}

export function pointCloudColormapLabel(colormap: PointCloudColormap): string {
  const normalized = normalizePointCloudColormap(colormap);
  if (typeof normalized === "string") {
    return POINT_CLOUD_COLORMAP_LABELS[normalized];
  }

  return normalized.name ? `${normalized.name} (custom)` : "Custom";
}

export function isPointCloudColormapName(
  value: unknown,
): value is PointCloudColormapName {
  return POINT_CLOUD_COLORMAPS.includes(
    normalizePointCloudColormapName(value) as PointCloudColormapName,
  );
}

export function normalizePointCloudColormap(
  value: unknown,
): PointCloudColormap {
  if (typeof value === "string") {
    const normalizedName = normalizePointCloudColormapName(value);
    return isPointCloudColormapName(normalizedName)
      ? normalizedName
      : DEFAULT_POINT_CLOUD_COLORMAP;
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const candidate = value as Partial<PointCloudCustomColormap>;
    const list = normalizeColorStops(candidate.list);
    if (list) {
      return {
        list,
        ...(typeof candidate.name === "string" && candidate.name.trim()
          ? { name: candidate.name.trim() }
          : {}),
      };
    }
  }

  return DEFAULT_POINT_CLOUD_COLORMAP;
}

export function normalizeColorStops(
  value: unknown,
): readonly PointCloudColorStop[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const byValue = new Map<number, PointCloudColorStop>();
  for (const stop of value) {
    if (typeof stop !== "object" || stop === null || Array.isArray(stop)) {
      continue;
    }
    const candidate = stop as Partial<PointCloudColorStop>;
    if (
      typeof candidate.value !== "number" ||
      !Number.isFinite(candidate.value)
    ) {
      continue;
    }
    const color = normalizeHexColor(candidate.color);
    if (!color) {
      continue;
    }
    const stopValue = roundStopValue(clamp01(candidate.value));
    byValue.set(stopValue, { color, value: stopValue });
  }

  const normalized = Array.from(byValue.values()).sort(
    (a, b) => a.value - b.value,
  );
  return normalized.length >= MIN_POINT_CLOUD_COLORMAP_STOPS
    ? normalized
    : null;
}

export function getPointCloudColormapStops(
  colormap: PointCloudColormap,
): readonly PointCloudColorStop[] {
  if (typeof colormap === "string") {
    return getGradientFromSchemeName(colormap);
  }

  return colormap.list;
}

function writeSampledStopColor(
  target: Float32Array,
  offset: number,
  stops: readonly PointCloudColorStop[],
  t: number,
): void {
  const value = clamp01(t);
  let upperIndex = stops.findIndex((stop) => stop.value >= value);
  if (upperIndex === -1) {
    upperIndex = stops.length - 1;
  }

  const upper = stops[upperIndex];
  const lower = stops[Math.max(0, upperIndex - 1)];
  const lowerRgb = hexToRgb(lower.color);
  const upperRgb = hexToRgb(upper.color);
  const span = upper.value - lower.value;
  const factor = span > 0 ? (value - lower.value) / span : 0;

  target[offset] = lowerRgb[0] + (upperRgb[0] - lowerRgb[0]) * factor;
  target[offset + 1] = lowerRgb[1] + (upperRgb[1] - lowerRgb[1]) * factor;
  target[offset + 2] = lowerRgb[2] + (upperRgb[2] - lowerRgb[2]) * factor;
}

function normalizePointCloudColormapName(value: unknown): string {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
}

function normalizeStopCount(value: number): number {
  return Math.min(
    MAX_POINT_CLOUD_COLORMAP_STOPS,
    Math.max(MIN_POINT_CLOUD_COLORMAP_STOPS, Math.round(value)),
  );
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.trim().match(HEX_COLOR_PATTERN);
  return match ? `#${match[1].toLowerCase()}` : null;
}

function hexToRgb(color: string): readonly [number, number, number] {
  const normalized = normalizeHexColor(color) ?? "#000000";
  return [
    parseInt(normalized.slice(1, 3), 16) / RGB_MAX,
    parseInt(normalized.slice(3, 5), 16) / RGB_MAX,
    parseInt(normalized.slice(5, 7), 16) / RGB_MAX,
  ];
}

function roundStopValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
