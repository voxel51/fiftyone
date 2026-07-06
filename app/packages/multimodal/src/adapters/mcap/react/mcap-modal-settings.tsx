import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DEFAULT_POINT_CLOUD_COLORMAP,
  POINT_CLOUD_COLORMAPS,
  normalizePointCloudColormap,
  type PointCloudColormap,
} from "../../../visualization/panels/point-cloud";
import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "../../../visualization/panels/style-tokens";

export interface McapTemporalPolicySettings {
  readonly boundaryClampMs: number;
  readonly maxInterpolationGapMs: number;
  readonly staleMediaWarningMs: number;
  readonly transformGapWarningMs: number;
}

/**
 * How the viewer renders values between recorded message timestamps.
 *
 * - `smooth`: continuous signals (frame transforms, 2D/3D label geometry)
 *   are interpolated between bracketing samples for fluid playback.
 * - `as-recorded`: no synthesis anywhere — every signal holds its latest
 *   recorded sample so the screen only ever shows values that exist in the
 *   recording.
 */
export type McapPlaybackFidelityMode = "smooth" | "as-recorded";

/**
 * Appearance of the 3D tile's world reference grid.
 */
export interface McapReferenceGridSettings {
  readonly enabled: boolean;
  /** Peak line opacity, percent (0–100). */
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
  /** Base frustum/image-plane opacity, percent (0–100). */
  readonly opacityPercent: number;
}

/**
 * 3D scene backdrop styles: a user-picked solid color, or one of two
 * named gradient profiles — "Abyss" (dark) and "Studio" (light, warm).
 */
export type McapSceneBackgroundMode = "solid" | "abyss" | "studio";

export interface McapSceneBackgroundSettings {
  readonly mode: McapSceneBackgroundMode;
  /** Hex color (#rrggbb) used while `mode` is "solid". */
  readonly solidColor: string;
}

/**
 * How one point-cloud topic is colored in the 3D tile. `colorBy` is either
 * a reserved mode ("auto", "height", "rgb", "uniform") or a decoded scalar
 * channel name; null range ends mean per-frame min/max normalization.
 */
export interface McapPointCloudColorSettings {
  readonly colorBy: string;
  readonly colormap: PointCloudColormap;
  readonly rangeMax: number | null;
  readonly rangeMin: number | null;
  readonly uniformColor: string;
}

interface McapPersistedModalSettings {
  version: 2;
  fidelityMode: McapPlaybackFidelityMode;
  imageLabelTopics: Record<string, readonly string[]>;
  pinholeCamera: McapPinholeCameraSettings;
  pointCloudColors: Record<string, McapPointCloudColorSettings>;
  pointCloudPointSize: number;
  referenceGrid: McapReferenceGridSettings;
  sceneBackground: McapSceneBackgroundSettings;
  showPointCloudColorLegend: boolean;
  temporalPolicy: McapTemporalPolicySettings;
}

interface McapModalSettingsContextValue {
  readonly fidelityMode: McapPlaybackFidelityMode;
  readonly imageLabelTopics: Record<string, readonly string[]>;
  readonly pinholeCamera: McapPinholeCameraSettings;
  readonly pointCloudColors: Record<string, McapPointCloudColorSettings>;
  readonly pointCloudPointSize: number;
  readonly referenceGrid: McapReferenceGridSettings;
  readonly sceneBackground: McapSceneBackgroundSettings;
  readonly showPointCloudColorLegend: boolean;
  readonly temporalPolicy: McapTemporalPolicySettings;
  readonly setFidelityMode: (mode: McapPlaybackFidelityMode) => void;
  readonly setImageLabelTopics: (
    imageTopic: string,
    labelTopics: readonly string[],
  ) => void;
  readonly setPinholeCamera: (
    settings: Partial<McapPinholeCameraSettings>,
  ) => void;
  readonly setPointCloudColor: (
    topic: string,
    settings: Partial<McapPointCloudColorSettings>,
  ) => void;
  readonly setPointCloudPointSize: (pointSize: number) => void;
  readonly setReferenceGrid: (
    settings: Partial<McapReferenceGridSettings>,
  ) => void;
  readonly setSceneBackground: (
    settings: Partial<McapSceneBackgroundSettings>,
  ) => void;
  readonly setShowPointCloudColorLegend: (visible: boolean) => void;
  readonly resetTemporalPolicy: () => void;
  readonly setTemporalPolicy: (
    policy: Partial<McapTemporalPolicySettings>,
  ) => void;
}

const STORAGE_KEY = "fiftyone.mcap.modal-settings";
const VERSION = 2;

export const DEFAULT_MCAP_FIDELITY_MODE: McapPlaybackFidelityMode = "smooth";

const FIDELITY_MODES: readonly McapPlaybackFidelityMode[] = [
  "smooth",
  "as-recorded",
];

export const DEFAULT_MCAP_TEMPORAL_POLICY: McapTemporalPolicySettings = {
  boundaryClampMs: 50,
  maxInterpolationGapMs: 0,
  staleMediaWarningMs: 500,
  transformGapWarningMs: 2000,
};

const MAX_TEMPORAL_POLICY_MS = 60_000;

export const DEFAULT_MCAP_REFERENCE_GRID: McapReferenceGridSettings = {
  enabled: true,
  opacityPercent: 5,
  spacingM: 1,
};

const MIN_GRID_SPACING_M = 0.01;
const MAX_GRID_SPACING_M = 10_000;

export const DEFAULT_MCAP_PINHOLE_CAMERA: McapPinholeCameraSettings = {
  imagePlaneDepthM: 2.75,
  opacityPercent: 85,
};

const MIN_PINHOLE_DEPTH_M = 0.05;
const MAX_PINHOLE_DEPTH_M = 100;

export const DEFAULT_MCAP_SCENE_BACKGROUND: McapSceneBackgroundSettings = {
  mode: "solid",
  solidColor: VISUALIZATION_PANEL_BACKGROUND_COLOR,
};

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
export const DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE = 2;
export const MIN_MCAP_POINT_CLOUD_POINT_SIZE = 1;
export const MAX_MCAP_POINT_CLOUD_POINT_SIZE = 10;
export const MCAP_POINT_CLOUD_POINT_SIZE_STEP = 0.25;

const DEFAULT_SETTINGS: McapPersistedModalSettings = {
  version: VERSION,
  fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
  imageLabelTopics: {},
  pinholeCamera: DEFAULT_MCAP_PINHOLE_CAMERA,
  pointCloudColors: {},
  pointCloudPointSize: DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
  referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
  sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
  showPointCloudColorLegend: false,
  temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
};

const McapModalSettingsContext =
  createContext<McapModalSettingsContextValue | null>(null);

/**
 * Reads persisted MCAP modal settings from local storage.
 */
export function readMcapModalSettings(): McapPersistedModalSettings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_SETTINGS;
    }

    const version = (parsed as { version?: unknown }).version;
    if (version !== VERSION && version !== 1) {
      return DEFAULT_SETTINGS;
    }

    const candidate = parsed as Partial<McapPersistedModalSettings> & {
      readonly interpolate2dAnnotations?: unknown;
      readonly interpolate3dAnnotations?: unknown;
    };
    return {
      version: VERSION,
      fidelityMode:
        version === 1
          ? // v1 stored two per-dimension interpolation booleans; any explicit
            // opt-out maps to the unified as-recorded mode.
            candidate.interpolate2dAnnotations === false ||
            candidate.interpolate3dAnnotations === false
            ? "as-recorded"
            : DEFAULT_MCAP_FIDELITY_MODE
          : normalizeFidelityMode(candidate.fidelityMode),
      imageLabelTopics: normalizeImageLabelTopicMap(candidate.imageLabelTopics),
      pinholeCamera: normalizePinholeCamera(candidate.pinholeCamera),
      pointCloudColors: normalizePointCloudColorMap(candidate.pointCloudColors),
      pointCloudPointSize: normalizePointCloudPointSize(
        candidate.pointCloudPointSize,
      ),
      referenceGrid: normalizeReferenceGrid(candidate.referenceGrid),
      sceneBackground: normalizeSceneBackground(candidate.sceneBackground),
      showPointCloudColorLegend:
        typeof candidate.showPointCloudColorLegend === "boolean"
          ? candidate.showPointCloudColorLegend
          : false,
      temporalPolicy: normalizeTemporalPolicy(candidate.temporalPolicy),
    };
  } catch {
    return DEFAULT_SETTINGS;
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
      JSON.stringify({
        version: VERSION,
        fidelityMode: normalizeFidelityMode(settings.fidelityMode),
        imageLabelTopics: normalizeImageLabelTopicMap(
          settings.imageLabelTopics,
        ),
        pinholeCamera: normalizePinholeCamera(settings.pinholeCamera),
        pointCloudColors: normalizePointCloudColorMap(
          settings.pointCloudColors,
        ),
        pointCloudPointSize: normalizePointCloudPointSize(
          settings.pointCloudPointSize,
        ),
        referenceGrid: normalizeReferenceGrid(settings.referenceGrid),
        sceneBackground: normalizeSceneBackground(settings.sceneBackground),
        showPointCloudColorLegend: settings.showPointCloudColorLegend === true,
        temporalPolicy: normalizeTemporalPolicy(settings.temporalPolicy),
      }),
    );
  } catch {
    // Settings persistence is a convenience; storage failures should not
    // interrupt playback.
  }
}

/**
 * Provides persisted MCAP modal settings to the sidebar and tile bodies.
 */
export const McapModalSettingsProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [settings, setSettings] = useState<McapPersistedModalSettings>(
    readMcapModalSettings,
  );

  const update = useCallback(
    (
      resolver: (
        current: McapPersistedModalSettings,
      ) => McapPersistedModalSettings,
    ) => {
      setSettings((current) => resolver(current));
    },
    [],
  );

  useEffect(() => {
    writeMcapModalSettings(settings);
  }, [settings]);

  const setFidelityMode = useCallback(
    (mode: McapPlaybackFidelityMode) =>
      update((current) => ({
        ...current,
        fidelityMode: normalizeFidelityMode(mode),
      })),
    [update],
  );
  const setReferenceGrid = useCallback(
    (settings: Partial<McapReferenceGridSettings>) =>
      update((current) => ({
        ...current,
        referenceGrid: normalizeReferenceGrid({
          ...current.referenceGrid,
          ...settings,
        }),
      })),
    [update],
  );
  const setPinholeCamera = useCallback(
    (settings: Partial<McapPinholeCameraSettings>) =>
      update((current) => ({
        ...current,
        pinholeCamera: normalizePinholeCamera({
          ...current.pinholeCamera,
          ...settings,
        }),
      })),
    [update],
  );
  const setPointCloudColor = useCallback(
    (topic: string, settings: Partial<McapPointCloudColorSettings>) => {
      const normalizedTopic = topic.trim();
      if (!normalizedTopic) return;
      update((current) => ({
        ...current,
        pointCloudColors: {
          ...current.pointCloudColors,
          [normalizedTopic]: normalizePointCloudColor({
            ...(current.pointCloudColors[normalizedTopic] ??
              DEFAULT_MCAP_POINT_CLOUD_COLOR),
            ...settings,
          }),
        },
      }));
    },
    [update],
  );
  const setPointCloudPointSize = useCallback(
    (pointCloudPointSize: number) =>
      update((current) => ({
        ...current,
        pointCloudPointSize: normalizePointCloudPointSize(pointCloudPointSize),
      })),
    [update],
  );
  const setSceneBackground = useCallback(
    (settings: Partial<McapSceneBackgroundSettings>) =>
      update((current) => ({
        ...current,
        sceneBackground: normalizeSceneBackground({
          ...current.sceneBackground,
          ...settings,
        }),
      })),
    [update],
  );
  const setShowPointCloudColorLegend = useCallback(
    (showPointCloudColorLegend: boolean) =>
      update((current) => ({
        ...current,
        showPointCloudColorLegend,
      })),
    [update],
  );
  const setTemporalPolicy = useCallback(
    (policy: Partial<McapTemporalPolicySettings>) =>
      update((current) => ({
        ...current,
        temporalPolicy: normalizeTemporalPolicy({
          ...current.temporalPolicy,
          ...policy,
        }),
      })),
    [update],
  );
  const resetTemporalPolicy = useCallback(
    () =>
      update((current) => ({
        ...current,
        temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
      })),
    [update],
  );
  const setImageLabelTopics = useCallback(
    (imageTopic: string, labelTopics: readonly string[]) => {
      const normalizedImageTopic = imageTopic.trim();
      if (!normalizedImageTopic) return;
      const normalizedLabelTopics = normalizeTopicList(labelTopics);
      update((current) => ({
        ...current,
        imageLabelTopics: {
          ...current.imageLabelTopics,
          [normalizedImageTopic]: normalizedLabelTopics,
        },
      }));
    },
    [update],
  );

  const value = useMemo<McapModalSettingsContextValue>(
    () => ({
      fidelityMode: settings.fidelityMode,
      imageLabelTopics: settings.imageLabelTopics,
      pinholeCamera: settings.pinholeCamera,
      pointCloudColors: settings.pointCloudColors,
      pointCloudPointSize: settings.pointCloudPointSize,
      referenceGrid: settings.referenceGrid,
      sceneBackground: settings.sceneBackground,
      showPointCloudColorLegend: settings.showPointCloudColorLegend,
      temporalPolicy: settings.temporalPolicy,
      resetTemporalPolicy,
      setFidelityMode,
      setImageLabelTopics,
      setPinholeCamera,
      setPointCloudColor,
      setPointCloudPointSize,
      setReferenceGrid,
      setSceneBackground,
      setShowPointCloudColorLegend,
      setTemporalPolicy,
    }),
    [
      settings,
      resetTemporalPolicy,
      setFidelityMode,
      setImageLabelTopics,
      setPinholeCamera,
      setPointCloudColor,
      setPointCloudPointSize,
      setReferenceGrid,
      setSceneBackground,
      setShowPointCloudColorLegend,
      setTemporalPolicy,
    ],
  );

  return (
    <McapModalSettingsContext.Provider value={value}>
      {children}
    </McapModalSettingsContext.Provider>
  );
};

/**
 * Reads and updates MCAP modal settings.
 */
export function useMcapModalSettings(): McapModalSettingsContextValue {
  const ctx = useContext(McapModalSettingsContext);
  if (!ctx) {
    throw new Error(
      "useMcapModalSettings must be used inside <McapModalSettingsProvider>",
    );
  }
  return ctx;
}

function normalizeFidelityMode(value: unknown): McapPlaybackFidelityMode {
  return FIDELITY_MODES.includes(value as McapPlaybackFidelityMode)
    ? (value as McapPlaybackFidelityMode)
    : DEFAULT_MCAP_FIDELITY_MODE;
}

function normalizeImageLabelTopicMap(
  value: unknown,
): Record<string, readonly string[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, readonly string[]> = {};
  for (const [imageTopic, labelTopics] of Object.entries(value)) {
    const normalizedImageTopic = imageTopic.trim();
    if (!normalizedImageTopic) continue;
    result[normalizedImageTopic] = normalizeTopicList(labelTopics);
  }
  return result;
}

function normalizeTopicList(value: unknown): readonly string[] {
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

function normalizePointCloudColorMap(
  value: unknown,
): Record<string, McapPointCloudColorSettings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, McapPointCloudColorSettings> = {};
  for (const [topic, settings] of Object.entries(value)) {
    const normalizedTopic = topic.trim();
    if (!normalizedTopic) continue;
    result[normalizedTopic] = normalizePointCloudColor(settings);
  }
  return result;
}

function normalizePointCloudColor(value: unknown): McapPointCloudColorSettings {
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

function normalizePointCloudPointSize(value: unknown): number {
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

function normalizeReferenceGrid(value: unknown): McapReferenceGridSettings {
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

function normalizePinholeCamera(value: unknown): McapPinholeCameraSettings {
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

function normalizeSceneBackground(value: unknown): McapSceneBackgroundSettings {
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

function normalizeTemporalPolicy(value: unknown): McapTemporalPolicySettings {
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
