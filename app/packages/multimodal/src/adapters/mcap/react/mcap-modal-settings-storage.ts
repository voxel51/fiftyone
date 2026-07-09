import {
  DEFAULT_POINT_CLOUD_COLORMAP,
  POINT_CLOUD_COLORMAPS,
  normalizePointCloudColormap,
  type PointCloudColormap,
} from "../../../visualization/panels/point-cloud";
import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "../../../visualization/panels/style-tokens";

/**
 * Timing tolerances and warning thresholds for synchronized MCAP playback.
 */
export interface McapTemporalPolicySettings {
  readonly boundaryClampMs: number;
  readonly maxInterpolationGapMs: number;
  readonly staleMediaWarningMs: number;
  readonly transformGapWarningMs: number;
}

/**
 * How the viewer renders values between recorded message timestamps.
 */
export type McapPlaybackFidelityMode = "smooth" | "as-recorded";

/**
 * Appearance of the 3D tile's world reference grid.
 */
export interface McapReferenceGridSettings {
  readonly enabled: boolean;
  /** Peak line opacity, percent (0-100). */
  readonly opacityPercent: number;
  /** Closest line spacing in meters; lines adapt by powers of ten. */
  readonly spacingM: number;
}

/**
 * Appearance of camera-calibration frustums in the 3D tile.
 */
export interface McapPinholeCameraSettings {
  /** Distance from optical center to image plane, in meters. */
  readonly imagePlaneDepthM: number;
  /** Base frustum/image-plane opacity, percent (0-100). */
  readonly opacityPercent: number;
}

/**
 * 3D scene backdrop styles: a solid color or a named gradient profile.
 */
export type McapSceneBackgroundMode = "solid" | "abyss" | "studio";

/**
 * Persisted 3D scene background choice.
 */
export interface McapSceneBackgroundSettings {
  readonly mode: McapSceneBackgroundMode;
  /** Hex color (#rrggbb) used while `mode` is "solid". */
  readonly solidColor: string;
}

/**
 * How one point-cloud topic is colored in the 3D tile.
 */
export interface McapPointCloudColorSettings {
  readonly colorBy: string;
  readonly colormap: PointCloudColormap;
  readonly rangeMax: number | null;
  readonly rangeMin: number | null;
  readonly uniformColor: string;
}

/**
 * Per-image-topic pointcloud projection preferences. Projected dots
 * inherit each cloud's 3D colour settings; point size is the
 * projection's own knob because dots compete with photographic detail,
 * not a dark void.
 */
export interface McapImageProjectionSettings {
  readonly enabled: boolean;
  /** Dot size, on the same scale as the 3D point size. */
  readonly pointSize: number;
  /** Explicit cloud topics to project; null projects every cloud. */
  readonly topics: readonly string[] | null;
}

/**
 * Full localStorage payload for browser-wide MCAP modal preferences.
 */
export interface McapPersistedModalSettings {
  readonly fidelityMode: McapPlaybackFidelityMode;
  readonly imageLabelTopics: Record<string, readonly string[]>;
  readonly imageProjection: Record<string, McapImageProjectionSettings>;
  readonly pinholeCamera: McapPinholeCameraSettings;
  readonly pointCloudColors: Record<string, McapPointCloudColorSettings>;
  readonly pointCloudPointSize: number;
  readonly referenceGrid: McapReferenceGridSettings;
  readonly sceneBackground: McapSceneBackgroundSettings;
  readonly showPointCloudColorLegend: boolean;
  readonly temporalPolicy: McapTemporalPolicySettings;
}

const STORAGE_KEY = "fiftyone.mcap.modal-settings";

/**
 * Default interpolation policy for newly initialized MCAP modal settings.
 */
export const DEFAULT_MCAP_FIDELITY_MODE: McapPlaybackFidelityMode = "smooth";

const FIDELITY_MODES: readonly McapPlaybackFidelityMode[] = [
  "smooth",
  "as-recorded",
];

/**
 * Default timing policy balancing smooth playback with visible data gaps.
 */
export const DEFAULT_MCAP_TEMPORAL_POLICY: McapTemporalPolicySettings = {
  boundaryClampMs: 50,
  maxInterpolationGapMs: 0,
  staleMediaWarningMs: 500,
  transformGapWarningMs: 2000,
};

const MAX_TEMPORAL_POLICY_MS = 60_000;

/**
 * Default world reference grid shown in the 3D MCAP tile.
 */
export const DEFAULT_MCAP_REFERENCE_GRID: McapReferenceGridSettings = {
  enabled: true,
  opacityPercent: 5,
  spacingM: 1,
};

const MIN_GRID_SPACING_M = 0.01;
const MAX_GRID_SPACING_M = 10_000;

/**
 * Default appearance for camera calibration frustums.
 */
export const DEFAULT_MCAP_PINHOLE_CAMERA: McapPinholeCameraSettings = {
  imagePlaneDepthM: 2.75,
  opacityPercent: 85,
};

const MIN_PINHOLE_DEPTH_M = 0.05;
const MAX_PINHOLE_DEPTH_M = 100;

/**
 * Default 3D scene background for MCAP playback.
 */
export const DEFAULT_MCAP_SCENE_BACKGROUND: McapSceneBackgroundSettings = {
  mode: "abyss",
  solidColor: VISUALIZATION_PANEL_BACKGROUND_COLOR,
};

/**
 * Default point-cloud color override before source-specific defaults apply.
 */
export const DEFAULT_MCAP_POINT_CLOUD_COLOR: McapPointCloudColorSettings = {
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
export function defaultMcapPointCloudColorForIndex(
  index: number,
): McapPointCloudColorSettings {
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return {
    ...DEFAULT_MCAP_POINT_CLOUD_COLOR,
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
export function defaultMcapPointCloudColorForSource(
  source: PointCloudSourceLike,
  sources: readonly PointCloudSourceLike[],
): McapPointCloudColorSettings {
  const sourceIndex = sources.findIndex(
    (candidate) => candidate.id === source.id,
  );
  const safeIndex = sourceIndex >= 0 ? sourceIndex : 0;
  const firstLidarIndex = sources.findIndex(isLidarSource);
  if (safeIndex === firstLidarIndex) {
    return {
      ...DEFAULT_MCAP_POINT_CLOUD_COLOR,
      colormap: "turbo",
    };
  }
  if (firstLidarIndex < 0) {
    return defaultMcapPointCloudColorForIndex(safeIndex);
  }

  const distributedIndex =
    safeIndex > firstLidarIndex ? safeIndex - 1 : safeIndex;
  const colormapIndex =
    distributedIndex % POINT_CLOUD_COLORMAPS_WITHOUT_TURBO.length;
  return {
    ...DEFAULT_MCAP_POINT_CLOUD_COLOR,
    colormap:
      POINT_CLOUD_COLORMAPS_WITHOUT_TURBO[colormapIndex] ??
      DEFAULT_POINT_CLOUD_COLORMAP,
  };
}

function isLidarSource(source: PointCloudSourceLike): boolean {
  return `${source.id} ${source.label ?? ""}`.toLowerCase().includes("lidar");
}

const SCENE_BACKGROUND_MODES: readonly McapSceneBackgroundMode[] = [
  "solid",
  "abyss",
  "studio",
];

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
/**
 * Default point sprite size for MCAP point-cloud rendering.
 */
export const DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE = 2;
/**
 * Smallest user-selectable MCAP point sprite size.
 */
export const MIN_MCAP_POINT_CLOUD_POINT_SIZE = 1;
/**
 * Largest user-selectable MCAP point sprite size.
 */
export const MAX_MCAP_POINT_CLOUD_POINT_SIZE = 10;
/**
 * Increment used by the point-size settings control.
 */
export const MCAP_POINT_CLOUD_POINT_SIZE_STEP = 0.25;

/**
 * Complete default MCAP modal settings payload.
 */
export const DEFAULT_MCAP_MODAL_SETTINGS: McapPersistedModalSettings = {
  fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
  imageLabelTopics: {},
  imageProjection: {},
  pinholeCamera: DEFAULT_MCAP_PINHOLE_CAMERA,
  pointCloudColors: {},
  pointCloudPointSize: DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
  referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
  sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
  showPointCloudColorLegend: false,
  temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
};

/**
 * Reads persisted MCAP modal settings from local storage.
 */
export function readMcapModalSettings(): McapPersistedModalSettings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MCAP_MODAL_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_MCAP_MODAL_SETTINGS;
    }

    const candidate = parsed as Partial<McapPersistedModalSettings>;
    return {
      fidelityMode: normalizeMcapFidelityMode(candidate.fidelityMode),
      imageLabelTopics: normalizeMcapImageLabelTopicMap(
        candidate.imageLabelTopics,
      ),
      imageProjection: normalizeMcapImageProjectionMap(
        candidate.imageProjection,
      ),
      pinholeCamera: normalizeMcapPinholeCamera(candidate.pinholeCamera),
      pointCloudColors: normalizeMcapPointCloudColorMap(
        candidate.pointCloudColors,
      ),
      pointCloudPointSize: normalizeMcapPointCloudPointSize(
        candidate.pointCloudPointSize,
      ),
      referenceGrid: normalizeMcapReferenceGrid(candidate.referenceGrid),
      sceneBackground: normalizeMcapSceneBackground(candidate.sceneBackground),
      showPointCloudColorLegend:
        typeof candidate.showPointCloudColorLegend === "boolean"
          ? candidate.showPointCloudColorLegend
          : false,
      temporalPolicy: normalizeMcapTemporalPolicy(candidate.temporalPolicy),
    };
  } catch {
    return DEFAULT_MCAP_MODAL_SETTINGS;
  }
}

/**
 * Writes the full persisted MCAP modal settings payload.
 */
export function writeMcapModalSettings(
  settings: McapPersistedModalSettings,
): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify(normalizeMcapModalSettings(settings)),
    );
  } catch {
    // Settings persistence is a convenience; storage failures should not
    // interrupt playback.
  }
}

/**
 * Normalizes a full MCAP modal settings payload before persistence.
 */
export function normalizeMcapModalSettings(
  settings: McapPersistedModalSettings,
): McapPersistedModalSettings {
  return {
    fidelityMode: normalizeMcapFidelityMode(settings.fidelityMode),
    imageLabelTopics: normalizeMcapImageLabelTopicMap(
      settings.imageLabelTopics,
    ),
    imageProjection: normalizeMcapImageProjectionMap(settings.imageProjection),
    pinholeCamera: normalizeMcapPinholeCamera(settings.pinholeCamera),
    pointCloudColors: normalizeMcapPointCloudColorMap(
      settings.pointCloudColors,
    ),
    pointCloudPointSize: normalizeMcapPointCloudPointSize(
      settings.pointCloudPointSize,
    ),
    referenceGrid: normalizeMcapReferenceGrid(settings.referenceGrid),
    sceneBackground: normalizeMcapSceneBackground(settings.sceneBackground),
    showPointCloudColorLegend: settings.showPointCloudColorLegend === true,
    temporalPolicy: normalizeMcapTemporalPolicy(settings.temporalPolicy),
  };
}

/**
 * Returns a supported playback fidelity mode or the default mode.
 */
export function normalizeMcapFidelityMode(
  value: unknown,
): McapPlaybackFidelityMode {
  return FIDELITY_MODES.includes(value as McapPlaybackFidelityMode)
    ? (value as McapPlaybackFidelityMode)
    : DEFAULT_MCAP_FIDELITY_MODE;
}

/**
 * Default projected-dot size: 3× the default 3D point size, so dots
 * stay legible over imagery out of the box.
 */
export const DEFAULT_MCAP_PROJECTION_POINT_SIZE =
  3 * DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE;

/**
 * Default pointcloud projection settings for one image topic.
 */
export const DEFAULT_MCAP_IMAGE_PROJECTION: McapImageProjectionSettings = {
  enabled: false,
  pointSize: DEFAULT_MCAP_PROJECTION_POINT_SIZE,
  topics: [],
};

/**
 * Normalizes persisted per-image-topic pointcloud projection settings.
 */
export function normalizeMcapImageProjectionMap(
  value: unknown,
): Record<string, McapImageProjectionSettings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, McapImageProjectionSettings> = {};
  for (const [imageTopic, settings] of Object.entries(value)) {
    const normalizedImageTopic = imageTopic.trim();
    if (!normalizedImageTopic) continue;
    result[normalizedImageTopic] = normalizeMcapImageProjection(settings);
  }
  return result;
}

/**
 * Normalizes one pointcloud projection settings entry.
 */
export function normalizeMcapImageProjection(
  value: unknown,
): McapImageProjectionSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_MCAP_IMAGE_PROJECTION;
  }

  const candidate = value as Partial<McapImageProjectionSettings>;
  const topics =
    candidate.topics === null || candidate.topics === undefined
      ? null
      : normalizeMcapTopicList(candidate.topics);
  const enabled =
    candidate.enabled === true && (topics === null || topics.length > 0);
  return {
    enabled,
    pointSize: clampNumber(
      candidate.pointSize,
      MIN_MCAP_POINT_CLOUD_POINT_SIZE,
      MAX_MCAP_POINT_CLOUD_POINT_SIZE,
      DEFAULT_MCAP_PROJECTION_POINT_SIZE,
    ),
    topics: enabled ? topics : [],
  };
}

/**
 * Normalizes persisted image-topic to label-topic selections.
 */
export function normalizeMcapImageLabelTopicMap(
  value: unknown,
): Record<string, readonly string[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, readonly string[]> = {};
  for (const [imageTopic, labelTopics] of Object.entries(value)) {
    const normalizedImageTopic = imageTopic.trim();
    if (!normalizedImageTopic) continue;
    result[normalizedImageTopic] = normalizeMcapTopicList(labelTopics);
  }
  return result;
}

/**
 * Normalizes a list of topic names by trimming, filtering, and deduplicating.
 */
export function normalizeMcapTopicList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((topic) => (typeof topic === "string" ? topic.trim() : ""))
        .filter(Boolean),
    ),
  );
}

/**
 * Normalizes persisted per-topic point-cloud color overrides.
 */
export function normalizeMcapPointCloudColorMap(
  value: unknown,
): Record<string, McapPointCloudColorSettings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, McapPointCloudColorSettings> = {};
  for (const [topic, settings] of Object.entries(value)) {
    const normalizedTopic = topic.trim();
    if (!normalizedTopic) continue;
    result[normalizedTopic] = normalizeMcapPointCloudColor(settings);
  }
  return result;
}

/**
 * Normalizes one point-cloud color settings object.
 */
export function normalizeMcapPointCloudColor(
  value: unknown,
): McapPointCloudColorSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_MCAP_POINT_CLOUD_COLOR;
  }

  const candidate = value as Partial<McapPointCloudColorSettings>;
  return {
    colorBy:
      typeof candidate.colorBy === "string" && candidate.colorBy.trim()
        ? candidate.colorBy.trim()
        : DEFAULT_MCAP_POINT_CLOUD_COLOR.colorBy,
    colormap: normalizePointCloudColormap(candidate.colormap),
    // Range ends are kept independently: an inverted pair simply does not
    // apply as a fixed range until the user finishes editing it.
    rangeMax: finiteOrNull(candidate.rangeMax),
    rangeMin: finiteOrNull(candidate.rangeMin),
    uniformColor: normalizeHexColor(
      candidate.uniformColor,
      DEFAULT_MCAP_POINT_CLOUD_COLOR.uniformColor,
    ),
  };
}

/**
 * Clamps a point-cloud point size to the supported settings range.
 */
export function normalizeMcapPointCloudPointSize(value: unknown): number {
  return clampNumber(
    value,
    MIN_MCAP_POINT_CLOUD_POINT_SIZE,
    MAX_MCAP_POINT_CLOUD_POINT_SIZE,
    DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
  );
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
export function normalizeMcapReferenceGrid(
  value: unknown,
): McapReferenceGridSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_MCAP_REFERENCE_GRID;
  }

  const candidate = value as Partial<McapReferenceGridSettings>;
  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : DEFAULT_MCAP_REFERENCE_GRID.enabled,
    opacityPercent: clampNumber(
      candidate.opacityPercent,
      0,
      100,
      DEFAULT_MCAP_REFERENCE_GRID.opacityPercent,
    ),
    spacingM: clampNumber(
      candidate.spacingM,
      MIN_GRID_SPACING_M,
      MAX_GRID_SPACING_M,
      DEFAULT_MCAP_REFERENCE_GRID.spacingM,
    ),
  };
}

/**
 * Normalizes camera frustum display settings.
 */
export function normalizeMcapPinholeCamera(
  value: unknown,
): McapPinholeCameraSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_MCAP_PINHOLE_CAMERA;
  }

  const candidate = value as Partial<McapPinholeCameraSettings>;
  return {
    imagePlaneDepthM: clampNumber(
      candidate.imagePlaneDepthM,
      MIN_PINHOLE_DEPTH_M,
      MAX_PINHOLE_DEPTH_M,
      DEFAULT_MCAP_PINHOLE_CAMERA.imagePlaneDepthM,
    ),
    opacityPercent: clampNumber(
      candidate.opacityPercent,
      0,
      100,
      DEFAULT_MCAP_PINHOLE_CAMERA.opacityPercent,
    ),
  };
}

/**
 * Normalizes the 3D scene background settings object.
 */
export function normalizeMcapSceneBackground(
  value: unknown,
): McapSceneBackgroundSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_MCAP_SCENE_BACKGROUND;
  }

  const candidate = value as Partial<McapSceneBackgroundSettings>;
  return {
    mode: SCENE_BACKGROUND_MODES.includes(
      candidate.mode as McapSceneBackgroundMode,
    )
      ? (candidate.mode as McapSceneBackgroundMode)
      : DEFAULT_MCAP_SCENE_BACKGROUND.mode,
    solidColor:
      typeof candidate.solidColor === "string" &&
      HEX_COLOR_PATTERN.test(candidate.solidColor)
        ? candidate.solidColor.toLowerCase()
        : DEFAULT_MCAP_SCENE_BACKGROUND.solidColor,
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
export function normalizeMcapTemporalPolicy(
  value: unknown,
): McapTemporalPolicySettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_MCAP_TEMPORAL_POLICY;
  }

  const candidate = value as Partial<McapTemporalPolicySettings>;
  return {
    boundaryClampMs: normalizePolicyMs(
      candidate.boundaryClampMs,
      DEFAULT_MCAP_TEMPORAL_POLICY.boundaryClampMs,
    ),
    maxInterpolationGapMs: normalizePolicyMs(
      candidate.maxInterpolationGapMs,
      DEFAULT_MCAP_TEMPORAL_POLICY.maxInterpolationGapMs,
    ),
    staleMediaWarningMs: normalizePolicyMs(
      candidate.staleMediaWarningMs,
      DEFAULT_MCAP_TEMPORAL_POLICY.staleMediaWarningMs,
    ),
    transformGapWarningMs: normalizePolicyMs(
      candidate.transformGapWarningMs,
      DEFAULT_MCAP_TEMPORAL_POLICY.transformGapWarningMs,
    ),
  };
}

function normalizePolicyMs(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(MAX_TEMPORAL_POLICY_MS, Math.max(0, Math.round(value)));
}
