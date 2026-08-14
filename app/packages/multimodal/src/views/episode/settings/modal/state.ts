import { useCallback, useMemo } from "react";

import {
  DEFAULT_IMAGE_PROJECTION,
  normalizeImageProjection,
  normalizePinholeCamera,
  normalizePointCloudColor,
  normalizePointCloudPointSize,
  normalizeReferenceGrid,
  normalizeSceneBackground,
  type ImageProjectionSettings,
  type PinholeCameraSettings,
  type PersistedPointCloudColorSettings,
  type ReferenceGridSettings,
  type SceneBackgroundSettings,
} from "./storage";
import {
  useSidebarPreferencesState,
  useSidebarSourceIdentity,
} from "../sidebar-preferences-context";
import type { PersistedSemanticImageProjection } from "../sidebar-preferences";
import type { SemanticSourceKey } from "../semantic-source";
export type {
  ImageDisplayMode,
  ImageGeometryMode,
} from "../../spatial/camera-geometry/camera-model";

export {
  DEFAULT_IMAGE_PROJECTION,
  DEFAULT_PROJECTION_POINT_SIZE,
  DEFAULT_PINHOLE_CAMERA,
  DEFAULT_POINT_CLOUD_COLOR,
  DEFAULT_POINT_CLOUD_POINT_SIZE,
  DEFAULT_REFERENCE_GRID,
  DEFAULT_SCENE_BACKGROUND,
  MAX_POINT_CLOUD_POINT_SIZE,
  POINT_CLOUD_POINT_SIZE_STEP,
  MIN_POINT_CLOUD_POINT_SIZE,
  defaultPointCloudColorForIndex,
  defaultPointCloudColorForSource,
  resolvePointCloudColorOptions,
  type ImageProjectionSettings,
  type PinholeCameraSettings,
  type PointCloudColorSource,
  type PersistedPointCloudColorSettings,
  type ReferenceGridSettings,
  type SceneBackgroundMode,
  type SceneBackgroundSettings,
} from "./storage";

/**
 * Reads and updates camera frustum display preferences.
 */
export function usePinholeCameraSettings() {
  const [preferences, updatePreferences] = useSidebarPreferencesState();
  const setPinholeCamera = useCallback(
    (settings: Partial<PinholeCameraSettings>) => {
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
    [updatePreferences],
  );
  const pinholeCamera = preferences.appearance.pinholeCamera;

  return useMemo(
    () => ({ pinholeCamera, setPinholeCamera }),
    [pinholeCamera, setPinholeCamera],
  );
}

/**
 * Reads and updates 3D reference grid preferences.
 */
export function useReferenceGridSettings() {
  const [preferences, updatePreferences] = useSidebarPreferencesState();
  const setReferenceGrid = useCallback(
    (settings: Partial<ReferenceGridSettings>) => {
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
    [updatePreferences],
  );
  const referenceGrid = preferences.appearance.referenceGrid;

  return useMemo(
    () => ({ referenceGrid, setReferenceGrid }),
    [referenceGrid, setReferenceGrid],
  );
}

/**
 * Reads and updates 3D scene background preferences.
 */
export function useSceneBackgroundSettings() {
  const [preferences, updatePreferences] = useSidebarPreferencesState();
  const setSceneBackground = useCallback(
    (settings: Partial<SceneBackgroundSettings>) => {
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
    [updatePreferences],
  );
  const sceneBackground = preferences.appearance.sceneBackground;

  return useMemo(
    () => ({ sceneBackground, setSceneBackground }),
    [sceneBackground, setSceneBackground],
  );
}

/**
 * Reads and updates point-cloud style preferences.
 */
export function usePointCloudStyleSettings() {
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
    [identity, updatePreferences],
  );
  const setPointCloudPointSize = useCallback(
    (pointSize: number) => {
      updatePreferences((current) => ({
        ...current,
        appearance: {
          ...current.appearance,
          pointCloudPointSize: normalizePointCloudPointSize(pointSize),
        },
      }));
    },
    [updatePreferences],
  );
  const setShowPointCloudColorLegend = useCallback(
    (show: boolean) => {
      updatePreferences((current) => ({
        ...current,
        appearance: {
          ...current.appearance,
          showPointCloudColorLegend: show,
        },
      }));
    },
    [updatePreferences],
  );
  const pointCloudColors = scopedPointCloudColors;
  const pointCloudPointSize = preferences.appearance.pointCloudPointSize;
  const showPointCloudColorLegend =
    preferences.appearance.showPointCloudColorLegend;

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
 * Reads and updates the lidar projection overlay settings for one image
 * stream.
 */
export function useImageProjection(imageStream: string | null | undefined) {
  const normalizedImageStream = imageStream?.trim() ?? "";
  const { projections, setProjection: setStoredProjection } =
    useImageProjections();
  const projection = normalizedImageStream
    ? (projections[normalizedImageStream] ?? DEFAULT_IMAGE_PROJECTION)
    : DEFAULT_IMAGE_PROJECTION;
  const setProjection = useCallback(
    (settings: Partial<ImageProjectionSettings>) => {
      if (!normalizedImageStream) return;
      setStoredProjection(normalizedImageStream, settings);
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
  return useImageProjections().projections;
}

/** Updates camera geometry settings for an image without requiring its tile. */
export function useSetImageProjection() {
  return useImageProjections().setProjection;
}

function useImageProjections(): {
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
