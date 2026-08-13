import {
  DEFAULT_POINT_CLOUD_COLORMAP,
  POINT_CLOUD_COLORMAPS,
  normalizePointCloudColormap,
  type PointCloudColorOptions,
  type PointCloudColormap,
} from "../../../../visualization/scene-3d";
import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "../../../../visualization/panel-ui/style-tokens";
import { sanitizeBoundedStringList } from "../../../../utils/bounded-string-list";
import type {
  ImageDisplayMode,
  ImageGeometryMode,
} from "../../spatial/camera-geometry/camera-model";
import {
  DEFAULT_PROJECTION_POINT_SIZE,
  normalizePointSize,
} from "../../presentation/point-size-policy";

export {
  DEFAULT_POINT_CLOUD_POINT_SIZE,
  DEFAULT_PROJECTION_POINT_SIZE,
  MAX_POINT_CLOUD_POINT_SIZE,
  POINT_CLOUD_POINT_SIZE_STEP,
  MIN_POINT_CLOUD_POINT_SIZE,
} from "../../presentation/point-size-policy";

/**
 * Appearance of the 3D tile's world reference grid.
 */
export interface ReferenceGridSettings {
  readonly enabled: boolean;
  /** Peak line opacity, percent (0-100). */
  readonly opacityPercent: number;
  /** Closest line spacing in meters; lines adapt by powers of ten. */
  readonly spacingM: number;
}

/**
 * Appearance of camera-calibration frustums in the 3D tile.
 */
export interface PinholeCameraSettings {
  /** Distance from optical center to image plane, in meters. */
  readonly imagePlaneDepthM: number;
  /** Base frustum/image-plane opacity, percent (0-100). */
  readonly opacityPercent: number;
}

/**
 * 3D scene backdrop styles: a solid color or a named gradient profile.
 */
export type SceneBackgroundMode = "solid" | "abyss" | "studio";

/**
 * Persisted 3D scene background choice.
 */
export interface SceneBackgroundSettings {
  readonly mode: SceneBackgroundMode;
  /** Hex color (#rrggbb) used while `mode` is "solid". */
  readonly solidColor: string;
}

/**
 * How one point-cloud stream is colored in the 3D tile.
 */
export interface PersistedPointCloudColorSettings {
  readonly colorBy: string;
  readonly colormap: PointCloudColormap;
  readonly rangeMax: number | null;
  readonly rangeMin: number | null;
  readonly uniformColor: string;
}

/**
 * Per-image-stream pointcloud projection preferences. Projected dots
 * inherit each cloud's 3D colour settings; point size is the
 * projection's own knob because dots compete with photographic detail,
 * not a dark void.
 */
export interface ImageProjectionSettings {
  /** Explicit calibration stream; null uses the scene-inventory association. */
  readonly calibrationStream: string | null;
  /** Presentation of the recorded pixels; rectified is an explicit remap. */
  readonly display: ImageDisplayMode;
  readonly enabled: boolean;
  /** Recorded image pixel geometry; Auto blocks materially ambiguous models. */
  readonly geometry: ImageGeometryMode;
  /** Dot size, on the same scale as the 3D point size. */
  readonly pointSize: number;
  /** Explicit cloud streams to project; null projects every cloud. */
  readonly streams: readonly string[] | null;
}

const MAX_SETTINGS_STREAMS = 128;
const MAX_SETTINGS_STREAM_LENGTH = 512;

/**
 * Default world reference grid shown in the 3D episode tile.
 */
export const DEFAULT_REFERENCE_GRID: ReferenceGridSettings = {
  enabled: true,
  opacityPercent: 5,
  spacingM: 1,
};

const MIN_GRID_SPACING_M = 0.01;
const MAX_GRID_SPACING_M = 10_000;

/**
 * Default appearance for camera calibration frustums.
 */
export const DEFAULT_PINHOLE_CAMERA: PinholeCameraSettings = {
  imagePlaneDepthM: 2.75,
  opacityPercent: 85,
};

const MIN_PINHOLE_DEPTH_M = 0.05;
const MAX_PINHOLE_DEPTH_M = 100;

/**
 * Default 3D scene background for episode playback.
 */
export const DEFAULT_SCENE_BACKGROUND: SceneBackgroundSettings = {
  mode: "abyss",
  solidColor: VISUALIZATION_PANEL_BACKGROUND_COLOR,
};

/**
 * Default point-cloud color override before source-specific defaults apply.
 */
export const DEFAULT_POINT_CLOUD_COLOR: PersistedPointCloudColorSettings = {
  colorBy: "auto",
  colormap: DEFAULT_POINT_CLOUD_COLORMAP,
  rangeMax: null,
  rangeMin: null,
  uniformColor: "#b8c2d1",
};

const POINT_CLOUD_COLORMAPS_WITHOUT_TURBO = POINT_CLOUD_COLORMAPS.filter(
  (colormap) => colormap !== "turbo",
);

/**
 * Chooses a stable default point-cloud color preset by source index.
 */
export function defaultPointCloudColorForIndex(
  index: number,
): PersistedPointCloudColorSettings {
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return {
    ...DEFAULT_POINT_CLOUD_COLOR,
    colormap: POINT_CLOUD_COLORMAPS[safeIndex % POINT_CLOUD_COLORMAPS.length],
  };
}

/** Source identity used to derive deterministic point-cloud color defaults. */
export interface PointCloudColorSource {
  readonly id: string;
  readonly label?: string;
  readonly sourceName: string;
}

/**
 * Chooses a stable default point-cloud color preset for a source list.
 */
export function defaultPointCloudColorForSource(
  source: PointCloudColorSource,
  sources: readonly PointCloudColorSource[],
): PersistedPointCloudColorSettings {
  const sourceIndex = sources.findIndex(
    (candidate) => candidate.id === source.id,
  );
  const safeIndex = sourceIndex >= 0 ? sourceIndex : 0;
  const firstLidarIndex = sources.findIndex(isLidarSource);
  if (safeIndex === firstLidarIndex) {
    return {
      ...DEFAULT_POINT_CLOUD_COLOR,
      colormap: "turbo",
    };
  }
  if (firstLidarIndex < 0) {
    return defaultPointCloudColorForIndex(safeIndex);
  }

  const distributedIndex =
    safeIndex > firstLidarIndex ? safeIndex - 1 : safeIndex;
  const colormapIndex =
    distributedIndex % POINT_CLOUD_COLORMAPS_WITHOUT_TURBO.length;
  return {
    ...DEFAULT_POINT_CLOUD_COLOR,
    colormap:
      POINT_CLOUD_COLORMAPS_WITHOUT_TURBO[colormapIndex] ??
      DEFAULT_POINT_CLOUD_COLORMAP,
  };
}

/** Resolves the effective render colors for one point-cloud stream. */
export function resolvePointCloudColorOptions(
  stream: string,
  sources: readonly PointCloudColorSource[],
  override: PersistedPointCloudColorSettings | undefined,
): PointCloudColorOptions {
  const source = sources.find((candidate) => candidate.id === stream) ?? {
    id: stream,
    label: stream,
    sourceName: "",
  };
  const settings = {
    ...defaultPointCloudColorForSource(source, sources),
    ...override,
  };
  return {
    colorBy: settings.colorBy,
    colormap: settings.colormap,
    ...(settings.rangeMax !== null ? { rangeMax: settings.rangeMax } : {}),
    ...(settings.rangeMin !== null ? { rangeMin: settings.rangeMin } : {}),
    uniformColor: settings.uniformColor,
  };
}

function isLidarSource(source: PointCloudColorSource): boolean {
  return source.sourceName.toLowerCase().includes("lidar");
}

const SCENE_BACKGROUND_MODES: readonly SceneBackgroundMode[] = [
  "solid",
  "abyss",
  "studio",
];

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * Default pointcloud projection settings for one image stream.
 */
export const DEFAULT_IMAGE_PROJECTION: ImageProjectionSettings = {
  calibrationStream: null,
  display: "recorded",
  enabled: false,
  geometry: "auto",
  pointSize: DEFAULT_PROJECTION_POINT_SIZE,
  streams: [],
} as const;

/**
 * Normalizes one pointcloud projection settings entry.
 */
export function normalizeImageProjection(
  value: unknown,
): ImageProjectionSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_IMAGE_PROJECTION;
  }

  const candidate = value as Partial<ImageProjectionSettings>;
  const rawStreams = candidate.streams;
  const streams =
    rawStreams === null || rawStreams === undefined
      ? null
      : normalizeStreamList(rawStreams);
  const enabled =
    candidate.enabled === true && (streams === null || streams.length > 0);
  return {
    calibrationStream: normalizeOptionalStream(candidate.calibrationStream),
    display: normalizeImageDisplay(candidate.display),
    enabled,
    geometry: normalizeImageGeometry(candidate.geometry),
    pointSize: normalizePointSize(
      candidate.pointSize,
      DEFAULT_PROJECTION_POINT_SIZE,
    ),
    streams: enabled ? streams : [],
  };
}

/** Returns a supported image presentation mode or the recorded pixels. */
export function normalizeImageDisplay(value: unknown): ImageDisplayMode {
  return value === "rectified" ? value : "recorded";
}

/** Returns a supported image-geometry mode or Auto. */
export function normalizeImageGeometry(value: unknown): ImageGeometryMode {
  return value === "original" || value === "rectified" ? value : "auto";
}

/**
 * Normalizes a list of stream names by trimming, filtering, and deduplicating.
 */
export function normalizeStreamList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return sanitizeBoundedStringList(
    value.map((stream) =>
      typeof stream === "string" ? stream.trim() : stream,
    ),
    MAX_SETTINGS_STREAMS,
    MAX_SETTINGS_STREAM_LENGTH,
  );
}

function normalizeOptionalStream(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return normalizeSettingsStreamKey(value);
}

/**
 * Normalizes one point-cloud color settings object.
 */
export function normalizePointCloudColor(
  value: unknown,
): PersistedPointCloudColorSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_POINT_CLOUD_COLOR;
  }

  const candidate = value as Partial<PersistedPointCloudColorSettings>;
  return {
    colorBy:
      normalizeSettingsStreamKey(candidate.colorBy ?? "") ??
      DEFAULT_POINT_CLOUD_COLOR.colorBy,
    colormap: normalizePointCloudColormap(candidate.colormap),
    // Range ends are kept independently: an inverted pair simply does not
    // apply as a fixed range until the user finishes editing it.
    rangeMax: finiteOrNull(candidate.rangeMax),
    rangeMin: finiteOrNull(candidate.rangeMin),
    uniformColor: normalizeHexColor(
      candidate.uniformColor,
      DEFAULT_POINT_CLOUD_COLOR.uniformColor,
    ),
  };
}

function normalizeSettingsStreamKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const stream = value.trim();
  return stream && stream.length <= MAX_SETTINGS_STREAM_LENGTH ? stream : null;
}

/**
 * Clamps a point-cloud point size to the supported settings range.
 */
export function normalizePointCloudPointSize(value: unknown): number {
  return normalizePointSize(value);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value)
    ? value.toLowerCase()
    : fallback;
}

/**
 * Normalizes the 3D reference grid settings object.
 */
export function normalizeReferenceGrid(value: unknown): ReferenceGridSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_REFERENCE_GRID;
  }

  const candidate = value as Partial<ReferenceGridSettings>;
  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : DEFAULT_REFERENCE_GRID.enabled,
    opacityPercent: clampNumber(
      candidate.opacityPercent,
      0,
      100,
      DEFAULT_REFERENCE_GRID.opacityPercent,
    ),
    spacingM: clampNumber(
      candidate.spacingM,
      MIN_GRID_SPACING_M,
      MAX_GRID_SPACING_M,
      DEFAULT_REFERENCE_GRID.spacingM,
    ),
  };
}

/**
 * Normalizes camera frustum display settings.
 */
export function normalizePinholeCamera(value: unknown): PinholeCameraSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_PINHOLE_CAMERA;
  }

  const candidate = value as Partial<PinholeCameraSettings>;
  return {
    imagePlaneDepthM: clampNumber(
      candidate.imagePlaneDepthM,
      MIN_PINHOLE_DEPTH_M,
      MAX_PINHOLE_DEPTH_M,
      DEFAULT_PINHOLE_CAMERA.imagePlaneDepthM,
    ),
    opacityPercent: clampNumber(
      candidate.opacityPercent,
      0,
      100,
      DEFAULT_PINHOLE_CAMERA.opacityPercent,
    ),
  };
}

/**
 * Normalizes the 3D scene background settings object.
 */
export function normalizeSceneBackground(
  value: unknown,
): SceneBackgroundSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_SCENE_BACKGROUND;
  }

  const candidate = value as Partial<SceneBackgroundSettings>;
  return {
    mode: SCENE_BACKGROUND_MODES.includes(candidate.mode as SceneBackgroundMode)
      ? (candidate.mode as SceneBackgroundMode)
      : DEFAULT_SCENE_BACKGROUND.mode,
    solidColor:
      typeof candidate.solidColor === "string" &&
      HEX_COLOR_PATTERN.test(candidate.solidColor)
        ? candidate.solidColor.toLowerCase()
        : DEFAULT_SCENE_BACKGROUND.solidColor,
  };
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}
