import {
  atom,
  createStore,
  useAtomValue,
  useSetAtom,
  type Getter,
  type Setter,
} from "jotai";
import { useCallback, useEffect, useMemo } from "react";

import {
  DEFAULT_MCAP_IMAGE_PROJECTION,
  DEFAULT_MCAP_POINT_CLOUD_COLOR,
  DEFAULT_MCAP_TEMPORAL_POLICY,
  EMPTY_MCAP_SCOPED_SETTINGS,
  normalizeMcapFidelityMode,
  normalizeMcapImageProjection,
  normalizeMcapPinholeCamera,
  normalizeMcapPointCloudColor,
  normalizeMcapPointCloudPointSize,
  normalizeMcapReferenceGrid,
  normalizeMcapSceneBackground,
  normalizeMcapTemporalPolicy,
  normalizeMcapTopicList,
  readMcapModalSettings,
  writeMcapModalSettings,
  type McapImageProjectionSettings,
  type McapPersistedModalSettings,
  type McapPinholeCameraSettings,
  type McapPlaybackFidelityMode,
  type McapPointCloudColorSettings,
  type McapReferenceGridSettings,
  type McapSceneBackgroundSettings,
  type McapTemporalPolicySettings,
} from "./mcap-modal-settings-storage";
import type { McapScopedModalSettings } from "./mcap-modal-settings-storage";
export type { McapScopedModalSettings };
export type {
  McapImageDisplayMode,
  McapImageGeometryMode,
} from "./camera-geometry/mcap-camera-model";

export {
  DEFAULT_MCAP_FIDELITY_MODE,
  DEFAULT_MCAP_IMAGE_PROJECTION,
  DEFAULT_MCAP_MODAL_SETTINGS,
  DEFAULT_MCAP_PROJECTION_POINT_SIZE,
  DEFAULT_MCAP_PINHOLE_CAMERA,
  DEFAULT_MCAP_POINT_CLOUD_COLOR,
  DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
  DEFAULT_MCAP_REFERENCE_GRID,
  DEFAULT_MCAP_SCENE_BACKGROUND,
  DEFAULT_MCAP_TEMPORAL_POLICY,
  MAX_MCAP_POINT_CLOUD_POINT_SIZE,
  MAX_MCAP_SETTINGS_SCOPES,
  MCAP_POINT_CLOUD_POINT_SIZE_STEP,
  MIN_MCAP_POINT_CLOUD_POINT_SIZE,
  defaultMcapPointCloudColorForIndex,
  defaultMcapPointCloudColorForSource,
  readMcapModalSettings,
  writeMcapModalSettings,
  type McapImageProjectionSettings,
  type McapPersistedModalSettings,
  type McapPinholeCameraSettings,
  type McapPlaybackFidelityMode,
  type McapPointCloudColorSettings,
  type McapReferenceGridSettings,
  type McapSceneBackgroundMode,
  type McapSceneBackgroundSettings,
  type McapTemporalPolicySettings,
} from "./mcap-modal-settings-storage";

const EMPTY_TOPIC_LIST: readonly string[] = Object.freeze([]);

const mcapModalSettingsStore = createStore();
const mcapModalSettingsAtom = atom<McapPersistedModalSettings>(
  readMcapModalSettings(),
);

/**
 * Active settings scope — one dataset (or ad hoc recording source). While
 * set, topic-keyed styling reads scoped-first with the legacy global maps
 * as fallback, and writes land under the scope, so `/lidar_top` in one
 * dataset stops styling `/lidar_top` in every other. Empty means unscoped:
 * reads and writes use the global maps, the pre-scoping behavior.
 */
const mcapSettingsScopeAtom = atom("");

/**
 * Resolves one topic-keyed styling map against the active scope: scoped
 * entries shadow global ones per topic. Returns the global map identity
 * while the scope adds nothing, so unscoped consumers never re-render.
 */
function resolveTopicKeyedMap<Key extends keyof McapScopedModalSettings>(
  get: Getter,
  key: Key,
): McapPersistedModalSettings[Key] {
  const settings = get(mcapModalSettingsAtom);
  const scope = get(mcapSettingsScopeAtom);
  const scoped = scope ? settings.scoped[scope]?.[key] : undefined;
  if (!scoped || Object.keys(scoped).length === 0) {
    return settings[key];
  }
  return { ...settings[key], ...scoped };
}

/**
 * Routes one topic-keyed write to the active scope (re-inserted last so
 * pruning drops least-recently-written scopes first), or to the legacy
 * global map while unscoped.
 */
function updateTopicKeyedSettings<Key extends keyof McapScopedModalSettings>(
  get: Getter,
  set: Setter,
  key: Key,
  updateMap: (
    current: McapScopedModalSettings[Key],
  ) => McapScopedModalSettings[Key],
): void {
  const scope = get(mcapSettingsScopeAtom);
  updateModalSettings(set, (current) => {
    if (!scope) {
      return { ...current, [key]: updateMap(current[key]) };
    }
    const previousScoped = current.scoped[scope] ?? EMPTY_MCAP_SCOPED_SETTINGS;
    const nextScoped = {
      ...previousScoped,
      [key]: updateMap(previousScoped[key]),
    };
    const scoped = { ...current.scoped };
    delete scoped[scope];
    scoped[scope] = nextScoped;
    return { ...current, scoped };
  });
}

const fidelityModeAtom = atom(
  (get) => get(mcapModalSettingsAtom).fidelityMode,
  (_get, set, mode: McapPlaybackFidelityMode) => {
    updateModalSettings(set, (current) => ({
      ...current,
      fidelityMode: normalizeMcapFidelityMode(mode),
    }));
  },
);

const temporalPolicyAtom = atom(
  (get) => get(mcapModalSettingsAtom).temporalPolicy,
  (_get, set, policy: Partial<McapTemporalPolicySettings>) => {
    updateModalSettings(set, (current) => ({
      ...current,
      temporalPolicy: normalizeMcapTemporalPolicy({
        ...current.temporalPolicy,
        ...policy,
      }),
    }));
  },
);

const resetTemporalPolicyAtom = atom(null, (_get, set) => {
  updateModalSettings(set, (current) => ({
    ...current,
    temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
  }));
});

const pinholeCameraAtom = atom(
  (get) => get(mcapModalSettingsAtom).pinholeCamera,
  (_get, set, settings: Partial<McapPinholeCameraSettings>) => {
    updateModalSettings(set, (current) => ({
      ...current,
      pinholeCamera: normalizeMcapPinholeCamera({
        ...current.pinholeCamera,
        ...settings,
      }),
    }));
  },
);

const referenceGridAtom = atom(
  (get) => get(mcapModalSettingsAtom).referenceGrid,
  (_get, set, settings: Partial<McapReferenceGridSettings>) => {
    updateModalSettings(set, (current) => ({
      ...current,
      referenceGrid: normalizeMcapReferenceGrid({
        ...current.referenceGrid,
        ...settings,
      }),
    }));
  },
);

const sceneBackgroundAtom = atom(
  (get) => get(mcapModalSettingsAtom).sceneBackground,
  (_get, set, settings: Partial<McapSceneBackgroundSettings>) => {
    updateModalSettings(set, (current) => ({
      ...current,
      sceneBackground: normalizeMcapSceneBackground({
        ...current.sceneBackground,
        ...settings,
      }),
    }));
  },
);

const pointCloudColorsAtom = atom(
  (get) => resolveTopicKeyedMap(get, "pointCloudColors"),
  (
    get,
    set,
    {
      topic,
      settings,
    }: {
      readonly topic: string;
      readonly settings: Partial<McapPointCloudColorSettings>;
    },
  ) => {
    const normalizedTopic = topic.trim();
    if (!normalizedTopic) return;

    // Merge over the resolved value: an edit in a scope starts from what
    // the user currently sees, even when that came from the global map.
    const previous =
      resolveTopicKeyedMap(get, "pointCloudColors")[normalizedTopic] ??
      DEFAULT_MCAP_POINT_CLOUD_COLOR;
    updateTopicKeyedSettings(get, set, "pointCloudColors", (colors) => ({
      ...colors,
      [normalizedTopic]: normalizeMcapPointCloudColor({
        ...previous,
        ...settings,
      }),
    }));
  },
);

const pointCloudPointSizeAtom = atom(
  (get) => get(mcapModalSettingsAtom).pointCloudPointSize,
  (_get, set, pointSize: number) => {
    updateModalSettings(set, (current) => ({
      ...current,
      pointCloudPointSize: normalizeMcapPointCloudPointSize(pointSize),
    }));
  },
);

const showPointCloudColorLegendAtom = atom(
  (get) => get(mcapModalSettingsAtom).showPointCloudColorLegend,
  (_get, set, showPointCloudColorLegend: boolean) => {
    updateModalSettings(set, (current) => ({
      ...current,
      showPointCloudColorLegend,
    }));
  },
);

const imageLabelTopicsAtom = atom(
  (get) => resolveTopicKeyedMap(get, "imageLabelTopics"),
  (
    get,
    set,
    {
      imageTopic,
      labelTopics,
    }: {
      readonly imageTopic: string;
      readonly labelTopics: readonly string[];
    },
  ) => {
    const normalizedImageTopic = imageTopic.trim();
    if (!normalizedImageTopic) return;
    const normalizedLabelTopics = normalizeMcapTopicList(labelTopics);

    updateTopicKeyedSettings(get, set, "imageLabelTopics", (topics) => ({
      ...topics,
      [normalizedImageTopic]: normalizedLabelTopics,
    }));
  },
);

const imageProjectionAtom = atom(
  (get) => resolveTopicKeyedMap(get, "imageProjection"),
  (
    get,
    set,
    {
      imageTopic,
      settings,
    }: {
      readonly imageTopic: string;
      readonly settings: Partial<McapImageProjectionSettings>;
    },
  ) => {
    const normalizedImageTopic = imageTopic.trim();
    if (!normalizedImageTopic) return;

    // Merge over the resolved value: an edit in a scope starts from what
    // the user currently sees, even when that came from the global map.
    const previous =
      resolveTopicKeyedMap(get, "imageProjection")[normalizedImageTopic] ??
      DEFAULT_MCAP_IMAGE_PROJECTION;
    let topics =
      settings.topics !== undefined ? settings.topics : previous.topics;
    if (settings.enabled === false) {
      topics = [];
    } else if (
      settings.enabled === true &&
      settings.topics === undefined &&
      !previous.enabled
    ) {
      topics = null;
    }
    updateTopicKeyedSettings(get, set, "imageProjection", (projections) => ({
      ...projections,
      [normalizedImageTopic]: normalizeMcapImageProjection({
        ...previous,
        ...settings,
        topics,
      }),
    }));
  },
);

function updateModalSettings(
  set: Setter,
  resolver: (current: McapPersistedModalSettings) => McapPersistedModalSettings,
): void {
  set(mcapModalSettingsAtom, (current) => {
    const next = resolver(current);
    if (next === current) {
      return current;
    }
    writeMcapModalSettings(next);
    return next;
  });
}

/**
 * Scopes topic-keyed styling (point-cloud colors, image projection, label
 * topics) to the mounted playback host's dataset. Reads resolve scoped
 * entries first and fall back to the legacy global maps; writes land under
 * the scope. Call once from the playback host; an empty/undefined scope key
 * leaves settings unscoped (global maps, the pre-scoping behavior).
 */
export function useMcapModalSettingsScopeSync(
  scopeKey: string | null | undefined,
): void {
  // This effect binds the settings scope to the active dataset for this
  // host's mounted lifetime, and releases only its own scope on unmount so
  // an interleaved mount of another host is never reset.
  useEffect(() => {
    const scope = scopeKey?.trim() ?? "";
    if (!scope) return undefined;
    mcapModalSettingsStore.set(mcapSettingsScopeAtom, scope);
    return () => {
      mcapModalSettingsStore.set(mcapSettingsScopeAtom, (current) =>
        current === scope ? "" : current,
      );
    };
  }, [scopeKey]);
}

/**
 * Reads and updates the MCAP playback fidelity preference.
 */
export function useMcapPlaybackSettings() {
  const fidelityMode = useAtomValue(fidelityModeAtom, {
    store: mcapModalSettingsStore,
  });
  const setFidelityMode = useSetAtom(fidelityModeAtom, {
    store: mcapModalSettingsStore,
  });

  return useMemo(
    () => ({ fidelityMode, setFidelityMode }),
    [fidelityMode, setFidelityMode],
  );
}

/**
 * Reads and updates MCAP timing policy preferences.
 */
export function useMcapTemporalPolicySettings() {
  const temporalPolicy = useAtomValue(temporalPolicyAtom, {
    store: mcapModalSettingsStore,
  });
  const setTemporalPolicy = useSetAtom(temporalPolicyAtom, {
    store: mcapModalSettingsStore,
  });
  const resetTemporalPolicy = useSetAtom(resetTemporalPolicyAtom, {
    store: mcapModalSettingsStore,
  });

  return useMemo(
    () => ({ resetTemporalPolicy, setTemporalPolicy, temporalPolicy }),
    [resetTemporalPolicy, setTemporalPolicy, temporalPolicy],
  );
}

/**
 * Reads and updates camera frustum display preferences.
 */
export function useMcapPinholeCameraSettings() {
  const pinholeCamera = useAtomValue(pinholeCameraAtom, {
    store: mcapModalSettingsStore,
  });
  const setPinholeCamera = useSetAtom(pinholeCameraAtom, {
    store: mcapModalSettingsStore,
  });

  return useMemo(
    () => ({ pinholeCamera, setPinholeCamera }),
    [pinholeCamera, setPinholeCamera],
  );
}

/**
 * Reads and updates 3D reference grid preferences.
 */
export function useMcapReferenceGridSettings() {
  const referenceGrid = useAtomValue(referenceGridAtom, {
    store: mcapModalSettingsStore,
  });
  const setReferenceGrid = useSetAtom(referenceGridAtom, {
    store: mcapModalSettingsStore,
  });

  return useMemo(
    () => ({ referenceGrid, setReferenceGrid }),
    [referenceGrid, setReferenceGrid],
  );
}

/**
 * Reads and updates 3D scene background preferences.
 */
export function useMcapSceneBackgroundSettings() {
  const sceneBackground = useAtomValue(sceneBackgroundAtom, {
    store: mcapModalSettingsStore,
  });
  const setSceneBackground = useSetAtom(sceneBackgroundAtom, {
    store: mcapModalSettingsStore,
  });

  return useMemo(
    () => ({ sceneBackground, setSceneBackground }),
    [sceneBackground, setSceneBackground],
  );
}

/**
 * Reads and updates point-cloud style preferences.
 */
export function useMcapPointCloudStyleSettings() {
  const pointCloudColors = useAtomValue(pointCloudColorsAtom, {
    store: mcapModalSettingsStore,
  });
  const pointCloudPointSize = useAtomValue(pointCloudPointSizeAtom, {
    store: mcapModalSettingsStore,
  });
  const showPointCloudColorLegend = useAtomValue(
    showPointCloudColorLegendAtom,
    {
      store: mcapModalSettingsStore,
    },
  );
  const setPointCloudColor = useSetAtom(pointCloudColorsAtom, {
    store: mcapModalSettingsStore,
  });
  const setPointCloudPointSize = useSetAtom(pointCloudPointSizeAtom, {
    store: mcapModalSettingsStore,
  });
  const setShowPointCloudColorLegend = useSetAtom(
    showPointCloudColorLegendAtom,
    {
      store: mcapModalSettingsStore,
    },
  );

  const updatePointCloudColor = useCallback(
    (topic: string, settings: Partial<McapPointCloudColorSettings>) => {
      setPointCloudColor({ settings, topic });
    },
    [setPointCloudColor],
  );

  return useMemo(
    () => ({
      pointCloudColors,
      pointCloudPointSize,
      setPointCloudColor: updatePointCloudColor,
      setPointCloudPointSize,
      setShowPointCloudColorLegend,
      showPointCloudColorLegend,
    }),
    [
      pointCloudColors,
      pointCloudPointSize,
      setPointCloudPointSize,
      setShowPointCloudColorLegend,
      showPointCloudColorLegend,
      updatePointCloudColor,
    ],
  );
}

/**
 * Reads and updates explicit label-topic selections for one image topic.
 */
export function useMcapImageLabelTopics(imageTopic: string | null | undefined) {
  const normalizedImageTopic = imageTopic?.trim() ?? "";
  const labelTopicsAtom = useMemo(
    () =>
      atom((get) =>
        normalizedImageTopic
          ? (get(imageLabelTopicsAtom)[normalizedImageTopic] ??
            EMPTY_TOPIC_LIST)
          : EMPTY_TOPIC_LIST,
      ),
    [normalizedImageTopic],
  );
  const hasExplicitLabelTopicsAtom = useMemo(
    () =>
      atom(
        (get) =>
          !!normalizedImageTopic &&
          Object.hasOwn(get(imageLabelTopicsAtom), normalizedImageTopic),
      ),
    [normalizedImageTopic],
  );
  const labelTopics = useAtomValue(labelTopicsAtom, {
    store: mcapModalSettingsStore,
  });
  const hasExplicitLabelTopics = useAtomValue(hasExplicitLabelTopicsAtom, {
    store: mcapModalSettingsStore,
  });
  const setStoredImageLabelTopics = useSetAtom(imageLabelTopicsAtom, {
    store: mcapModalSettingsStore,
  });
  const setLabelTopics = useCallback(
    (nextLabelTopics: readonly string[]) => {
      if (!normalizedImageTopic) return;
      setStoredImageLabelTopics({
        imageTopic: normalizedImageTopic,
        labelTopics: nextLabelTopics,
      });
    },
    [normalizedImageTopic, setStoredImageLabelTopics],
  );

  return useMemo(
    () => ({ hasExplicitLabelTopics, labelTopics, setLabelTopics }),
    [hasExplicitLabelTopics, labelTopics, setLabelTopics],
  );
}

/**
 * Reads and updates the lidar projection overlay settings for one image
 * topic.
 */
export function useMcapImageProjection(imageTopic: string | null | undefined) {
  const normalizedImageTopic = imageTopic?.trim() ?? "";
  const projectionValueAtom = useMemo(
    () =>
      atom((get) =>
        normalizedImageTopic
          ? (get(imageProjectionAtom)[normalizedImageTopic] ??
            DEFAULT_MCAP_IMAGE_PROJECTION)
          : DEFAULT_MCAP_IMAGE_PROJECTION,
      ),
    [normalizedImageTopic],
  );
  const projection = useAtomValue(projectionValueAtom, {
    store: mcapModalSettingsStore,
  });
  const setStoredProjection = useSetAtom(imageProjectionAtom, {
    store: mcapModalSettingsStore,
  });
  const setProjection = useCallback(
    (settings: Partial<McapImageProjectionSettings>) => {
      if (!normalizedImageTopic) return;
      setStoredProjection({ imageTopic: normalizedImageTopic, settings });
    },
    [normalizedImageTopic, setStoredProjection],
  );

  return useMemo(
    () => ({ projection, setProjection }),
    [projection, setProjection],
  );
}

/** Reads all per-image camera geometry settings for shared 3D consumers. */
export function useMcapImageProjectionSettingsByTopic(): Readonly<
  Record<string, McapImageProjectionSettings>
> {
  return useAtomValue(imageProjectionAtom, { store: mcapModalSettingsStore });
}

/** Updates camera geometry settings for an image without requiring its tile. */
export function useSetMcapImageProjection() {
  const setStoredProjection = useSetAtom(imageProjectionAtom, {
    store: mcapModalSettingsStore,
  });
  return useCallback(
    (imageTopic: string, settings: Partial<McapImageProjectionSettings>) =>
      setStoredProjection({ imageTopic, settings }),
    [setStoredProjection],
  );
}

/**
 * Resyncs the private settings store from localStorage for isolated tests.
 */
export function __resetMcapModalSettingsForTests(): void {
  mcapModalSettingsStore.set(mcapModalSettingsAtom, readMcapModalSettings());
  mcapModalSettingsStore.set(mcapSettingsScopeAtom, "");
}
