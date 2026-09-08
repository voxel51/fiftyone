/** Default opacity multiplier for splat assets without an authored value. */
export const DEFAULT_SPLAT_OPACITY = 1;

/** Default color multiplier for splat assets without an authored value. */
export const DEFAULT_SPLAT_TINT = "#ffffff";

/** User-facing splat LoD presets. */
export type SplatDetail = "low" | "standard" | "high";

/** User-facing splat sorting modes. */
export type SplatSorting = "stable" | "accurate";

/** Maximum spherical harmonics degree used for view-dependent color. */
export type SplatShDegree = 0 | 1 | 2 | 3;

/** Browser-persisted Spark rendering preferences. */
export interface Fo3dSplatSettings {
  detail: SplatDetail;
  sharpness: number;
  sorting: SplatSorting;
  maxSh: SplatShDegree;
}

/** Performance-first Spark rendering defaults. */
export const DEFAULT_SPLAT_SETTINGS: Fo3dSplatSettings = {
  detail: "low",
  sharpness: 1,
  sorting: "stable",
  maxSh: 0,
};

/** Labels and values for the splat detail control. */
export const SPLAT_DETAIL_OPTIONS: Record<string, SplatDetail> = {
  Low: "low",
  Standard: "standard",
  High: "high",
};

/** Labels and values for the splat sorting control. */
export const SPLAT_SORTING_OPTIONS: Record<string, SplatSorting> = {
  Stable: "stable",
  Accurate: "accurate",
};

/** Labels and values for the view-dependent color control. */
export const SPLAT_SH_OPTIONS: Record<string, SplatShDegree> = {
  Off: 0,
  Low: 1,
  Medium: 2,
  Full: 3,
};

const SPLAT_DETAIL_SCALES: Record<SplatDetail, number> = {
  low: 0.5,
  standard: 1,
  high: 2,
};

const SPLAT_DETAILS = new Set<SplatDetail>(["low", "standard", "high"]);
const SPLAT_SORTING_MODES = new Set<SplatSorting>(["stable", "accurate"]);
const SPLAT_SH_DEGREES = new Set<SplatShDegree>([0, 1, 2, 3]);

/** Minimum supported Spark focal adjustment. */
export const MIN_SPLAT_SHARPNESS = 0.5;

/** Maximum supported Spark focal adjustment. */
export const MAX_SPLAT_SHARPNESS = 2;

/** Returns a complete, bounded splat preference object from browser data. */
export const normalizeSplatSettings = (
  settings?: unknown,
): Fo3dSplatSettings => {
  const stored =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>)
      : {};
  const detail = SPLAT_DETAILS.has(stored.detail as SplatDetail)
    ? (stored.detail as SplatDetail)
    : DEFAULT_SPLAT_SETTINGS.detail;
  const sorting = SPLAT_SORTING_MODES.has(stored.sorting as SplatSorting)
    ? (stored.sorting as SplatSorting)
    : DEFAULT_SPLAT_SETTINGS.sorting;
  const maxSh = SPLAT_SH_DEGREES.has(stored.maxSh as SplatShDegree)
    ? (stored.maxSh as SplatShDegree)
    : DEFAULT_SPLAT_SETTINGS.maxSh;
  const sharpness =
    typeof stored.sharpness === "number" && Number.isFinite(stored.sharpness)
      ? Math.min(
          MAX_SPLAT_SHARPNESS,
          Math.max(MIN_SPLAT_SHARPNESS, stored.sharpness),
        )
      : DEFAULT_SPLAT_SETTINGS.sharpness;

  return { detail, sharpness, sorting, maxSh };
};

/** Maps the user-facing detail preset to Spark's LoD budget multiplier. */
export const getSplatLodScale = (detail: SplatDetail) => {
  return SPLAT_DETAIL_SCALES[detail];
};

/** Maps the sorting preference to Spark's radial/depth flag. */
export const getSplatSortRadial = (sorting: SplatSorting) => {
  return sorting === "stable";
};
