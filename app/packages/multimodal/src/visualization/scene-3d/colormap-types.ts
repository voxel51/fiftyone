/** One scalar-to-color control point in a custom point-cloud colormap. */
export interface PointCloudColorStop {
  readonly color: string;
  readonly value: number;
}

/** User-defined point-cloud color ramp. */
export interface PointCloudCustomColormap {
  readonly list: readonly PointCloudColorStop[];
  readonly name?: string;
}

/** Built-in point-cloud color ramps. */
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

/** Identifier for one built-in point-cloud color ramp. */
export type PointCloudColormapName = (typeof POINT_CLOUD_COLORMAPS)[number];

/** Built-in or user-defined point-cloud color ramp. */
export type PointCloudColormap =
  | PointCloudColormapName
  | PointCloudCustomColormap;

/** Sampled lookup table ready for point-cloud rendering. */
export interface PointCloudColormapLookup {
  readonly colors: Float32Array;
  readonly colormap: PointCloudColormap;
  readonly size: number;
}

/** Default point-cloud color ramp. */
export const DEFAULT_POINT_CLOUD_COLORMAP: PointCloudColormapName = "coolwarm";

/** User-facing labels for built-in point-cloud color ramps. */
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

/** Minimum valid number of stops in a custom point-cloud color ramp. */
export const MIN_POINT_CLOUD_COLORMAP_STOPS = 2;

/** Maximum supported number of stops in a custom point-cloud color ramp. */
export const MAX_POINT_CLOUD_COLORMAP_STOPS = 256;
