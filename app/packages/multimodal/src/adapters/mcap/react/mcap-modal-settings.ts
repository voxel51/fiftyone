import {
  atom,
  createStore,
  useAtomValue,
  useSetAtom,
  type Setter,
} from "jotai";
import { useCallback, useMemo } from "react";

import {
  DEFAULT_MCAP_IMAGE_PROJECTION,
  DEFAULT_MCAP_POINT_CLOUD_COLOR,
  DEFAULT_MCAP_TEMPORAL_POLICY,
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

export {
  DEFAULT_MCAP_FIDELITY_MODE,
  DEFAULT_MCAP_IMAGE_PROJECTION,
  DEFAULT_MCAP_MODAL_SETTINGS,
  DEFAULT_MCAP_PINHOLE_CAMERA,
  DEFAULT_MCAP_POINT_CLOUD_COLOR,
  DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
  DEFAULT_MCAP_REFERENCE_GRID,
  DEFAULT_MCAP_SCENE_BACKGROUND,
  DEFAULT_MCAP_TEMPORAL_POLICY,
  MAX_MCAP_POINT_CLOUD_POINT_SIZE,
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
  (get) => get(mcapModalSettingsAtom).pointCloudColors,
  (
    _get,
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

    updateModalSettings(set, (current) => ({
      ...current,
      pointCloudColors: {
        ...current.pointCloudColors,
        [normalizedTopic]: normalizeMcapPointCloudColor({
          ...(current.pointCloudColors[normalizedTopic] ??
            DEFAULT_MCAP_POINT_CLOUD_COLOR),
          ...settings,
        }),
      },
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
  (get) => get(mcapModalSettingsAtom).imageLabelTopics,
  (
    _get,
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

    updateModalSettings(set, (current) => ({
      ...current,
      imageLabelTopics: {
        ...current.imageLabelTopics,
        [normalizedImageTopic]: normalizedLabelTopics,
      },
    }));
  },
);

const imageProjectionAtom = atom(
  (get) => get(mcapModalSettingsAtom).imageProjection,
  (
    _get,
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

    updateModalSettings(set, (current) => ({
      ...current,
      imageProjection: {
        ...current.imageProjection,
        [normalizedImageTopic]: normalizeMcapImageProjection({
          ...(current.imageProjection[normalizedImageTopic] ??
            DEFAULT_MCAP_IMAGE_PROJECTION),
          ...settings,
        }),
      },
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

/**
 * Resyncs the private settings store from localStorage for isolated tests.
 */
export function __resetMcapModalSettingsForTests(): void {
  mcapModalSettingsStore.set(mcapModalSettingsAtom, readMcapModalSettings());
}
