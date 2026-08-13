import { useTileId } from "@fiftyone/tiling";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  DEFAULT_PROJECTION_POINT_SIZE,
  normalizePointSize,
} from "../presentation/point-size-policy";
import {
  DEFAULT_SIDEBAR_PREFERENCES,
  readSidebarPreferences,
  updateSidebarPreferences,
  type PersistedImage3dLabelProjection,
  type PersistedImagePointCloudProjection,
  type PersistedScene3dTilePreferences,
  type SidebarPreferences,
} from "../preferences";
import {
  resolveSemanticSourceKeys,
  semanticSourceKeysForRuntimeIds,
  type SemanticSourceIndex,
  type SemanticSourceKey,
} from "../preferences";
import {
  usePanelVisibilityScope,
  useSidebarPreferencesContext,
} from "../preferences";

export {
  SidebarPreferencesProvider as PanelVisibilityProvider,
  usePanelVisibilityScope,
  useSidebarPreferencesState,
  useSidebarSourceIdentity,
} from "../preferences";

/** Persisted semantic source visibility for one episode 3D tile. */
export type Scene3dTileVisibility = PersistedScene3dTilePreferences;

/** 3D-label overlay preferences owned by one image tile. */
export interface ImageTile3dLabelProjection {
  readonly enabled: boolean;
  readonly interpolate: boolean;
  /** Runtime streams; null projects every compatible semantic source. */
  readonly streams: readonly string[] | null;
}

/** Point-cloud overlay preferences owned by one image tile. */
export interface ImageTilePointCloudProjection {
  readonly enabled: boolean;
  readonly pointSize: number;
  /** Runtime streams; null projects every compatible semantic source. */
  readonly streams: readonly string[] | null;
}

const EMPTY_STREAMS: readonly string[] = Object.freeze([]);

/** Reads one 3D tile before it creates stream demand. */
export function readScene3dTileVisibility(
  scopeKey: string | null,
  tileId: string | null,
): Scene3dTileVisibility | null {
  if (!scopeKey || !tileId) return null;
  return readSidebarPreferences(scopeKey).tiles[tileId]?.threeD ?? null;
}

/** Writes semantic visibility without disturbing latent image preferences. */
export function writeScene3dTileVisibility(
  scopeKey: string | null,
  tileId: string | null,
  visibility: Scene3dTileVisibility,
): void {
  if (!scopeKey || !tileId) return;
  updateSidebarPreferences(scopeKey, (current) => ({
    ...current,
    tiles: {
      ...current.tiles,
      [tileId]: {
        ...current.tiles[tileId],
        threeD: { ...current.tiles[tileId]?.threeD, ...visibility },
      },
    },
  }));
}

/** Writes semantic pose-frame overrides without touching source visibility. */
export function writeScene3dTrajectoryFrameOverrides(
  scopeKey: string | null,
  tileId: string | null,
  trajectoryFrameOverrides: Readonly<Record<SemanticSourceKey, string>>,
): void {
  if (!scopeKey || !tileId) return;
  updateSidebarPreferences(scopeKey, (current) => {
    const threeD = current.tiles[tileId]?.threeD;
    if (!threeD) return current;
    return {
      ...current,
      tiles: {
        ...current.tiles,
        [tileId]: {
          ...current.tiles[tileId],
          threeD: { ...threeD, trajectoryFrameOverrides },
        },
      },
    };
  });
}

/** Per-image-panel 2D label visibility, persisted by semantic identities. */
export function useImageTileLabelStreams(imageStream: string): {
  readonly labelStreams: readonly string[];
  readonly setLabelStreams: (streams: readonly string[]) => void;
} {
  const tileId = useTileId();
  const context = useSidebarPreferencesContext();
  const imageKey = context?.index.keyByRuntimeId.get(imageStream) ?? null;
  const [keys, setKeys] = useTileImagePreference<readonly SemanticSourceKey[]>(
    tileId,
    imageKey,
    readImageLabelSourceKeys,
    patchImageLabelSourceKeys,
  );
  const labelStreams = useMemo(
    () =>
      context ? resolveSemanticSourceKeys(keys, context.index) : EMPTY_STREAMS,
    [context, keys],
  );
  return {
    labelStreams,
    setLabelStreams: useCallback(
      (streams: readonly string[]) => {
        if (!context) return;
        setKeys(semanticSourceKeysForRuntimeIds(streams, context.index));
      },
      [context, setKeys],
    ),
  };
}

/** Durable per-image-panel 3D-label projection state. */
export function useImageTile3dLabelProjection(imageStream: string): {
  readonly projection: ImageTile3dLabelProjection;
  readonly setProjection: (
    settings: Partial<ImageTile3dLabelProjection>,
  ) => void;
} {
  const tileId = useTileId();
  const context = useSidebarPreferencesContext();
  const imageKey = context?.index.keyByRuntimeId.get(imageStream) ?? null;
  const [stored, setStored] =
    useTileImagePreference<PersistedImage3dLabelProjection>(
      tileId,
      imageKey,
      readImage3dLabelProjection,
      patchImage3dLabelProjection,
    );
  const projection = useMemo(
    () => persisted3dLabelProjectionToRuntime(stored, context?.index),
    [context, stored],
  );
  const setProjection = useCallback(
    (settings: Partial<ImageTile3dLabelProjection>) => {
      if (!context) return;
      setStored(
        runtime3dLabelProjectionToPersisted(
          normalizeImage3dLabelProjectionUpdate(projection, settings),
          context.index,
        ),
      );
    },
    [context, projection, setStored],
  );
  return { projection, setProjection };
}

/** Durable per-image-panel point-cloud projection state. */
export function useImageTilePointCloudProjection(imageStream: string): {
  readonly projection: ImageTilePointCloudProjection;
  readonly setProjection: (
    settings: Partial<ImageTilePointCloudProjection>,
  ) => void;
} {
  const tileId = useTileId();
  const context = useSidebarPreferencesContext();
  const imageKey = context?.index.keyByRuntimeId.get(imageStream) ?? null;
  const [stored, setStored] =
    useTileImagePreference<PersistedImagePointCloudProjection>(
      tileId,
      imageKey,
      readImagePointCloudProjection,
      patchImagePointCloudProjection,
    );
  const projection = useMemo(
    () => persistedPointCloudProjectionToRuntime(stored, context?.index),
    [context, stored],
  );
  const setProjection = useCallback(
    (settings: Partial<ImageTilePointCloudProjection>) => {
      if (!context) return;
      setStored(
        runtimePointCloudProjectionToPersisted(
          normalizeImagePointCloudProjectionUpdate(projection, settings),
          context.index,
        ),
      );
    },
    [context, projection, setStored],
  );
  return { projection, setProjection };
}

function useTileImagePreference<Value>(
  tileId: string | null,
  imageKey: SemanticSourceKey | null,
  read: (
    tile: NonNullable<SidebarPreferences["tiles"][string]>,
    imageKey: SemanticSourceKey,
  ) => Value,
  patch: (
    tile: NonNullable<SidebarPreferences["tiles"][string]>,
    imageKey: SemanticSourceKey,
    value: Value,
  ) => NonNullable<SidebarPreferences["tiles"][string]>,
): readonly [Value, (value: Value) => void] {
  const scopeKey = usePanelVisibilityScope();
  const readCurrent = useCallback(() => {
    if (!scopeKey || !tileId || !imageKey) return null;
    return read(
      readSidebarPreferences(scopeKey).tiles[tileId] ?? EMPTY_TILE,
      imageKey,
    );
  }, [imageKey, read, scopeKey, tileId]);
  const [value, setValue] = useState<Value | null>(readCurrent);
  // This layout effect replaces tile-local state before a newly bound image
  // paints preferences from the previous semantic image source.
  useLayoutEffect(() => setValue(readCurrent()), [readCurrent]);
  const update = useCallback(
    (next: Value) => {
      if (!scopeKey || !tileId || !imageKey) return;
      setValue(next);
      updateSidebarPreferences(scopeKey, (current) => ({
        ...current,
        tiles: {
          ...current.tiles,
          [tileId]: patch(current.tiles[tileId] ?? EMPTY_TILE, imageKey, next),
        },
      }));
    },
    [imageKey, patch, scopeKey, tileId],
  );
  // All callers' readers provide a domain default for missing entries.
  return [value ?? read(EMPTY_TILE, imageKey ?? EMPTY_SEMANTIC_KEY), update];
}

const EMPTY_TILE = Object.freeze({});
const EMPTY_SEMANTIC_KEYS: readonly SemanticSourceKey[] = Object.freeze([]);
const EMPTY_SEMANTIC_KEY = '["unknown","unknown"]' as SemanticSourceKey;
const DEFAULT_PERSISTED_IMAGE_3D_LABEL_PROJECTION: PersistedImage3dLabelProjection =
  Object.freeze({ enabled: false, interpolate: false, streams: [] });
const DEFAULT_PERSISTED_IMAGE_POINT_CLOUD_PROJECTION: PersistedImagePointCloudProjection =
  Object.freeze({
    enabled: false,
    pointSize: DEFAULT_PROJECTION_POINT_SIZE,
    streams: [],
  });

function readImageLabelSourceKeys(
  tile: NonNullable<SidebarPreferences["tiles"][string]>,
  key: SemanticSourceKey,
): readonly SemanticSourceKey[] {
  return tile.imageLabelSourceKeys?.[key] ?? EMPTY_SEMANTIC_KEYS;
}

function patchImageLabelSourceKeys(
  tile: NonNullable<SidebarPreferences["tiles"][string]>,
  key: SemanticSourceKey,
  value: readonly SemanticSourceKey[],
): NonNullable<SidebarPreferences["tiles"][string]> {
  return {
    ...tile,
    imageLabelSourceKeys: { ...tile.imageLabelSourceKeys, [key]: value },
  };
}

function readImage3dLabelProjection(
  tile: NonNullable<SidebarPreferences["tiles"][string]>,
  key: SemanticSourceKey,
): PersistedImage3dLabelProjection {
  return (
    tile.image3dLabelProjections?.[key] ??
    DEFAULT_PERSISTED_IMAGE_3D_LABEL_PROJECTION
  );
}

function patchImage3dLabelProjection(
  tile: NonNullable<SidebarPreferences["tiles"][string]>,
  key: SemanticSourceKey,
  value: PersistedImage3dLabelProjection,
): NonNullable<SidebarPreferences["tiles"][string]> {
  return {
    ...tile,
    image3dLabelProjections: { ...tile.image3dLabelProjections, [key]: value },
  };
}

function readImagePointCloudProjection(
  tile: NonNullable<SidebarPreferences["tiles"][string]>,
  key: SemanticSourceKey,
): PersistedImagePointCloudProjection {
  return (
    tile.imagePointCloudProjections?.[key] ??
    DEFAULT_PERSISTED_IMAGE_POINT_CLOUD_PROJECTION
  );
}

function patchImagePointCloudProjection(
  tile: NonNullable<SidebarPreferences["tiles"][string]>,
  key: SemanticSourceKey,
  value: PersistedImagePointCloudProjection,
): NonNullable<SidebarPreferences["tiles"][string]> {
  return {
    ...tile,
    imagePointCloudProjections: {
      ...tile.imagePointCloudProjections,
      [key]: value,
    },
  };
}

function persisted3dLabelProjectionToRuntime(
  stored: PersistedImage3dLabelProjection,
  index: SemanticSourceIndex | undefined,
): ImageTile3dLabelProjection {
  return {
    ...stored,
    streams:
      stored.streams === null
        ? null
        : index
          ? resolveSemanticSourceKeys(stored.streams, index)
          : [],
  };
}

function runtime3dLabelProjectionToPersisted(
  projection: ImageTile3dLabelProjection,
  index: SemanticSourceIndex,
): PersistedImage3dLabelProjection {
  return {
    ...projection,
    streams:
      projection.streams === null
        ? null
        : semanticSourceKeysForRuntimeIds(projection.streams, index),
  };
}

function persistedPointCloudProjectionToRuntime(
  stored: PersistedImagePointCloudProjection,
  index: SemanticSourceIndex | undefined,
): ImageTilePointCloudProjection {
  return {
    ...stored,
    streams:
      stored.streams === null
        ? null
        : index
          ? resolveSemanticSourceKeys(stored.streams, index)
          : [],
  };
}

function runtimePointCloudProjectionToPersisted(
  projection: ImageTilePointCloudProjection,
  index: SemanticSourceIndex,
): PersistedImagePointCloudProjection {
  return {
    ...projection,
    streams:
      projection.streams === null
        ? null
        : semanticSourceKeysForRuntimeIds(projection.streams, index),
  };
}

function normalizeImage3dLabelProjectionUpdate(
  previous: ImageTile3dLabelProjection,
  settings: Partial<ImageTile3dLabelProjection>,
): ImageTile3dLabelProjection {
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
    (settings.enabled ?? previous.enabled)
      ? streams === null || streams.length > 0
      : false;
  return {
    enabled,
    interpolate: settings.interpolate ?? previous.interpolate,
    streams,
  };
}

function normalizeImagePointCloudProjectionUpdate(
  previous: ImageTilePointCloudProjection,
  settings: Partial<ImageTilePointCloudProjection>,
): ImageTilePointCloudProjection {
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
    (settings.enabled ?? previous.enabled)
      ? streams === null || streams.length > 0
      : false;
  return {
    enabled,
    pointSize: normalizePointSize(
      settings.pointSize ?? previous.pointSize,
      DEFAULT_PROJECTION_POINT_SIZE,
    ),
    streams,
  };
}

export { DEFAULT_SIDEBAR_PREFERENCES };
