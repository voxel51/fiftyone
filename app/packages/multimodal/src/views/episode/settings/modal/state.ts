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
  DEFAULT_IMAGE_PROJECTION,
  DEFAULT_POINT_CLOUD_COLOR,
  EMPTY_SCOPED_SETTINGS,
  normalizeImageProjection,
  normalizePinholeCamera,
  normalizePointCloudColor,
  normalizePointCloudPointSize,
  normalizeReferenceGrid,
  normalizeSceneBackground,
  normalizeStreamList,
  readModalSettings,
  writeModalSettings,
  type ImageProjectionSettings,
  type PersistedModalSettings,
  type PinholeCameraSettings,
  type PointCloudColorSettings,
  type ReferenceGridSettings,
  type SceneBackgroundSettings,
} from "./storage";
import type { ScopedModalSettings } from "./storage";
export type { ScopedModalSettings };
export type {
  ImageDisplayMode,
  ImageGeometryMode,
} from "../../spatial/camera-geometry/camera-model";

export {
  DEFAULT_IMAGE_PROJECTION,
  DEFAULT_MODAL_SETTINGS,
  DEFAULT_PROJECTION_POINT_SIZE,
  DEFAULT_PINHOLE_CAMERA,
  DEFAULT_POINT_CLOUD_COLOR,
  DEFAULT_POINT_CLOUD_POINT_SIZE,
  DEFAULT_REFERENCE_GRID,
  DEFAULT_SCENE_BACKGROUND,
  MAX_POINT_CLOUD_POINT_SIZE,
  MAX_SETTINGS_SCOPES,
  POINT_CLOUD_POINT_SIZE_STEP,
  MIN_POINT_CLOUD_POINT_SIZE,
  defaultPointCloudColorForIndex,
  defaultPointCloudColorForSource,
  readModalSettings,
  writeModalSettings,
  type ImageProjectionSettings,
  type PersistedModalSettings,
  type PinholeCameraSettings,
  type PointCloudColorSettings,
  type ReferenceGridSettings,
  type SceneBackgroundMode,
  type SceneBackgroundSettings,
} from "./storage";

const EMPTY_STREAM_LIST: readonly string[] = Object.freeze([]);

const modalSettingsStore = createStore();
const modalSettingsAtom = atom<PersistedModalSettings>(readModalSettings());

/**
 * Active settings scope — one dataset (or ad hoc recording source). While
 * set, stream-keyed styling reads and writes only that scope, so `/lidar_top`
 * in one dataset cannot style `/lidar_top` in another. Empty means unscoped:
 * reads and writes use the top-level maps.
 */
const settingsScopeAtom = atom("");

/**
 * Resolves one stream-keyed styling map against the active scope. Scoped and
 * unscoped maps are deliberately isolated.
 */
function resolveStreamKeyedMap<Key extends keyof ScopedModalSettings>(
  get: Getter,
  key: Key,
): ScopedModalSettings[Key] {
  const settings = get(modalSettingsAtom);
  const scope = get(settingsScopeAtom);
  if (scope) {
    return settings.scoped[scope]?.[key] ?? EMPTY_SCOPED_SETTINGS[key];
  }
  return settings[key] as ScopedModalSettings[Key];
}

/**
 * Routes one stream-keyed write to the active scope (re-inserted last so
 * pruning drops least-recently-written scopes first), or to the unscoped
 * global map while unscoped.
 */
function updateStreamKeyedSettings<Key extends keyof ScopedModalSettings>(
  get: Getter,
  set: Setter,
  key: Key,
  updateMap: (current: ScopedModalSettings[Key]) => ScopedModalSettings[Key],
): void {
  const scope = get(settingsScopeAtom);
  updateModalSettings(set, (current) => {
    if (!scope) {
      return { ...current, [key]: updateMap(current[key]) };
    }
    const previousScoped = current.scoped[scope] ?? EMPTY_SCOPED_SETTINGS;
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

const pinholeCameraAtom = atom(
  (get) => get(modalSettingsAtom).pinholeCamera,
  (_get, set, settings: Partial<PinholeCameraSettings>) => {
    updateModalSettings(set, (current) => ({
      ...current,
      pinholeCamera: normalizePinholeCamera({
        ...current.pinholeCamera,
        ...settings,
      }),
    }));
  },
);

const referenceGridAtom = atom(
  (get) => get(modalSettingsAtom).referenceGrid,
  (_get, set, settings: Partial<ReferenceGridSettings>) => {
    updateModalSettings(set, (current) => ({
      ...current,
      referenceGrid: normalizeReferenceGrid({
        ...current.referenceGrid,
        ...settings,
      }),
    }));
  },
);

const sceneBackgroundAtom = atom(
  (get) => get(modalSettingsAtom).sceneBackground,
  (_get, set, settings: Partial<SceneBackgroundSettings>) => {
    updateModalSettings(set, (current) => ({
      ...current,
      sceneBackground: normalizeSceneBackground({
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
      readonly settings: Partial<PointCloudColorSettings>;
    },
  ) => {
    const normalizedStream = stream.trim();
    if (!normalizedStream) return;

    // Merge over the value visible in the current scope.
    const previous =
      resolveStreamKeyedMap(get, "pointCloudColors")[normalizedStream] ??
      DEFAULT_POINT_CLOUD_COLOR;
    updateStreamKeyedSettings(get, set, "pointCloudColors", (colors) => ({
      ...colors,
      [normalizedStream]: normalizePointCloudColor({
        ...previous,
        ...settings,
      }),
    }));
  },
);

const pointCloudPointSizeAtom = atom(
  (get) => get(modalSettingsAtom).pointCloudPointSize,
  (_get, set, pointSize: number) => {
    updateModalSettings(set, (current) => ({
      ...current,
      pointCloudPointSize: normalizePointCloudPointSize(pointSize),
    }));
  },
);

const showPointCloudColorLegendAtom = atom(
  (get) => get(modalSettingsAtom).showPointCloudColorLegend,
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
    const normalizedLabelStreams = normalizeStreamList(labelStreams);

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
      readonly settings: Partial<ImageProjectionSettings>;
    },
  ) => {
    const normalizedImageStream = imageStream.trim();
    if (!normalizedImageStream) return;

    // Merge over the value visible in the current scope.
    const previous =
      resolveStreamKeyedMap(get, "imageProjection")[normalizedImageStream] ??
      DEFAULT_IMAGE_PROJECTION;
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
      [normalizedImageStream]: normalizeImageProjection({
        ...previous,
        ...settings,
        streams,
      }),
    }));
  },
);

function updateModalSettings(
  set: Setter,
  resolver: (current: PersistedModalSettings) => PersistedModalSettings,
): void {
  set(modalSettingsAtom, (current) => {
    const next = resolver(current);
    if (next === current) {
      return current;
    }
    writeModalSettings(next);
    return next;
  });
}

/**
 * Scopes stream-keyed styling (point-cloud colors, image projection, label
 * streams) to the mounted playback host's dataset. Reads and writes stay under
 * the scope. Call once from the playback host; an empty/undefined scope key
 * leaves settings unscoped.
 */
export function useModalSettingsScopeSync(
  scopeKey: string | null | undefined,
): void {
  // This effect binds the settings scope to the active dataset for this
  // host's mounted lifetime, and releases only its own scope on unmount so
  // an interleaved mount of another host is never reset.
  useEffect(() => {
    const scope = scopeKey?.trim() ?? "";
    if (!scope) return undefined;
    modalSettingsStore.set(settingsScopeAtom, scope);
    return () => {
      modalSettingsStore.set(settingsScopeAtom, (current) =>
        current === scope ? "" : current,
      );
    };
  }, [scopeKey]);
}

/**
 * Reads and updates camera frustum display preferences.
 */
export function usePinholeCameraSettings() {
  const pinholeCamera = useAtomValue(pinholeCameraAtom, {
    store: modalSettingsStore,
  });
  const setPinholeCamera = useSetAtom(pinholeCameraAtom, {
    store: modalSettingsStore,
  });

  return useMemo(
    () => ({ pinholeCamera, setPinholeCamera }),
    [pinholeCamera, setPinholeCamera],
  );
}

/**
 * Reads and updates 3D reference grid preferences.
 */
export function useReferenceGridSettings() {
  const referenceGrid = useAtomValue(referenceGridAtom, {
    store: modalSettingsStore,
  });
  const setReferenceGrid = useSetAtom(referenceGridAtom, {
    store: modalSettingsStore,
  });

  return useMemo(
    () => ({ referenceGrid, setReferenceGrid }),
    [referenceGrid, setReferenceGrid],
  );
}

/**
 * Reads and updates 3D scene background preferences.
 */
export function useSceneBackgroundSettings() {
  const sceneBackground = useAtomValue(sceneBackgroundAtom, {
    store: modalSettingsStore,
  });
  const setSceneBackground = useSetAtom(sceneBackgroundAtom, {
    store: modalSettingsStore,
  });

  return useMemo(
    () => ({ sceneBackground, setSceneBackground }),
    [sceneBackground, setSceneBackground],
  );
}

/**
 * Reads and updates point-cloud style preferences.
 */
export function usePointCloudStyleSettings() {
  const pointCloudColors = useAtomValue(pointCloudColorsAtom, {
    store: modalSettingsStore,
  });
  const pointCloudPointSize = useAtomValue(pointCloudPointSizeAtom, {
    store: modalSettingsStore,
  });
  const showPointCloudColorLegend = useAtomValue(
    showPointCloudColorLegendAtom,
    {
      store: modalSettingsStore,
    },
  );
  const setPointCloudColor = useSetAtom(pointCloudColorsAtom, {
    store: modalSettingsStore,
  });
  const setPointCloudPointSize = useSetAtom(pointCloudPointSizeAtom, {
    store: modalSettingsStore,
  });
  const setShowPointCloudColorLegend = useSetAtom(
    showPointCloudColorLegendAtom,
    {
      store: modalSettingsStore,
    },
  );

  const updatePointCloudColor = useCallback(
    (stream: string, settings: Partial<PointCloudColorSettings>) => {
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
export function useImageLabelStreams(imageStream: string | null | undefined) {
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
    store: modalSettingsStore,
  });
  const hasExplicitLabelStreams = useAtomValue(hasExplicitLabelStreamsAtom, {
    store: modalSettingsStore,
  });
  const setStoredImageLabelStreams = useSetAtom(imageLabelStreamsAtom, {
    store: modalSettingsStore,
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
export function useImageProjection(imageStream: string | null | undefined) {
  const normalizedImageStream = imageStream?.trim() ?? "";
  const projectionValueAtom = useMemo(
    () =>
      atom((get) =>
        normalizedImageStream
          ? (get(imageProjectionAtom)[normalizedImageStream] ??
            DEFAULT_IMAGE_PROJECTION)
          : DEFAULT_IMAGE_PROJECTION,
      ),
    [normalizedImageStream],
  );
  const projection = useAtomValue(projectionValueAtom, {
    store: modalSettingsStore,
  });
  const setStoredProjection = useSetAtom(imageProjectionAtom, {
    store: modalSettingsStore,
  });
  const setProjection = useCallback(
    (settings: Partial<ImageProjectionSettings>) => {
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
export function useImageProjectionSettingsByStream(): Readonly<
  Record<string, ImageProjectionSettings>
> {
  return useAtomValue(imageProjectionAtom, {
    store: modalSettingsStore,
  });
}

/** Updates camera geometry settings for an image without requiring its tile. */
export function useSetImageProjection() {
  const setStoredProjection = useSetAtom(imageProjectionAtom, {
    store: modalSettingsStore,
  });
  return useCallback(
    (imageStream: string, settings: Partial<ImageProjectionSettings>) =>
      setStoredProjection({ imageStream, settings }),
    [setStoredProjection],
  );
}

/**
 * Resyncs the private settings store from localStorage for isolated tests.
 */
export function __resetModalSettingsForTests(): void {
  modalSettingsStore.set(modalSettingsAtom, readModalSettings());
  modalSettingsStore.set(settingsScopeAtom, "");
}
