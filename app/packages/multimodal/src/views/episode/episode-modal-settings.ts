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
  DEFAULT_EPISODE_IMAGE_PROJECTION,
  DEFAULT_EPISODE_POINT_CLOUD_COLOR,
  DEFAULT_EPISODE_TEMPORAL_POLICY,
  EMPTY_EPISODE_SCOPED_SETTINGS,
  normalizeEpisodeFidelityMode,
  normalizeEpisodeImageProjection,
  normalizeEpisodePinholeCamera,
  normalizeEpisodePointCloudColor,
  normalizeEpisodePointCloudPointSize,
  normalizeEpisodeReferenceGrid,
  normalizeEpisodeSceneBackground,
  normalizeEpisodeTemporalPolicy,
  normalizeEpisodeStreamList,
  readEpisodeModalSettings,
  writeEpisodeModalSettings,
  type EpisodeImageProjectionSettings,
  type EpisodePersistedModalSettings,
  type EpisodePinholeCameraSettings,
  type EpisodePlaybackFidelityMode,
  type EpisodePointCloudColorSettings,
  type EpisodeReferenceGridSettings,
  type EpisodeSceneBackgroundSettings,
  type EpisodeTemporalPolicySettings,
} from "./episode-modal-settings-storage";
import type { EpisodeScopedModalSettings } from "./episode-modal-settings-storage";
export type { EpisodeScopedModalSettings };
export type {
  EpisodeImageDisplayMode,
  EpisodeImageGeometryMode,
} from "./camera-geometry/episode-camera-model";

export {
  DEFAULT_EPISODE_FIDELITY_MODE,
  DEFAULT_EPISODE_IMAGE_PROJECTION,
  DEFAULT_EPISODE_MODAL_SETTINGS,
  DEFAULT_EPISODE_PROJECTION_POINT_SIZE,
  DEFAULT_EPISODE_PINHOLE_CAMERA,
  DEFAULT_EPISODE_POINT_CLOUD_COLOR,
  DEFAULT_EPISODE_POINT_CLOUD_POINT_SIZE,
  DEFAULT_EPISODE_REFERENCE_GRID,
  DEFAULT_EPISODE_SCENE_BACKGROUND,
  DEFAULT_EPISODE_TEMPORAL_POLICY,
  MAX_EPISODE_POINT_CLOUD_POINT_SIZE,
  MAX_EPISODE_SETTINGS_SCOPES,
  EPISODE_POINT_CLOUD_POINT_SIZE_STEP,
  MIN_EPISODE_POINT_CLOUD_POINT_SIZE,
  defaultEpisodePointCloudColorForIndex,
  defaultEpisodePointCloudColorForSource,
  readEpisodeModalSettings,
  writeEpisodeModalSettings,
  type EpisodeImageProjectionSettings,
  type EpisodePersistedModalSettings,
  type EpisodePinholeCameraSettings,
  type EpisodePlaybackFidelityMode,
  type EpisodePointCloudColorSettings,
  type EpisodeReferenceGridSettings,
  type EpisodeSceneBackgroundMode,
  type EpisodeSceneBackgroundSettings,
  type EpisodeTemporalPolicySettings,
} from "./episode-modal-settings-storage";

const EMPTY_STREAM_LIST: readonly string[] = Object.freeze([]);

const episodeModalSettingsStore = createStore();
const episodeModalSettingsAtom = atom<EpisodePersistedModalSettings>(
  readEpisodeModalSettings(),
);

/**
 * Active settings scope — one dataset (or ad hoc recording source). While
 * set, stream-keyed styling reads and writes only that scope, so `/lidar_top`
 * in one dataset cannot style `/lidar_top` in another. Empty means unscoped:
 * reads and writes use the top-level maps.
 */
const episodeSettingsScopeAtom = atom("");

/**
 * Resolves one stream-keyed styling map against the active scope. Scoped and
 * unscoped maps are deliberately isolated.
 */
function resolveStreamKeyedMap<Key extends keyof EpisodeScopedModalSettings>(
  get: Getter,
  key: Key,
): EpisodeScopedModalSettings[Key] {
  const settings = get(episodeModalSettingsAtom);
  const scope = get(episodeSettingsScopeAtom);
  if (scope) {
    return settings.scoped[scope]?.[key] ?? EMPTY_EPISODE_SCOPED_SETTINGS[key];
  }
  return settings[key] as EpisodeScopedModalSettings[Key];
}

/**
 * Routes one stream-keyed write to the active scope (re-inserted last so
 * pruning drops least-recently-written scopes first), or to the unscoped
 * global map while unscoped.
 */
function updateStreamKeyedSettings<
  Key extends keyof EpisodeScopedModalSettings,
>(
  get: Getter,
  set: Setter,
  key: Key,
  updateMap: (
    current: EpisodeScopedModalSettings[Key],
  ) => EpisodeScopedModalSettings[Key],
): void {
  const scope = get(episodeSettingsScopeAtom);
  updateModalSettings(set, (current) => {
    if (!scope) {
      return { ...current, [key]: updateMap(current[key]) };
    }
    const previousScoped =
      current.scoped[scope] ?? EMPTY_EPISODE_SCOPED_SETTINGS;
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
  (get) => get(episodeModalSettingsAtom).fidelityMode,
  (_get, set, mode: EpisodePlaybackFidelityMode) => {
    updateModalSettings(set, (current) => ({
      ...current,
      fidelityMode: normalizeEpisodeFidelityMode(mode),
    }));
  },
);

const temporalPolicyAtom = atom(
  (get) => get(episodeModalSettingsAtom).temporalPolicy,
  (_get, set, policy: Partial<EpisodeTemporalPolicySettings>) => {
    updateModalSettings(set, (current) => ({
      ...current,
      temporalPolicy: normalizeEpisodeTemporalPolicy({
        ...current.temporalPolicy,
        ...policy,
      }),
    }));
  },
);

const resetTemporalPolicyAtom = atom(null, (_get, set) => {
  updateModalSettings(set, (current) => ({
    ...current,
    temporalPolicy: DEFAULT_EPISODE_TEMPORAL_POLICY,
  }));
});

const pinholeCameraAtom = atom(
  (get) => get(episodeModalSettingsAtom).pinholeCamera,
  (_get, set, settings: Partial<EpisodePinholeCameraSettings>) => {
    updateModalSettings(set, (current) => ({
      ...current,
      pinholeCamera: normalizeEpisodePinholeCamera({
        ...current.pinholeCamera,
        ...settings,
      }),
    }));
  },
);

const referenceGridAtom = atom(
  (get) => get(episodeModalSettingsAtom).referenceGrid,
  (_get, set, settings: Partial<EpisodeReferenceGridSettings>) => {
    updateModalSettings(set, (current) => ({
      ...current,
      referenceGrid: normalizeEpisodeReferenceGrid({
        ...current.referenceGrid,
        ...settings,
      }),
    }));
  },
);

const sceneBackgroundAtom = atom(
  (get) => get(episodeModalSettingsAtom).sceneBackground,
  (_get, set, settings: Partial<EpisodeSceneBackgroundSettings>) => {
    updateModalSettings(set, (current) => ({
      ...current,
      sceneBackground: normalizeEpisodeSceneBackground({
        ...current.sceneBackground,
        ...settings,
      }),
    }));
  },
);

const pointCloudColorsAtom = atom(
  (get) => resolveStreamKeyedMap(get, "pointCloudColors"),
  (
    get,
    set,
    {
      stream,
      settings,
    }: {
      readonly stream: string;
      readonly settings: Partial<EpisodePointCloudColorSettings>;
    },
  ) => {
    const normalizedStream = stream.trim();
    if (!normalizedStream) return;

    // Merge over the value visible in the current scope.
    const previous =
      resolveStreamKeyedMap(get, "pointCloudColors")[normalizedStream] ??
      DEFAULT_EPISODE_POINT_CLOUD_COLOR;
    updateStreamKeyedSettings(get, set, "pointCloudColors", (colors) => ({
      ...colors,
      [normalizedStream]: normalizeEpisodePointCloudColor({
        ...previous,
        ...settings,
      }),
    }));
  },
);

const pointCloudPointSizeAtom = atom(
  (get) => get(episodeModalSettingsAtom).pointCloudPointSize,
  (_get, set, pointSize: number) => {
    updateModalSettings(set, (current) => ({
      ...current,
      pointCloudPointSize: normalizeEpisodePointCloudPointSize(pointSize),
    }));
  },
);

const showPointCloudColorLegendAtom = atom(
  (get) => get(episodeModalSettingsAtom).showPointCloudColorLegend,
  (_get, set, showPointCloudColorLegend: boolean) => {
    updateModalSettings(set, (current) => ({
      ...current,
      showPointCloudColorLegend,
    }));
  },
);

const imageLabelStreamsAtom = atom(
  (get) => resolveStreamKeyedMap(get, "imageLabelStreams"),
  (
    get,
    set,
    {
      imageStream,
      labelStreams,
    }: {
      readonly imageStream: string;
      readonly labelStreams: readonly string[];
    },
  ) => {
    const normalizedImageStream = imageStream.trim();
    if (!normalizedImageStream) return;
    const normalizedLabelStreams = normalizeEpisodeStreamList(labelStreams);

    updateStreamKeyedSettings(get, set, "imageLabelStreams", (streams) => ({
      ...streams,
      [normalizedImageStream]: normalizedLabelStreams,
    }));
  },
);

const imageProjectionAtom = atom(
  (get) => resolveStreamKeyedMap(get, "imageProjection"),
  (
    get,
    set,
    {
      imageStream,
      settings,
    }: {
      readonly imageStream: string;
      readonly settings: Partial<EpisodeImageProjectionSettings>;
    },
  ) => {
    const normalizedImageStream = imageStream.trim();
    if (!normalizedImageStream) return;

    // Merge over the value visible in the current scope.
    const previous =
      resolveStreamKeyedMap(get, "imageProjection")[normalizedImageStream] ??
      DEFAULT_EPISODE_IMAGE_PROJECTION;
    let streams =
      settings.streams !== undefined ? settings.streams : previous.streams;
    if (settings.enabled === false) {
      streams = [];
    } else if (
      settings.enabled === true &&
      settings.streams === undefined &&
      !previous.enabled
    ) {
      streams = null;
    }
    updateStreamKeyedSettings(get, set, "imageProjection", (projections) => ({
      ...projections,
      [normalizedImageStream]: normalizeEpisodeImageProjection({
        ...previous,
        ...settings,
        streams,
      }),
    }));
  },
);

function updateModalSettings(
  set: Setter,
  resolver: (
    current: EpisodePersistedModalSettings,
  ) => EpisodePersistedModalSettings,
): void {
  set(episodeModalSettingsAtom, (current) => {
    const next = resolver(current);
    if (next === current) {
      return current;
    }
    writeEpisodeModalSettings(next);
    return next;
  });
}

/**
 * Scopes stream-keyed styling (point-cloud colors, image projection, label
 * streams) to the mounted playback host's dataset. Reads and writes stay under
 * the scope. Call once from the playback host; an empty/undefined scope key
 * leaves settings unscoped.
 */
export function useEpisodeModalSettingsScopeSync(
  scopeKey: string | null | undefined,
): void {
  // This effect binds the settings scope to the active dataset for this
  // host's mounted lifetime, and releases only its own scope on unmount so
  // an interleaved mount of another host is never reset.
  useEffect(() => {
    const scope = scopeKey?.trim() ?? "";
    if (!scope) return undefined;
    episodeModalSettingsStore.set(episodeSettingsScopeAtom, scope);
    return () => {
      episodeModalSettingsStore.set(episodeSettingsScopeAtom, (current) =>
        current === scope ? "" : current,
      );
    };
  }, [scopeKey]);
}

/**
 * Reads and updates the episode playback fidelity preference.
 */
export function useEpisodePlaybackSettings() {
  const fidelityMode = useAtomValue(fidelityModeAtom, {
    store: episodeModalSettingsStore,
  });
  const setFidelityMode = useSetAtom(fidelityModeAtom, {
    store: episodeModalSettingsStore,
  });

  return useMemo(
    () => ({ fidelityMode, setFidelityMode }),
    [fidelityMode, setFidelityMode],
  );
}

/**
 * Reads and updates episode timing policy preferences.
 */
export function useEpisodeTemporalPolicySettings() {
  const temporalPolicy = useAtomValue(temporalPolicyAtom, {
    store: episodeModalSettingsStore,
  });
  const setTemporalPolicy = useSetAtom(temporalPolicyAtom, {
    store: episodeModalSettingsStore,
  });
  const resetTemporalPolicy = useSetAtom(resetTemporalPolicyAtom, {
    store: episodeModalSettingsStore,
  });

  return useMemo(
    () => ({ resetTemporalPolicy, setTemporalPolicy, temporalPolicy }),
    [resetTemporalPolicy, setTemporalPolicy, temporalPolicy],
  );
}

/**
 * Reads and updates camera frustum display preferences.
 */
export function useEpisodePinholeCameraSettings() {
  const pinholeCamera = useAtomValue(pinholeCameraAtom, {
    store: episodeModalSettingsStore,
  });
  const setPinholeCamera = useSetAtom(pinholeCameraAtom, {
    store: episodeModalSettingsStore,
  });

  return useMemo(
    () => ({ pinholeCamera, setPinholeCamera }),
    [pinholeCamera, setPinholeCamera],
  );
}

/**
 * Reads and updates 3D reference grid preferences.
 */
export function useEpisodeReferenceGridSettings() {
  const referenceGrid = useAtomValue(referenceGridAtom, {
    store: episodeModalSettingsStore,
  });
  const setReferenceGrid = useSetAtom(referenceGridAtom, {
    store: episodeModalSettingsStore,
  });

  return useMemo(
    () => ({ referenceGrid, setReferenceGrid }),
    [referenceGrid, setReferenceGrid],
  );
}

/**
 * Reads and updates 3D scene background preferences.
 */
export function useEpisodeSceneBackgroundSettings() {
  const sceneBackground = useAtomValue(sceneBackgroundAtom, {
    store: episodeModalSettingsStore,
  });
  const setSceneBackground = useSetAtom(sceneBackgroundAtom, {
    store: episodeModalSettingsStore,
  });

  return useMemo(
    () => ({ sceneBackground, setSceneBackground }),
    [sceneBackground, setSceneBackground],
  );
}

/**
 * Reads and updates point-cloud style preferences.
 */
export function useEpisodePointCloudStyleSettings() {
  const pointCloudColors = useAtomValue(pointCloudColorsAtom, {
    store: episodeModalSettingsStore,
  });
  const pointCloudPointSize = useAtomValue(pointCloudPointSizeAtom, {
    store: episodeModalSettingsStore,
  });
  const showPointCloudColorLegend = useAtomValue(
    showPointCloudColorLegendAtom,
    {
      store: episodeModalSettingsStore,
    },
  );
  const setPointCloudColor = useSetAtom(pointCloudColorsAtom, {
    store: episodeModalSettingsStore,
  });
  const setPointCloudPointSize = useSetAtom(pointCloudPointSizeAtom, {
    store: episodeModalSettingsStore,
  });
  const setShowPointCloudColorLegend = useSetAtom(
    showPointCloudColorLegendAtom,
    {
      store: episodeModalSettingsStore,
    },
  );

  const updatePointCloudColor = useCallback(
    (stream: string, settings: Partial<EpisodePointCloudColorSettings>) => {
      setPointCloudColor({ settings, stream });
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
 * Reads and updates explicit label-stream selections for one image stream.
 */
export function useEpisodeImageLabelStreams(
  imageStream: string | null | undefined,
) {
  const normalizedImageStream = imageStream?.trim() ?? "";
  const labelStreamsAtom = useMemo(
    () =>
      atom((get) =>
        normalizedImageStream
          ? (get(imageLabelStreamsAtom)[normalizedImageStream] ??
            EMPTY_STREAM_LIST)
          : EMPTY_STREAM_LIST,
      ),
    [normalizedImageStream],
  );
  const hasExplicitLabelStreamsAtom = useMemo(
    () =>
      atom(
        (get) =>
          !!normalizedImageStream &&
          Object.hasOwn(get(imageLabelStreamsAtom), normalizedImageStream),
      ),
    [normalizedImageStream],
  );
  const labelStreams = useAtomValue(labelStreamsAtom, {
    store: episodeModalSettingsStore,
  });
  const hasExplicitLabelStreams = useAtomValue(hasExplicitLabelStreamsAtom, {
    store: episodeModalSettingsStore,
  });
  const setStoredImageLabelStreams = useSetAtom(imageLabelStreamsAtom, {
    store: episodeModalSettingsStore,
  });
  const setLabelStreams = useCallback(
    (nextLabelStreams: readonly string[]) => {
      if (!normalizedImageStream) return;
      setStoredImageLabelStreams({
        imageStream: normalizedImageStream,
        labelStreams: nextLabelStreams,
      });
    },
    [normalizedImageStream, setStoredImageLabelStreams],
  );

  return useMemo(
    () => ({ hasExplicitLabelStreams, labelStreams, setLabelStreams }),
    [hasExplicitLabelStreams, labelStreams, setLabelStreams],
  );
}

/**
 * Reads and updates the lidar projection overlay settings for one image
 * stream.
 */
export function useEpisodeImageProjection(
  imageStream: string | null | undefined,
) {
  const normalizedImageStream = imageStream?.trim() ?? "";
  const projectionValueAtom = useMemo(
    () =>
      atom((get) =>
        normalizedImageStream
          ? (get(imageProjectionAtom)[normalizedImageStream] ??
            DEFAULT_EPISODE_IMAGE_PROJECTION)
          : DEFAULT_EPISODE_IMAGE_PROJECTION,
      ),
    [normalizedImageStream],
  );
  const projection = useAtomValue(projectionValueAtom, {
    store: episodeModalSettingsStore,
  });
  const setStoredProjection = useSetAtom(imageProjectionAtom, {
    store: episodeModalSettingsStore,
  });
  const setProjection = useCallback(
    (settings: Partial<EpisodeImageProjectionSettings>) => {
      if (!normalizedImageStream) return;
      setStoredProjection({ imageStream: normalizedImageStream, settings });
    },
    [normalizedImageStream, setStoredProjection],
  );

  return useMemo(
    () => ({ projection, setProjection }),
    [projection, setProjection],
  );
}

/** Reads all per-image camera geometry settings for shared 3D consumers. */
export function useEpisodeImageProjectionSettingsByStream(): Readonly<
  Record<string, EpisodeImageProjectionSettings>
> {
  return useAtomValue(imageProjectionAtom, {
    store: episodeModalSettingsStore,
  });
}

/** Updates camera geometry settings for an image without requiring its tile. */
export function useSetEpisodeImageProjection() {
  const setStoredProjection = useSetAtom(imageProjectionAtom, {
    store: episodeModalSettingsStore,
  });
  return useCallback(
    (imageStream: string, settings: Partial<EpisodeImageProjectionSettings>) =>
      setStoredProjection({ imageStream, settings }),
    [setStoredProjection],
  );
}

/**
 * Resyncs the private settings store from localStorage for isolated tests.
 */
export function __resetEpisodeModalSettingsForTests(): void {
  episodeModalSettingsStore.set(
    episodeModalSettingsAtom,
    readEpisodeModalSettings(),
  );
  episodeModalSettingsStore.set(episodeSettingsScopeAtom, "");
}
