import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface McapPersistedModalSettings {
  version: 1;
  imageLabelTopics: Record<string, readonly string[]>;
  interpolate2dAnnotations: boolean;
  interpolate3dAnnotations: boolean;
}

interface McapModalSettingsContextValue {
  readonly imageLabelTopics: Record<string, readonly string[]>;
  readonly interpolate2dAnnotations: boolean;
  readonly interpolate3dAnnotations: boolean;
  readonly setImageLabelTopics: (
    imageTopic: string,
    labelTopics: readonly string[]
  ) => void;
  readonly setInterpolate2dAnnotations: (enabled: boolean) => void;
  readonly setInterpolate3dAnnotations: (enabled: boolean) => void;
}

const STORAGE_KEY = "fiftyone.mcap.modal-settings";
const VERSION = 1;

const DEFAULT_SETTINGS: McapPersistedModalSettings = {
  version: VERSION,
  imageLabelTopics: {},
  interpolate2dAnnotations: true,
  interpolate3dAnnotations: true,
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
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== VERSION
    ) {
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
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Writes the full persisted MCAP modal settings payload.
 */
export function writeMcapModalSettings(
  settings: McapPersistedModalSettings
): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: VERSION,
        imageLabelTopics: normalizeImageLabelTopicMap(
          settings.imageLabelTopics
        ),
        interpolate2dAnnotations: settings.interpolate2dAnnotations,
        interpolate3dAnnotations: settings.interpolate3dAnnotations,
      })
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
    readMcapModalSettings
  );

  const update = useCallback(
    (
      resolver: (
        current: McapPersistedModalSettings
      ) => McapPersistedModalSettings
    ) => {
      setSettings((current) => {
        const next = resolver(current);
        writeMcapModalSettings(next);
        return next;
      });
    },
    []
  );

  const setInterpolate2dAnnotations = useCallback(
    (enabled: boolean) =>
      update((current) => ({
        ...current,
        interpolate2dAnnotations: enabled,
      })),
    [update]
  );
  const setInterpolate3dAnnotations = useCallback(
    (enabled: boolean) =>
      update((current) => ({
        ...current,
        interpolate3dAnnotations: enabled,
      })),
    [update]
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
    [update]
  );

  const value = useMemo<McapModalSettingsContextValue>(
    () => ({
      imageLabelTopics: settings.imageLabelTopics,
      interpolate2dAnnotations: settings.interpolate2dAnnotations,
      interpolate3dAnnotations: settings.interpolate3dAnnotations,
      setImageLabelTopics,
      setInterpolate2dAnnotations,
      setInterpolate3dAnnotations,
    }),
    [
      settings,
      setImageLabelTopics,
      setInterpolate2dAnnotations,
      setInterpolate3dAnnotations,
    ]
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
      "useMcapModalSettings must be used inside <McapModalSettingsProvider>"
    );
  }
  return ctx;
}

function normalizeImageLabelTopicMap(
  value: unknown
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
        .filter(Boolean)
    )
  );
}
