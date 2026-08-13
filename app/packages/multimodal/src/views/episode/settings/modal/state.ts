import {
  atom,
  createStore,
  useAtomValue,
  useSetAtom,
  type Setter,
} from "jotai";
import { useCallback, useMemo } from "react";

import {
  DEFAULT_IMAGE_PROJECTION,
  DEFAULT_POINT_CLOUD_COLOR,
  normalizeImageProjection,
  normalizePinholeCamera,
  normalizePointCloudColor,
  normalizePointCloudPointSize,
  normalizeReferenceGrid,
  normalizeSceneBackground,
  normalizeStreamList,
  persistModalSettingsUpdate,
  readModalSettings,
  type ImageProjectionSettings,
  type PersistedModalSettings,
  type PinholeCameraSettings,
  type PersistedPointCloudColorSettings,
  type ReferenceGridSettings,
  type SceneBackgroundSettings,
} from "./storage";
import type { ScopedModalSettings } from "./storage";
import {
  usePanelVisibilityScope,
  useSidebarPreferencesState,
  useSidebarSourceIdentity,
} from "../sidebar-preferences-context";
import type { PersistedSemanticImageProjection } from "../sidebar-preferences";
import type { SemanticSourceKey } from "../semantic-source";
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
  resolvePointCloudColorOptions,
  readModalSettings,
  writeModalSettings,
  type ImageProjectionSettings,
  type PersistedModalSettings,
  type PinholeCameraSettings,
  type PointCloudColorSource,
  type PersistedPointCloudColorSettings,
  type ReferenceGridSettings,
  type SceneBackgroundMode,
  type SceneBackgroundSettings,
} from "./storage";

const EMPTY_STREAM_LIST: readonly string[] = Object.freeze([]);

const modalSettingsStore = createStore();
const modalSettingsAtom = atom<PersistedModalSettings>(readModalSettings());

/** Legacy unscoped atoms remain only for isolated renderers/tests. */
function updateUnscopedMap<Key extends keyof ScopedModalSettings>(
  set: Setter,
  key: Key,
  updateMap: (current: ScopedModalSettings[Key]) => ScopedModalSettings[Key],
): void {
  updateModalSettings(set, (current) => ({
    ...current,
    [key]: updateMap(current[key]),
  }));
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
  (get) => get(modalSettingsAtom).pointCloudColors,
  (
    get,
    set,
    {
      stream,
      settings,
    }: {
      readonly stream: string;
      readonly settings: Partial<PersistedPointCloudColorSettings>;
    },
  ) => {
    const normalizedStream = stream.trim();
    if (!normalizedStream) return;

    // Merge over the value visible in the current scope.
    const previous =
      get(modalSettingsAtom).pointCloudColors[normalizedStream] ??
      DEFAULT_POINT_CLOUD_COLOR;
    updateUnscopedMap(set, "pointCloudColors", (colors) => ({
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
  (get) => get(modalSettingsAtom).imageLabelStreams,
  (
    _get,
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

    updateUnscopedMap(set, "imageLabelStreams", (streams) => ({
      ...streams,
      [normalizedImageStream]: normalizedLabelStreams,
    }));
  },
);

const imageProjectionAtom = atom(
  (get) => get(modalSettingsAtom).imageProjection,
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
      get(modalSettingsAtom).imageProjection[normalizedImageStream] ??
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
    updateUnscopedMap(set, "imageProjection", (projections) => ({
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
  touchedScope?: string,
): void {
  set(modalSettingsAtom, (current) => {
    const next = resolver(current);
    if (next === current) {
      return current;
    }
    return persistModalSettingsUpdate(next, touchedScope);
  });
}

/**
 * Reads and updates camera frustum display preferences.
 */
export function usePinholeCameraSettings() {
  const legacyPinholeCamera = useAtomValue(pinholeCameraAtom, {
    store: modalSettingsStore,
  });
  const setLegacyPinholeCamera = useSetAtom(pinholeCameraAtom, {
    store: modalSettingsStore,
  });
  const scope = usePanelVisibilityScope();
  const [preferences, updatePreferences] = useSidebarPreferencesState();
  const setPinholeCamera = useCallback(
    (settings: Partial<PinholeCameraSettings>) => {
      if (!scope) return setLegacyPinholeCamera(settings);
      updatePreferences((current) => ({
        ...current,
        appearance: {
          ...current.appearance,
          pinholeCamera: normalizePinholeCamera({
            ...current.appearance.pinholeCamera,
            ...settings,
          }),
        },
      }));
    },
    [scope, setLegacyPinholeCamera, updatePreferences],
  );
  const pinholeCamera = scope
    ? preferences.appearance.pinholeCamera
    : legacyPinholeCamera;

  return useMemo(
    () => ({ pinholeCamera, setPinholeCamera }),
    [pinholeCamera, setPinholeCamera],
  );
}

/**
 * Reads and updates 3D reference grid preferences.
 */
export function useReferenceGridSettings() {
  const legacyReferenceGrid = useAtomValue(referenceGridAtom, {
    store: modalSettingsStore,
  });
  const setLegacyReferenceGrid = useSetAtom(referenceGridAtom, {
    store: modalSettingsStore,
  });
  const scope = usePanelVisibilityScope();
  const [preferences, updatePreferences] = useSidebarPreferencesState();
  const setReferenceGrid = useCallback(
    (settings: Partial<ReferenceGridSettings>) => {
      if (!scope) return setLegacyReferenceGrid(settings);
      updatePreferences((current) => ({
        ...current,
        appearance: {
          ...current.appearance,
          referenceGrid: normalizeReferenceGrid({
            ...current.appearance.referenceGrid,
            ...settings,
          }),
        },
      }));
    },
    [scope, setLegacyReferenceGrid, updatePreferences],
  );
  const referenceGrid = scope
    ? preferences.appearance.referenceGrid
    : legacyReferenceGrid;

  return useMemo(
    () => ({ referenceGrid, setReferenceGrid }),
    [referenceGrid, setReferenceGrid],
  );
}

/**
 * Reads and updates 3D scene background preferences.
 */
export function useSceneBackgroundSettings() {
  const legacySceneBackground = useAtomValue(sceneBackgroundAtom, {
    store: modalSettingsStore,
  });
  const setLegacySceneBackground = useSetAtom(sceneBackgroundAtom, {
    store: modalSettingsStore,
  });
  const scope = usePanelVisibilityScope();
  const [preferences, updatePreferences] = useSidebarPreferencesState();
  const setSceneBackground = useCallback(
    (settings: Partial<SceneBackgroundSettings>) => {
      if (!scope) return setLegacySceneBackground(settings);
      updatePreferences((current) => ({
        ...current,
        appearance: {
          ...current.appearance,
          sceneBackground: normalizeSceneBackground({
            ...current.appearance.sceneBackground,
            ...settings,
          }),
        },
      }));
    },
    [scope, setLegacySceneBackground, updatePreferences],
  );
  const sceneBackground = scope
    ? preferences.appearance.sceneBackground
    : legacySceneBackground;

  return useMemo(
    () => ({ sceneBackground, setSceneBackground }),
    [sceneBackground, setSceneBackground],
  );
}

/**
 * Reads and updates point-cloud style preferences.
 */
export function usePointCloudStyleSettings() {
  const legacyPointCloudColors = useAtomValue(pointCloudColorsAtom, {
    store: modalSettingsStore,
  });
  const legacyPointCloudPointSize = useAtomValue(pointCloudPointSizeAtom, {
    store: modalSettingsStore,
  });
  const legacyShowPointCloudColorLegend = useAtomValue(
    showPointCloudColorLegendAtom,
    {
      store: modalSettingsStore,
    },
  );
  const setLegacyPointCloudColor = useSetAtom(pointCloudColorsAtom, {
    store: modalSettingsStore,
  });
  const setLegacyPointCloudPointSize = useSetAtom(pointCloudPointSizeAtom, {
    store: modalSettingsStore,
  });
  const setLegacyShowPointCloudColorLegend = useSetAtom(
    showPointCloudColorLegendAtom,
    {
      store: modalSettingsStore,
    },
  );

  const scope = usePanelVisibilityScope();
  const [preferences, updatePreferences] = useSidebarPreferencesState();
  const identity = useSidebarSourceIdentity();
  const scopedPointCloudColors = useMemo(() => {
    const result: Record<string, PersistedPointCloudColorSettings> = {};
    for (const [key, settings] of Object.entries(
      preferences.pointCloudColors,
    )) {
      for (const id of identity.runtimeIdsForKey(key as SemanticSourceKey)) {
        result[id] = settings;
      }
    }
    return result;
  }, [identity, preferences.pointCloudColors]);
  const updatePointCloudColor = useCallback(
    (stream: string, settings: Partial<PersistedPointCloudColorSettings>) => {
      if (!scope) return setLegacyPointCloudColor({ settings, stream });
      const key = identity.keyForRuntimeId(stream);
      if (!key) return;
      updatePreferences((current) => ({
        ...current,
        pointCloudColors: {
          ...current.pointCloudColors,
          [key]: normalizePointCloudColor({
            ...current.pointCloudColors[key],
            ...settings,
          }),
        },
      }));
    },
    [identity, scope, setLegacyPointCloudColor, updatePreferences],
  );
  const setPointCloudPointSize = useCallback(
    (pointSize: number) => {
      if (!scope) return setLegacyPointCloudPointSize(pointSize);
      updatePreferences((current) => ({
        ...current,
        appearance: {
          ...current.appearance,
          pointCloudPointSize: normalizePointCloudPointSize(pointSize),
        },
      }));
    },
    [scope, setLegacyPointCloudPointSize, updatePreferences],
  );
  const setShowPointCloudColorLegend = useCallback(
    (show: boolean) => {
      if (!scope) return setLegacyShowPointCloudColorLegend(show);
      updatePreferences((current) => ({
        ...current,
        appearance: {
          ...current.appearance,
          showPointCloudColorLegend: show,
        },
      }));
    },
    [scope, setLegacyShowPointCloudColorLegend, updatePreferences],
  );
  const pointCloudColors = scope
    ? scopedPointCloudColors
    : legacyPointCloudColors;
  const pointCloudPointSize = scope
    ? preferences.appearance.pointCloudPointSize
    : legacyPointCloudPointSize;
  const showPointCloudColorLegend = scope
    ? preferences.appearance.showPointCloudColorLegend
    : legacyShowPointCloudColorLegend;

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
  const legacyProjection = useAtomValue(projectionValueAtom, {
    store: modalSettingsStore,
  });
  const setStoredProjection = useSetAtom(imageProjectionAtom, {
    store: modalSettingsStore,
  });
  const { projections, setProjection: setScopedProjection } =
    useScopedImageProjections();
  const scope = usePanelVisibilityScope();
  const projection = normalizedImageStream
    ? (projections[normalizedImageStream] ?? legacyProjection)
    : DEFAULT_IMAGE_PROJECTION;
  const setProjection = useCallback(
    (settings: Partial<ImageProjectionSettings>) => {
      if (!normalizedImageStream) return;
      if (scope) return setScopedProjection(normalizedImageStream, settings);
      setStoredProjection({ imageStream: normalizedImageStream, settings });
    },
    [normalizedImageStream, scope, setScopedProjection, setStoredProjection],
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
  const legacy = useAtomValue(imageProjectionAtom, {
    store: modalSettingsStore,
  });
  const scope = usePanelVisibilityScope();
  const { projections } = useScopedImageProjections();
  return scope ? projections : legacy;
}

/** Updates camera geometry settings for an image without requiring its tile. */
export function useSetImageProjection() {
  const setStoredProjection = useSetAtom(imageProjectionAtom, {
    store: modalSettingsStore,
  });
  const scope = usePanelVisibilityScope();
  const { setProjection } = useScopedImageProjections();
  return useCallback(
    (imageStream: string, settings: Partial<ImageProjectionSettings>) => {
      if (scope) return setProjection(imageStream, settings);
      setStoredProjection({ imageStream, settings });
    },
    [scope, setProjection, setStoredProjection],
  );
}

function useScopedImageProjections(): {
  readonly projections: Readonly<Record<string, ImageProjectionSettings>>;
  readonly setProjection: (
    imageStream: string,
    settings: Partial<ImageProjectionSettings>,
  ) => void;
} {
  const [preferences, updatePreferences] = useSidebarPreferencesState();
  const identity = useSidebarSourceIdentity();
  const projections = useMemo(() => {
    const result: Record<string, ImageProjectionSettings> = {};
    for (const [imageKey, stored] of Object.entries(
      preferences.imageProjection,
    )) {
      const runtime = semanticImageProjectionToRuntime(
        stored,
        identity.runtimeIdsForKey,
      );
      for (const imageStream of identity.runtimeIdsForKey(
        imageKey as SemanticSourceKey,
      )) {
        result[imageStream] = runtime;
      }
    }
    return result;
  }, [identity, preferences.imageProjection]);
  const setProjection = useCallback(
    (imageStream: string, settings: Partial<ImageProjectionSettings>) => {
      const imageKey = identity.keyForRuntimeId(imageStream);
      if (!imageKey) return;
      updatePreferences((current) => {
        const previous = semanticImageProjectionToRuntime(
          current.imageProjection[imageKey] ?? semanticDefaultImageProjection(),
          identity.runtimeIdsForKey,
        );
        const nextRuntime = normalizeScopedImageProjectionUpdate(
          previous,
          settings,
        );
        return {
          ...current,
          imageProjection: {
            ...current.imageProjection,
            [imageKey]: runtimeImageProjectionToSemantic(
              nextRuntime,
              identity.keyForRuntimeId,
            ),
          },
        };
      });
    },
    [identity, updatePreferences],
  );
  return { projections, setProjection };
}

function normalizeScopedImageProjectionUpdate(
  previous: ImageProjectionSettings,
  settings: Partial<ImageProjectionSettings>,
): ImageProjectionSettings {
  let streams =
    settings.streams === undefined ? previous.streams : settings.streams;
  if (
    settings.enabled === true &&
    settings.streams === undefined &&
    !previous.enabled &&
    previous.streams !== null &&
    previous.streams.length === 0
  ) {
    streams = null;
  }
  const enabled =
    (settings.enabled ?? previous.enabled) &&
    (streams === null || streams.length > 0);
  return {
    ...normalizeImageProjection({ ...previous, ...settings, enabled, streams }),
    enabled,
    streams,
  };
}

function semanticImageProjectionToRuntime(
  projection: PersistedSemanticImageProjection,
  runtimeIdsForKey: (key: SemanticSourceKey) => readonly string[],
): ImageProjectionSettings {
  return {
    ...projection,
    calibrationStream: projection.calibrationStream
      ? (runtimeIdsForKey(projection.calibrationStream)[0] ?? null)
      : null,
    streams:
      projection.streams === null
        ? null
        : projection.streams.flatMap(runtimeIdsForKey),
  };
}

function runtimeImageProjectionToSemantic(
  projection: ImageProjectionSettings,
  keyForRuntimeId: (id: string) => SemanticSourceKey | null,
): PersistedSemanticImageProjection {
  return {
    ...projection,
    calibrationStream: projection.calibrationStream
      ? keyForRuntimeId(projection.calibrationStream)
      : null,
    streams:
      projection.streams === null
        ? null
        : projection.streams
            .map(keyForRuntimeId)
            .filter((key): key is NonNullable<typeof key> => key !== null),
  };
}

function semanticDefaultImageProjection(): PersistedSemanticImageProjection {
  return { ...DEFAULT_IMAGE_PROJECTION, calibrationStream: null, streams: [] };
}

/**
 * Resyncs the private settings store from localStorage for isolated tests.
 */
export function __resetModalSettingsForTests(): void {
  modalSettingsStore.set(modalSettingsAtom, readModalSettings());
}
