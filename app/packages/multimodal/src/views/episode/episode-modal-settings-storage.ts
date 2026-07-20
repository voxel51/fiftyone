import {
  DEFAULT_POINT_CLOUD_COLORMAP,
  POINT_CLOUD_COLORMAPS,
  normalizePointCloudColormap,
  type PointCloudColormap,
} from "../../visualization/panels/point-cloud";
import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "../../visualization/panels/style-tokens";
import type {
  EpisodeImageDisplayMode,
  EpisodeImageGeometryMode,
} from "./camera-geometry/episode-camera-model";
import {
  DEFAULT_EPISODE_POINT_CLOUD_POINT_SIZE,
  DEFAULT_EPISODE_PROJECTION_POINT_SIZE,
  normalizeEpisodePointSize,
} from "./episode-point-size";

export {
  DEFAULT_EPISODE_POINT_CLOUD_POINT_SIZE,
  DEFAULT_EPISODE_PROJECTION_POINT_SIZE,
  MAX_EPISODE_POINT_CLOUD_POINT_SIZE,
  EPISODE_POINT_CLOUD_POINT_SIZE_STEP,
  MIN_EPISODE_POINT_CLOUD_POINT_SIZE,
} from "./episode-point-size";

/**
 * Timing tolerances and warning thresholds for synchronized episode playback.
 */
export interface EpisodeTemporalPolicySettings {
  readonly boundaryClampMs: number;
  readonly maxInterpolationGapMs: number;
  readonly staleMediaWarningMs: number;
  readonly transformGapWarningMs: number;
}

/**
 * How the viewer renders values between recorded message timestamps.
 */
export type EpisodePlaybackFidelityMode = "smooth" | "as-recorded";

/**
 * Appearance of the 3D tile's world reference grid.
 */
export interface EpisodeReferenceGridSettings {
  readonly enabled: boolean;
  /** Peak line opacity, percent (0-100). */
  readonly opacityPercent: number;
  /** Closest line spacing in meters; lines adapt by powers of ten. */
  readonly spacingM: number;
}

/**
 * Appearance of camera-calibration frustums in the 3D tile.
 */
export interface EpisodePinholeCameraSettings {
  /** Distance from optical center to image plane, in meters. */
  readonly imagePlaneDepthM: number;
  /** Base frustum/image-plane opacity, percent (0-100). */
  readonly opacityPercent: number;
}

/**
 * 3D scene backdrop styles: a solid color or a named gradient profile.
 */
export type EpisodeSceneBackgroundMode = "solid" | "abyss" | "studio";

/**
 * Persisted 3D scene background choice.
 */
export interface EpisodeSceneBackgroundSettings {
  readonly mode: EpisodeSceneBackgroundMode;
  /** Hex color (#rrggbb) used while `mode` is "solid". */
  readonly solidColor: string;
}

/**
 * How one point-cloud stream is colored in the 3D tile.
 */
export interface EpisodePointCloudColorSettings {
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
export interface EpisodeImageProjectionSettings {
  /** Explicit calibration stream; null uses the scene-inventory association. */
  readonly calibrationStream: string | null;
  /** Presentation of the recorded pixels; rectified is an explicit remap. */
  readonly display: EpisodeImageDisplayMode;
  readonly enabled: boolean;
  /** Recorded image pixel geometry; Auto blocks materially ambiguous models. */
  readonly geometry: EpisodeImageGeometryMode;
  /** Dot size, on the same scale as the 3D point size. */
  readonly pointSize: number;
  /** Explicit cloud streams to project; null projects every cloud. */
  readonly streams: readonly string[] | null;
}

/**
 * Stream-keyed styling persisted per settings scope (one dataset or ad hoc
 * recording source). Bare stream names collide across unrelated datasets —
 * two recordings sharing `/lidar_top` are not one preference — so these
 * maps resolve scoped-first with the legacy top-level maps as fallback.
 */
export interface EpisodeScopedModalSettings {
  readonly imageLabelStreams: Record<string, readonly string[]>;
  readonly imageProjection: Record<string, EpisodeImageProjectionSettings>;
  readonly pointCloudColors: Record<string, EpisodePointCloudColorSettings>;
}

/**
 * Full localStorage payload for browser-wide episode modal preferences.
 *
 * Device-global preferences (fidelity, timing, pinhole, grid, background,
 * point size) live at the top level. Stream-keyed styling additionally lives
 * under `scoped`, keyed by settings scope; the top-level stream maps remain
 * as the pre-scoping fallback.
 */
export interface EpisodePersistedModalSettings {
  readonly fidelityMode: EpisodePlaybackFidelityMode;
  readonly imageLabelStreams: Record<string, readonly string[]>;
  readonly imageProjection: Record<string, EpisodeImageProjectionSettings>;
  readonly pinholeCamera: EpisodePinholeCameraSettings;
  readonly pointCloudColors: Record<string, EpisodePointCloudColorSettings>;
  readonly pointCloudPointSize: number;
  readonly referenceGrid: EpisodeReferenceGridSettings;
  readonly sceneBackground: EpisodeSceneBackgroundSettings;
  readonly scoped: Record<string, EpisodeScopedModalSettings>;
  readonly showPointCloudColorLegend: boolean;
  readonly temporalPolicy: EpisodeTemporalPolicySettings;
}

const STORAGE_KEY = "fiftyone.episode.modal-settings";
const LEGACY_STORAGE_KEY = "fiftyone.mcap.modal-settings";

/**
 * Default interpolation policy for newly initialized episode modal settings.
 */
export const DEFAULT_EPISODE_FIDELITY_MODE: EpisodePlaybackFidelityMode =
  "smooth";

const FIDELITY_MODES: readonly EpisodePlaybackFidelityMode[] = [
  "smooth",
  "as-recorded",
];

/**
 * Default timing policy balancing smooth playback with visible data gaps.
 */
export const DEFAULT_EPISODE_TEMPORAL_POLICY: EpisodeTemporalPolicySettings = {
  boundaryClampMs: 50,
  maxInterpolationGapMs: 0,
  staleMediaWarningMs: 500,
  transformGapWarningMs: 2000,
};

const MAX_TEMPORAL_POLICY_MS = 60_000;

/**
 * Default world reference grid shown in the 3D episode tile.
 */
export const DEFAULT_EPISODE_REFERENCE_GRID: EpisodeReferenceGridSettings = {
  enabled: true,
  opacityPercent: 5,
  spacingM: 1,
};

const MIN_GRID_SPACING_M = 0.01;
const MAX_GRID_SPACING_M = 10_000;

/**
 * Default appearance for camera calibration frustums.
 */
export const DEFAULT_EPISODE_PINHOLE_CAMERA: EpisodePinholeCameraSettings = {
  imagePlaneDepthM: 2.75,
  opacityPercent: 85,
};

const MIN_PINHOLE_DEPTH_M = 0.05;
const MAX_PINHOLE_DEPTH_M = 100;

/**
 * Default 3D scene background for episode playback.
 */
export const DEFAULT_EPISODE_SCENE_BACKGROUND: EpisodeSceneBackgroundSettings =
  {
    mode: "abyss",
    solidColor: VISUALIZATION_PANEL_BACKGROUND_COLOR,
  };

/**
 * Default point-cloud color override before source-specific defaults apply.
 */
export const DEFAULT_EPISODE_POINT_CLOUD_COLOR: EpisodePointCloudColorSettings =
  {
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
export function defaultEpisodePointCloudColorForIndex(
  index: number,
): EpisodePointCloudColorSettings {
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return {
    ...DEFAULT_EPISODE_POINT_CLOUD_COLOR,
    colormap: POINT_CLOUD_COLORMAPS[safeIndex % POINT_CLOUD_COLORMAPS.length],
  };
}

interface PointCloudSourceLike {
  readonly id: string;
  readonly label?: string;
}

/**
 * Chooses a stable default point-cloud color preset for a source list.
 */
export function defaultEpisodePointCloudColorForSource(
  source: PointCloudSourceLike,
  sources: readonly PointCloudSourceLike[],
): EpisodePointCloudColorSettings {
  const sourceIndex = sources.findIndex(
    (candidate) => candidate.id === source.id,
  );
  const safeIndex = sourceIndex >= 0 ? sourceIndex : 0;
  const firstLidarIndex = sources.findIndex(isLidarSource);
  if (safeIndex === firstLidarIndex) {
    return {
      ...DEFAULT_EPISODE_POINT_CLOUD_COLOR,
      colormap: "turbo",
    };
  }
  if (firstLidarIndex < 0) {
    return defaultEpisodePointCloudColorForIndex(safeIndex);
  }

  const distributedIndex =
    safeIndex > firstLidarIndex ? safeIndex - 1 : safeIndex;
  const colormapIndex =
    distributedIndex % POINT_CLOUD_COLORMAPS_WITHOUT_TURBO.length;
  return {
    ...DEFAULT_EPISODE_POINT_CLOUD_COLOR,
    colormap:
      POINT_CLOUD_COLORMAPS_WITHOUT_TURBO[colormapIndex] ??
      DEFAULT_POINT_CLOUD_COLORMAP,
  };
}

function isLidarSource(source: PointCloudSourceLike): boolean {
  return `${source.id} ${source.label ?? ""}`.toLowerCase().includes("lidar");
}

const SCENE_BACKGROUND_MODES: readonly EpisodeSceneBackgroundMode[] = [
  "solid",
  "abyss",
  "studio",
];

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * Empty per-scope styling payload.
 */
export const EMPTY_EPISODE_SCOPED_SETTINGS: EpisodeScopedModalSettings = {
  imageLabelStreams: {},
  imageProjection: {},
  pointCloudColors: {},
};

/**
 * Most scopes retained in the persisted payload. Writes re-insert their
 * scope last, so pruning drops the least recently written datasets first.
 */
export const MAX_EPISODE_SETTINGS_SCOPES = 20;

/**
 * Complete default episode modal settings payload.
 */
export const DEFAULT_EPISODE_MODAL_SETTINGS: EpisodePersistedModalSettings = {
  fidelityMode: DEFAULT_EPISODE_FIDELITY_MODE,
  imageLabelStreams: {},
  imageProjection: {},
  pinholeCamera: DEFAULT_EPISODE_PINHOLE_CAMERA,
  pointCloudColors: {},
  pointCloudPointSize: DEFAULT_EPISODE_POINT_CLOUD_POINT_SIZE,
  referenceGrid: DEFAULT_EPISODE_REFERENCE_GRID,
  sceneBackground: DEFAULT_EPISODE_SCENE_BACKGROUND,
  scoped: {},
  showPointCloudColorLegend: false,
  temporalPolicy: DEFAULT_EPISODE_TEMPORAL_POLICY,
};

/**
 * Reads persisted episode modal settings from local storage.
 */
export function readEpisodeModalSettings(): EpisodePersistedModalSettings {
  try {
    const storage = globalThis.localStorage;
    const raw =
      storage?.getItem(STORAGE_KEY) ?? storage?.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return DEFAULT_EPISODE_MODAL_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_EPISODE_MODAL_SETTINGS;
    }

    const candidate = parsed as Partial<EpisodePersistedModalSettings> & {
      imageLabelTopics?: unknown;
    };
    return {
      fidelityMode: normalizeEpisodeFidelityMode(candidate.fidelityMode),
      imageLabelStreams: normalizeEpisodeImageLabelStreamMap(
        candidate.imageLabelStreams ?? candidate.imageLabelTopics,
      ),
      imageProjection: normalizeEpisodeImageProjectionMap(
        candidate.imageProjection,
      ),
      pinholeCamera: normalizeEpisodePinholeCamera(candidate.pinholeCamera),
      pointCloudColors: normalizeEpisodePointCloudColorMap(
        candidate.pointCloudColors,
      ),
      pointCloudPointSize: normalizeEpisodePointCloudPointSize(
        candidate.pointCloudPointSize,
      ),
      referenceGrid: normalizeEpisodeReferenceGrid(candidate.referenceGrid),
      sceneBackground: normalizeEpisodeSceneBackground(
        candidate.sceneBackground,
      ),
      scoped: normalizeEpisodeScopedSettingsMap(candidate.scoped),
      showPointCloudColorLegend:
        typeof candidate.showPointCloudColorLegend === "boolean"
          ? candidate.showPointCloudColorLegend
          : false,
      temporalPolicy: normalizeEpisodeTemporalPolicy(candidate.temporalPolicy),
    };
  } catch {
    return DEFAULT_EPISODE_MODAL_SETTINGS;
  }
}

/**
 * Writes the full persisted episode modal settings payload.
 */
export function writeEpisodeModalSettings(
  settings: EpisodePersistedModalSettings,
): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify(normalizeEpisodeModalSettings(settings)),
    );
  } catch {
    // Settings persistence is a convenience; storage failures should not
    // interrupt playback.
  }
}

/**
 * Normalizes a full episode modal settings payload before persistence.
 */
export function normalizeEpisodeModalSettings(
  settings: EpisodePersistedModalSettings,
): EpisodePersistedModalSettings {
  return {
    fidelityMode: normalizeEpisodeFidelityMode(settings.fidelityMode),
    imageLabelStreams: normalizeEpisodeImageLabelStreamMap(
      settings.imageLabelStreams,
    ),
    imageProjection: normalizeEpisodeImageProjectionMap(
      settings.imageProjection,
    ),
    pinholeCamera: normalizeEpisodePinholeCamera(settings.pinholeCamera),
    pointCloudColors: normalizeEpisodePointCloudColorMap(
      settings.pointCloudColors,
    ),
    pointCloudPointSize: normalizeEpisodePointCloudPointSize(
      settings.pointCloudPointSize,
    ),
    referenceGrid: normalizeEpisodeReferenceGrid(settings.referenceGrid),
    sceneBackground: normalizeEpisodeSceneBackground(settings.sceneBackground),
    scoped: normalizeEpisodeScopedSettingsMap(settings.scoped),
    showPointCloudColorLegend: settings.showPointCloudColorLegend === true,
    temporalPolicy: normalizeEpisodeTemporalPolicy(settings.temporalPolicy),
  };
}

/**
 * Normalizes the per-scope styling map: each entry's stream maps go through
 * the same normalizers as the top-level maps, entries left empty are
 * dropped, and only the last `MAX_EPISODE_SETTINGS_SCOPES` entries survive —
 * writes re-insert their scope last, so insertion order is recency order.
 */
export function normalizeEpisodeScopedSettingsMap(
  value: unknown,
): Record<string, EpisodeScopedModalSettings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const entries: [string, EpisodeScopedModalSettings][] = [];
  for (const [scope, scopedValue] of Object.entries(value)) {
    const normalizedScope = scope.trim();
    if (!normalizedScope) continue;
    const scoped = normalizeEpisodeScopedSettings(scopedValue);
    if (
      Object.keys(scoped.imageLabelStreams).length === 0 &&
      Object.keys(scoped.imageProjection).length === 0 &&
      Object.keys(scoped.pointCloudColors).length === 0
    ) {
      continue;
    }
    entries.push([normalizedScope, scoped]);
  }

  return Object.fromEntries(entries.slice(-MAX_EPISODE_SETTINGS_SCOPES));
}

/**
 * Normalizes one scope's styling payload.
 */
export function normalizeEpisodeScopedSettings(
  value: unknown,
): EpisodeScopedModalSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return EMPTY_EPISODE_SCOPED_SETTINGS;
  }

  const candidate = value as Partial<EpisodeScopedModalSettings>;
  return {
    imageLabelStreams: normalizeEpisodeImageLabelStreamMap(
      candidate.imageLabelStreams,
    ),
    imageProjection: normalizeEpisodeImageProjectionMap(
      candidate.imageProjection,
    ),
    pointCloudColors: normalizeEpisodePointCloudColorMap(
      candidate.pointCloudColors,
    ),
  };
}

/**
 * Returns a supported playback fidelity mode or the default mode.
 */
export function normalizeEpisodeFidelityMode(
  value: unknown,
): EpisodePlaybackFidelityMode {
  return FIDELITY_MODES.includes(value as EpisodePlaybackFidelityMode)
    ? (value as EpisodePlaybackFidelityMode)
    : DEFAULT_EPISODE_FIDELITY_MODE;
}

/**
 * Default pointcloud projection settings for one image stream.
 */
export const DEFAULT_EPISODE_IMAGE_PROJECTION: EpisodeImageProjectionSettings =
  {
    calibrationStream: null,
    display: "recorded",
    enabled: false,
    geometry: "auto",
    pointSize: DEFAULT_EPISODE_PROJECTION_POINT_SIZE,
    streams: [],
  } as const;

/**
 * Normalizes persisted per-image-stream pointcloud projection settings.
 */
export function normalizeEpisodeImageProjectionMap(
  value: unknown,
): Record<string, EpisodeImageProjectionSettings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, EpisodeImageProjectionSettings> = {};
  for (const [imageStream, settings] of Object.entries(value)) {
    const normalizedImageStream = imageStream.trim();
    if (!normalizedImageStream) continue;
    result[normalizedImageStream] = normalizeEpisodeImageProjection(settings);
  }
  return result;
}

/**
 * Normalizes one pointcloud projection settings entry.
 */
export function normalizeEpisodeImageProjection(
  value: unknown,
): EpisodeImageProjectionSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_EPISODE_IMAGE_PROJECTION;
  }

  const candidate = value as Partial<EpisodeImageProjectionSettings> & {
    calibrationTopic?: unknown;
    topics?: unknown;
  };
  const rawStreams = candidate.streams ?? candidate.topics;
  const streams =
    rawStreams === null || rawStreams === undefined
      ? null
      : normalizeEpisodeStreamList(rawStreams);
  const enabled =
    candidate.enabled === true && (streams === null || streams.length > 0);
  return {
    calibrationStream: normalizeOptionalStream(
      candidate.calibrationStream ?? candidate.calibrationTopic,
    ),
    display: normalizeEpisodeImageDisplay(candidate.display),
    enabled,
    geometry: normalizeEpisodeImageGeometry(candidate.geometry),
    pointSize: normalizeEpisodePointSize(
      candidate.pointSize,
      DEFAULT_EPISODE_PROJECTION_POINT_SIZE,
    ),
    streams: enabled ? streams : [],
  };
}

/** Returns a supported image presentation mode or the recorded pixels. */
export function normalizeEpisodeImageDisplay(
  value: unknown,
): EpisodeImageDisplayMode {
  return value === "rectified" ? value : "recorded";
}

/** Returns a supported image-geometry mode or Auto. */
export function normalizeEpisodeImageGeometry(
  value: unknown,
): EpisodeImageGeometryMode {
  return value === "original" || value === "rectified" ? value : "auto";
}

/**
 * Normalizes persisted image-stream to label-stream selections.
 */
export function normalizeEpisodeImageLabelStreamMap(
  value: unknown,
): Record<string, readonly string[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, readonly string[]> = {};
  for (const [imageStream, labelStreams] of Object.entries(value)) {
    const normalizedImageStream = imageStream.trim();
    if (!normalizedImageStream) continue;
    result[normalizedImageStream] = normalizeEpisodeStreamList(labelStreams);
  }
  return result;
}

/**
 * Normalizes a list of stream names by trimming, filtering, and deduplicating.
 */
export function normalizeEpisodeStreamList(value: unknown): readonly string[] {
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
export function normalizeEpisodePointCloudColorMap(
  value: unknown,
): Record<string, EpisodePointCloudColorSettings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, EpisodePointCloudColorSettings> = {};
  for (const [stream, settings] of Object.entries(value)) {
    const normalizedStream = stream.trim();
    if (!normalizedStream) continue;
    result[normalizedStream] = normalizeEpisodePointCloudColor(settings);
  }
  return result;
}

/**
 * Normalizes one point-cloud color settings object.
 */
export function normalizeEpisodePointCloudColor(
  value: unknown,
): EpisodePointCloudColorSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_EPISODE_POINT_CLOUD_COLOR;
  }

  const candidate = value as Partial<EpisodePointCloudColorSettings>;
  return {
    colorBy:
      typeof candidate.colorBy === "string" && candidate.colorBy.trim()
        ? candidate.colorBy.trim()
        : DEFAULT_EPISODE_POINT_CLOUD_COLOR.colorBy,
    colormap: normalizePointCloudColormap(candidate.colormap),
    // Range ends are kept independently: an inverted pair simply does not
    // apply as a fixed range until the user finishes editing it.
    rangeMax: finiteOrNull(candidate.rangeMax),
    rangeMin: finiteOrNull(candidate.rangeMin),
    uniformColor: normalizeHexColor(
      candidate.uniformColor,
      DEFAULT_EPISODE_POINT_CLOUD_COLOR.uniformColor,
    ),
  };
}

/**
 * Clamps a point-cloud point size to the supported settings range.
 */
export function normalizeEpisodePointCloudPointSize(value: unknown): number {
  return normalizeEpisodePointSize(value);
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
export function normalizeEpisodeReferenceGrid(
  value: unknown,
): EpisodeReferenceGridSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_EPISODE_REFERENCE_GRID;
  }

  const candidate = value as Partial<EpisodeReferenceGridSettings>;
  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : DEFAULT_EPISODE_REFERENCE_GRID.enabled,
    opacityPercent: clampNumber(
      candidate.opacityPercent,
      0,
      100,
      DEFAULT_EPISODE_REFERENCE_GRID.opacityPercent,
    ),
    spacingM: clampNumber(
      candidate.spacingM,
      MIN_GRID_SPACING_M,
      MAX_GRID_SPACING_M,
      DEFAULT_EPISODE_REFERENCE_GRID.spacingM,
    ),
  };
}

/**
 * Normalizes camera frustum display settings.
 */
export function normalizeEpisodePinholeCamera(
  value: unknown,
): EpisodePinholeCameraSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_EPISODE_PINHOLE_CAMERA;
  }

  const candidate = value as Partial<EpisodePinholeCameraSettings>;
  return {
    imagePlaneDepthM: clampNumber(
      candidate.imagePlaneDepthM,
      MIN_PINHOLE_DEPTH_M,
      MAX_PINHOLE_DEPTH_M,
      DEFAULT_EPISODE_PINHOLE_CAMERA.imagePlaneDepthM,
    ),
    opacityPercent: clampNumber(
      candidate.opacityPercent,
      0,
      100,
      DEFAULT_EPISODE_PINHOLE_CAMERA.opacityPercent,
    ),
  };
}

/**
 * Normalizes the 3D scene background settings object.
 */
export function normalizeEpisodeSceneBackground(
  value: unknown,
): EpisodeSceneBackgroundSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_EPISODE_SCENE_BACKGROUND;
  }

  const candidate = value as Partial<EpisodeSceneBackgroundSettings>;
  return {
    mode: SCENE_BACKGROUND_MODES.includes(
      candidate.mode as EpisodeSceneBackgroundMode,
    )
      ? (candidate.mode as EpisodeSceneBackgroundMode)
      : DEFAULT_EPISODE_SCENE_BACKGROUND.mode,
    solidColor:
      typeof candidate.solidColor === "string" &&
      HEX_COLOR_PATTERN.test(candidate.solidColor)
        ? candidate.solidColor.toLowerCase()
        : DEFAULT_EPISODE_SCENE_BACKGROUND.solidColor,
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

/**
 * Normalizes playback timing policy settings.
 */
export function normalizeEpisodeTemporalPolicy(
  value: unknown,
): EpisodeTemporalPolicySettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_EPISODE_TEMPORAL_POLICY;
  }

  const candidate = value as Partial<EpisodeTemporalPolicySettings>;
  return {
    boundaryClampMs: normalizePolicyMs(
      candidate.boundaryClampMs,
      DEFAULT_EPISODE_TEMPORAL_POLICY.boundaryClampMs,
    ),
    maxInterpolationGapMs: normalizePolicyMs(
      candidate.maxInterpolationGapMs,
      DEFAULT_EPISODE_TEMPORAL_POLICY.maxInterpolationGapMs,
    ),
    staleMediaWarningMs: normalizePolicyMs(
      candidate.staleMediaWarningMs,
      DEFAULT_EPISODE_TEMPORAL_POLICY.staleMediaWarningMs,
    ),
    transformGapWarningMs: normalizePolicyMs(
      candidate.transformGapWarningMs,
      DEFAULT_EPISODE_TEMPORAL_POLICY.transformGapWarningMs,
    ),
  };
}

function normalizePolicyMs(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(MAX_TEMPORAL_POLICY_MS, Math.max(0, Math.round(value)));
}
