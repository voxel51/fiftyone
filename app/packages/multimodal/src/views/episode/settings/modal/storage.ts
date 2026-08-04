import {
  DEFAULT_POINT_CLOUD_COLORMAP,
  POINT_CLOUD_COLORMAPS,
  normalizePointCloudColormap,
  type PointCloudColormap,
} from "../../../../visualization/scene-3d";
import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "../../../../visualization/panel-ui/style-tokens";
import type {
  ImageDisplayMode,
  ImageGeometryMode,
} from "../../spatial/camera-geometry/camera-model";
import {
  DEFAULT_POINT_CLOUD_POINT_SIZE,
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

/**
 * Stream-keyed styling persisted per settings scope (one dataset or ad hoc
 * recording source). Bare stream names collide across unrelated datasets —
 * two recordings sharing `/lidar_top` are not one preference — so these
 * maps are isolated from the unscoped top-level maps.
 */
export interface ScopedModalSettings {
  readonly imageLabelStreams: Record<string, readonly string[]>;
  readonly imageProjection: Record<string, ImageProjectionSettings>;
  readonly pointCloudColors: Record<string, PersistedPointCloudColorSettings>;
}

/**
 * Full localStorage payload for browser-wide episode modal preferences.
 *
 * Device-global appearance preferences live at the top level. Stream-keyed
 * styling additionally lives under `scoped`, keyed by settings scope; the
 * top-level stream maps serve unscoped playback hosts.
 */
export interface PersistedModalSettings {
  readonly imageLabelStreams: Record<string, readonly string[]>;
  readonly imageProjection: Record<string, ImageProjectionSettings>;
  readonly pinholeCamera: PinholeCameraSettings;
  readonly pointCloudColors: Record<string, PersistedPointCloudColorSettings>;
  readonly pointCloudPointSize: number;
  readonly referenceGrid: ReferenceGridSettings;
  readonly sceneBackground: SceneBackgroundSettings;
  readonly scoped: Record<string, ScopedModalSettings>;
  readonly showPointCloudColorLegend: boolean;
}

const STORAGE_KEY = "fiftyone.episode.modal-settings.v3";

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

interface PointCloudSourceLike {
  readonly id: string;
  readonly label?: string;
  readonly sourceName: string;
}

/**
 * Chooses a stable default point-cloud color preset for a source list.
 */
export function defaultPointCloudColorForSource(
  source: PointCloudSourceLike,
  sources: readonly PointCloudSourceLike[],
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

function isLidarSource(source: PointCloudSourceLike): boolean {
  return source.sourceName.toLowerCase().includes("lidar");
}

const SCENE_BACKGROUND_MODES: readonly SceneBackgroundMode[] = [
  "solid",
  "abyss",
  "studio",
];

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * Empty per-scope styling payload.
 */
export const EMPTY_SCOPED_SETTINGS: ScopedModalSettings = {
  imageLabelStreams: {},
  imageProjection: {},
  pointCloudColors: {},
};

/**
 * Most scopes retained in the persisted payload. Writes re-insert their
 * scope last, so pruning drops the least recently written datasets first.
 */
export const MAX_SETTINGS_SCOPES = 20;

/**
 * Complete default episode modal settings payload.
 */
export const DEFAULT_MODAL_SETTINGS: PersistedModalSettings = {
  imageLabelStreams: {},
  imageProjection: {},
  pinholeCamera: DEFAULT_PINHOLE_CAMERA,
  pointCloudColors: {},
  pointCloudPointSize: DEFAULT_POINT_CLOUD_POINT_SIZE,
  referenceGrid: DEFAULT_REFERENCE_GRID,
  sceneBackground: DEFAULT_SCENE_BACKGROUND,
  scoped: {},
  showPointCloudColorLegend: false,
};

/**
 * Reads persisted episode modal settings from local storage.
 */
export function readModalSettings(): PersistedModalSettings {
  try {
    const storage = globalThis.localStorage;
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MODAL_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_MODAL_SETTINGS;
    }

    const candidate = parsed as Partial<PersistedModalSettings>;
    return {
      imageLabelStreams: normalizeImageLabelStreamMap(
        candidate.imageLabelStreams,
      ),
      imageProjection: normalizeImageProjectionMap(candidate.imageProjection),
      pinholeCamera: normalizePinholeCamera(candidate.pinholeCamera),
      pointCloudColors: normalizePointCloudColorMap(candidate.pointCloudColors),
      pointCloudPointSize: normalizePointCloudPointSize(
        candidate.pointCloudPointSize,
      ),
      referenceGrid: normalizeReferenceGrid(candidate.referenceGrid),
      sceneBackground: normalizeSceneBackground(candidate.sceneBackground),
      scoped: normalizeScopedSettingsMap(candidate.scoped),
      showPointCloudColorLegend:
        typeof candidate.showPointCloudColorLegend === "boolean"
          ? candidate.showPointCloudColorLegend
          : false,
    };
  } catch {
    return DEFAULT_MODAL_SETTINGS;
  }
}

/**
 * Writes the full persisted episode modal settings payload.
 */
export function writeModalSettings(settings: PersistedModalSettings): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify(normalizeModalSettings(settings)),
    );
  } catch {
    // Settings persistence is a convenience; storage failures should not
    // interrupt playback.
  }
}

/**
 * Normalizes a full episode modal settings payload before persistence.
 */
export function normalizeModalSettings(
  settings: PersistedModalSettings,
): PersistedModalSettings {
  return {
    imageLabelStreams: normalizeImageLabelStreamMap(settings.imageLabelStreams),
    imageProjection: normalizeImageProjectionMap(settings.imageProjection),
    pinholeCamera: normalizePinholeCamera(settings.pinholeCamera),
    pointCloudColors: normalizePointCloudColorMap(settings.pointCloudColors),
    pointCloudPointSize: normalizePointCloudPointSize(
      settings.pointCloudPointSize,
    ),
    referenceGrid: normalizeReferenceGrid(settings.referenceGrid),
    sceneBackground: normalizeSceneBackground(settings.sceneBackground),
    scoped: normalizeScopedSettingsMap(settings.scoped),
    showPointCloudColorLegend: settings.showPointCloudColorLegend === true,
  };
}

/**
 * Normalizes the per-scope styling map: each entry's stream maps go through
 * the same normalizers as the top-level maps, entries left empty are
 * dropped, and only the last `MAX_SETTINGS_SCOPES` entries survive —
 * writes re-insert their scope last, so insertion order is recency order.
 */
export function normalizeScopedSettingsMap(
  value: unknown,
): Record<string, ScopedModalSettings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const entries: [string, ScopedModalSettings][] = [];
  for (const [scope, scopedValue] of Object.entries(value)) {
    const normalizedScope = scope.trim();
    if (!normalizedScope) continue;
    const scoped = normalizeScopedSettings(scopedValue);
    if (
      Object.keys(scoped.imageLabelStreams).length === 0 &&
      Object.keys(scoped.imageProjection).length === 0 &&
      Object.keys(scoped.pointCloudColors).length === 0
    ) {
      continue;
    }
    entries.push([normalizedScope, scoped]);
  }

  return Object.fromEntries(entries.slice(-MAX_SETTINGS_SCOPES));
}

/**
 * Normalizes one scope's styling payload.
 */
export function normalizeScopedSettings(value: unknown): ScopedModalSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return EMPTY_SCOPED_SETTINGS;
  }

  const candidate = value as Partial<ScopedModalSettings>;
  return {
    imageLabelStreams: normalizeImageLabelStreamMap(
      candidate.imageLabelStreams,
    ),
    imageProjection: normalizeImageProjectionMap(candidate.imageProjection),
    pointCloudColors: normalizePointCloudColorMap(candidate.pointCloudColors),
  };
}

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
 * Normalizes persisted per-image-stream pointcloud projection settings.
 */
export function normalizeImageProjectionMap(
  value: unknown,
): Record<string, ImageProjectionSettings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, ImageProjectionSettings> = {};
  for (const [imageStream, settings] of Object.entries(value)) {
    const normalizedImageStream = imageStream.trim();
    if (!normalizedImageStream) continue;
    result[normalizedImageStream] = normalizeImageProjection(settings);
  }
  return result;
}

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
 * Normalizes persisted image-stream to label-stream selections.
 */
export function normalizeImageLabelStreamMap(
  value: unknown,
): Record<string, readonly string[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, readonly string[]> = {};
  for (const [imageStream, labelStreams] of Object.entries(value)) {
    const normalizedImageStream = imageStream.trim();
    if (!normalizedImageStream) continue;
    result[normalizedImageStream] = normalizeStreamList(labelStreams);
  }
  return result;
}

/**
 * Normalizes a list of stream names by trimming, filtering, and deduplicating.
 */
export function normalizeStreamList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((stream) => (typeof stream === "string" ? stream.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function normalizeOptionalStream(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return value.trim() || null;
}

/**
 * Normalizes persisted per-stream point-cloud color overrides.
 */
export function normalizePointCloudColorMap(
  value: unknown,
): Record<string, PersistedPointCloudColorSettings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, PersistedPointCloudColorSettings> = {};
  for (const [stream, settings] of Object.entries(value)) {
    const normalizedStream = stream.trim();
    if (!normalizedStream) continue;
    result[normalizedStream] = normalizePointCloudColor(settings);
  }
  return result;
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
      typeof candidate.colorBy === "string" && candidate.colorBy.trim()
        ? candidate.colorBy.trim()
        : DEFAULT_POINT_CLOUD_COLOR.colorBy,
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
