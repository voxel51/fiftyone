import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "../../../visualization/panels/style-tokens";

export interface McapTemporalPolicySettings {
  readonly boundaryClampMs: number;
  readonly maxInterpolationGapMs: number;
  readonly staleMediaWarningMs: number;
  readonly transformGapWarningMs: number;
}

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
 * 3D scene backdrop styles: a user-picked solid color, or one of two
 * named gradient profiles — "Abyss" (dark) and "Studio" (light, warm).
 */
export type McapSceneBackgroundMode = "solid" | "abyss" | "studio";

export interface McapSceneBackgroundSettings {
  readonly mode: McapSceneBackgroundMode;
  /** Hex color (#rrggbb) used while `mode` is "solid". */
  readonly solidColor: string;
}

interface McapPersistedModalSettings {
  version: 1;
  imageLabelTopics: Record<string, readonly string[]>;
  interpolate2dAnnotations: boolean;
  interpolate3dAnnotations: boolean;
  referenceGrid: McapReferenceGridSettings;
  sceneBackground: McapSceneBackgroundSettings;
  temporalPolicy: McapTemporalPolicySettings;
}

interface McapModalSettingsContextValue {
  readonly imageLabelTopics: Record<string, readonly string[]>;
  readonly interpolate2dAnnotations: boolean;
  readonly interpolate3dAnnotations: boolean;
  readonly referenceGrid: McapReferenceGridSettings;
  readonly sceneBackground: McapSceneBackgroundSettings;
  readonly temporalPolicy: McapTemporalPolicySettings;
  readonly setImageLabelTopics: (
    imageTopic: string,
    labelTopics: readonly string[],
  ) => void;
  readonly setInterpolate2dAnnotations: (enabled: boolean) => void;
  readonly setInterpolate3dAnnotations: (enabled: boolean) => void;
  readonly setReferenceGrid: (
    settings: Partial<McapReferenceGridSettings>,
  ) => void;
  readonly setSceneBackground: (
    settings: Partial<McapSceneBackgroundSettings>,
  ) => void;
  readonly resetTemporalPolicy: () => void;
  readonly setTemporalPolicy: (
    policy: Partial<McapTemporalPolicySettings>,
  ) => void;
}

const STORAGE_KEY = "fiftyone.mcap.modal-settings";
const VERSION = 1;

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

export const DEFAULT_MCAP_SCENE_BACKGROUND: McapSceneBackgroundSettings = {
  mode: "solid",
  solidColor: VISUALIZATION_PANEL_BACKGROUND_COLOR,
};

const SCENE_BACKGROUND_MODES: readonly McapSceneBackgroundMode[] = [
  "solid",
  "abyss",
  "studio",
];

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const DEFAULT_SETTINGS: McapPersistedModalSettings = {
  version: VERSION,
  imageLabelTopics: {},
  interpolate2dAnnotations: true,
  interpolate3dAnnotations: true,
  referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
  sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
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

    if ((parsed as { version?: unknown }).version !== VERSION) {
      return DEFAULT_SETTINGS;
    }

    const candidate = parsed as Partial<McapPersistedModalSettings>;
    return {
      version: VERSION,
      imageLabelTopics: normalizeImageLabelTopicMap(candidate.imageLabelTopics),
      interpolate2dAnnotations:
        typeof candidate.interpolate2dAnnotations === "boolean"
          ? candidate.interpolate2dAnnotations
          : DEFAULT_SETTINGS.interpolate2dAnnotations,
      interpolate3dAnnotations:
        typeof candidate.interpolate3dAnnotations === "boolean"
          ? candidate.interpolate3dAnnotations
          : DEFAULT_SETTINGS.interpolate3dAnnotations,
      referenceGrid: normalizeReferenceGrid(candidate.referenceGrid),
      sceneBackground: normalizeSceneBackground(candidate.sceneBackground),
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
        imageLabelTopics: normalizeImageLabelTopicMap(
          settings.imageLabelTopics,
        ),
        interpolate2dAnnotations: settings.interpolate2dAnnotations,
        interpolate3dAnnotations: settings.interpolate3dAnnotations,
        referenceGrid: normalizeReferenceGrid(settings.referenceGrid),
        sceneBackground: normalizeSceneBackground(settings.sceneBackground),
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

  const setInterpolate2dAnnotations = useCallback(
    (enabled: boolean) =>
      update((current) => ({
        ...current,
        interpolate2dAnnotations: enabled,
      })),
    [update],
  );
  const setInterpolate3dAnnotations = useCallback(
    (enabled: boolean) =>
      update((current) => ({
        ...current,
        interpolate3dAnnotations: enabled,
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
      imageLabelTopics: settings.imageLabelTopics,
      interpolate2dAnnotations: settings.interpolate2dAnnotations,
      interpolate3dAnnotations: settings.interpolate3dAnnotations,
      referenceGrid: settings.referenceGrid,
      sceneBackground: settings.sceneBackground,
      temporalPolicy: settings.temporalPolicy,
      resetTemporalPolicy,
      setImageLabelTopics,
      setInterpolate2dAnnotations,
      setInterpolate3dAnnotations,
      setReferenceGrid,
      setSceneBackground,
      setTemporalPolicy,
    }),
    [
      settings,
      resetTemporalPolicy,
      setImageLabelTopics,
      setInterpolate2dAnnotations,
      setInterpolate3dAnnotations,
      setReferenceGrid,
      setSceneBackground,
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
