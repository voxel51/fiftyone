import { useTileId } from "@fiftyone/tiling";
import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_EPISODE_PROJECTION_POINT_SIZE,
  normalizeEpisodePointSize,
} from "./episode-point-size";

/** Persisted source visibility for one episode 3D tile. */
export interface Episode3dTileVisibility {
  readonly enabledSourceIds: readonly string[];
  /** `null` records that the user deliberately left no primary geometry. */
  readonly primarySourceId: string | null;
}

type ImageLabelStreamsByImage = Readonly<Record<string, readonly string[]>>;

/** Point-cloud overlay preferences owned by one image tile. */
export interface EpisodeImageTilePointCloudProjection {
  readonly enabled: boolean;
  readonly pointSize: number;
  /** Explicit cloud streams to project; null projects every cloud. */
  readonly streams: readonly string[] | null;
}

type ImagePointCloudProjectionsByImage = Readonly<
  Record<string, EpisodeImageTilePointCloudProjection>
>;

interface EpisodePersistedTileVisibility {
  readonly imageLabelStreams?: ImageLabelStreamsByImage;
  readonly imagePointCloudProjections?: ImagePointCloudProjectionsByImage;
  readonly threeD?: Episode3dTileVisibility;
}

interface EpisodePersistedVisibilityScope {
  readonly tiles: Readonly<Record<string, EpisodePersistedTileVisibility>>;
  readonly updatedAtMs: number;
}

interface EpisodePersistedVisibilityStore {
  readonly byScope: Readonly<Record<string, EpisodePersistedVisibilityScope>>;
  readonly version: typeof STORAGE_VERSION;
}

const EpisodePanelVisibilityScopeContext = createContext<string | null>(null);

const STORAGE_KEY = "fiftyone.episode.panel-visibility.v2";
const STORAGE_VERSION = 2;
const MAX_SCOPES = 20;
const MAX_TILES_PER_SCOPE = 64;
const MAX_STREAMS_PER_TILE = 128;
const MAX_STREAM_LENGTH = 512;
const MAX_SCOPE_LENGTH = 1024;
const MAX_TILE_ID_LENGTH = 256;

let cachedStorageValue: string | null | undefined;
let cachedStore: EpisodePersistedVisibilityStore | null = null;

const DEFAULT_IMAGE_POINT_CLOUD_PROJECTION: EpisodeImageTilePointCloudProjection =
  Object.freeze({
    enabled: false,
    pointSize: DEFAULT_EPISODE_PROJECTION_POINT_SIZE,
    streams: [],
  });

/**
 * Scopes panel visibility to one dataset/source and media field. The scope is
 * deliberately separate from browser-wide visual styling: stream names and
 * panel intent are meaningful only within the recording family that owns
 * them.
 */
export const EpisodePanelVisibilityProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly scopeKey?: string;
}> = ({ children, scopeKey }) => (
  <EpisodePanelVisibilityScopeContext.Provider value={scopeKey?.trim() || null}>
    {children}
  </EpisodePanelVisibilityScopeContext.Provider>
);

/** Returns the recording-specific scope used for panel visibility. */
export function useEpisodePanelVisibilityScope(): string | null {
  return useContext(EpisodePanelVisibilityScopeContext);
}

/** Reads one 3D tile's durable visibility before it creates stream demand. */
export function readEpisode3dTileVisibility(
  scopeKey: string | null,
  tileId: string | null,
): Episode3dTileVisibility | null {
  return readTileVisibility(scopeKey, tileId)?.threeD ?? null;
}

/** Writes one 3D tile's visibility without disturbing its image settings. */
export function writeEpisode3dTileVisibility(
  scopeKey: string | null,
  tileId: string | null,
  visibility: Episode3dTileVisibility,
): void {
  writeTileVisibility(scopeKey, tileId, { threeD: visibility });
}

/**
 * Per-image-panel label visibility. A missing entry and an explicit empty
 * entry both render no labels; retaining the empty entry remembers an
 * intentional "all off" choice when label streams later change.
 */
export function useEpisodeImageTileLabelStreams(imageStream: string): {
  readonly labelStreams: readonly string[];
  readonly setLabelStreams: (streams: readonly string[]) => void;
} {
  const scopeKey = useEpisodePanelVisibilityScope();
  const tileId = useTileId();
  const [streamsByImage, setStreamsByImage] =
    useState<ImageLabelStreamsByImage>(
      () => readTileVisibility(scopeKey, tileId)?.imageLabelStreams ?? {},
    );
  const streamsByImageRef = useRef(streamsByImage);
  streamsByImageRef.current = streamsByImage;

  // This layout effect handles an in-place scope/tile swap before paint; the
  // playback shell normally remounts at a scope boundary.
  useLayoutEffect(() => {
    const next = readTileVisibility(scopeKey, tileId)?.imageLabelStreams ?? {};
    streamsByImageRef.current = next;
    setStreamsByImage(next);
  }, [scopeKey, tileId]);

  const setLabelStreams = useCallback(
    (streams: readonly string[]) => {
      if (!imageStream) return;
      const next = {
        ...streamsByImageRef.current,
        [imageStream]: sanitizeStreamList(streams),
      };
      streamsByImageRef.current = next;
      setStreamsByImage(next);
      writeTileVisibility(scopeKey, tileId, { imageLabelStreams: next });
    },
    [imageStream, scopeKey, tileId],
  );

  return {
    labelStreams: imageStream ? (streamsByImage[imageStream] ?? []) : [],
    setLabelStreams,
  };
}

/**
 * Per-image-panel point-cloud overlay state. Camera calibration and geometry
 * remain source-scoped because 3D frustums consume them; overlay visibility,
 * stream selection, and point size belong to the individual image tile.
 */
export function useEpisodeImageTilePointCloudProjection(imageStream: string): {
  readonly projection: EpisodeImageTilePointCloudProjection;
  readonly setProjection: (
    settings: Partial<EpisodeImageTilePointCloudProjection>,
  ) => void;
} {
  const scopeKey = useEpisodePanelVisibilityScope();
  const tileId = useTileId();
  const [projectionsByImage, setProjectionsByImage] =
    useState<ImagePointCloudProjectionsByImage>(
      () =>
        readTileVisibility(scopeKey, tileId)?.imagePointCloudProjections ?? {},
    );
  const projectionsByImageRef = useRef(projectionsByImage);
  projectionsByImageRef.current = projectionsByImage;

  // This layout effect handles an in-place scope/tile swap before paint.
  useLayoutEffect(() => {
    const next =
      readTileVisibility(scopeKey, tileId)?.imagePointCloudProjections ?? {};
    projectionsByImageRef.current = next;
    setProjectionsByImage(next);
  }, [scopeKey, tileId]);

  const setProjection = useCallback(
    (settings: Partial<EpisodeImageTilePointCloudProjection>) => {
      if (!imageStream) return;
      const previous =
        projectionsByImageRef.current[imageStream] ??
        DEFAULT_IMAGE_POINT_CLOUD_PROJECTION;
      const projection = normalizeImagePointCloudProjectionUpdate(
        previous,
        settings,
      );
      const next = {
        ...projectionsByImageRef.current,
        [imageStream]: projection,
      };
      projectionsByImageRef.current = next;
      setProjectionsByImage(next);
      writeTileVisibility(scopeKey, tileId, {
        imagePointCloudProjections: next,
      });
    },
    [imageStream, scopeKey, tileId],
  );

  return {
    projection: imageStream
      ? (projectionsByImage[imageStream] ??
        DEFAULT_IMAGE_POINT_CLOUD_PROJECTION)
      : DEFAULT_IMAGE_POINT_CLOUD_PROJECTION,
    setProjection,
  };
}

function readTileVisibility(
  scopeKey: string | null,
  tileId: string | null,
): EpisodePersistedTileVisibility | null {
  if (!scopeKey || !tileId) return null;
  return readStore()?.byScope[scopeKey]?.tiles[tileId] ?? null;
}

function writeTileVisibility(
  scopeKey: string | null,
  tileId: string | null,
  patch: Partial<EpisodePersistedTileVisibility>,
): void {
  if (!isBoundedString(scopeKey, MAX_SCOPE_LENGTH)) return;
  if (!isBoundedString(tileId, MAX_TILE_ID_LENGTH)) return;

  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    const current = readStore();
    const byScope = { ...current?.byScope };
    const currentScope = byScope[scopeKey];
    const tiles = { ...currentScope?.tiles };
    tiles[tileId] = { ...tiles[tileId], ...patch };
    byScope[scopeKey] = { tiles, updatedAtMs: Date.now() };
    evictOldestScopes(byScope);
    const next: EpisodePersistedVisibilityStore = {
      byScope,
      version: STORAGE_VERSION,
    };
    const serialized = JSON.stringify(next);
    storage.setItem(STORAGE_KEY, serialized);
    cachedStorageValue = serialized;
    cachedStore = next;
  } catch {
    // Visibility persistence is best-effort and must never block playback.
  }
}

function readStore(): EpisodePersistedVisibilityStore | null {
  try {
    const storage = globalThis.localStorage;
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw === cachedStorageValue) return cachedStore;
    cachedStorageValue = raw ?? null;
    cachedStore = null;
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (candidate.version !== STORAGE_VERSION) return null;
    const byScope = sanitizeScopes(candidate.byScope);
    cachedStore = { byScope, version: STORAGE_VERSION };
    return cachedStore;
  } catch {
    cachedStore = null;
    return null;
  }
}

function sanitizeScopes(
  raw: unknown,
): Record<string, EpisodePersistedVisibilityScope> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, EpisodePersistedVisibilityScope> = {};
  for (const [scopeKey, rawScope] of Object.entries(raw)) {
    if (Object.keys(result).length >= MAX_SCOPES) break;
    if (!isBoundedString(scopeKey, MAX_SCOPE_LENGTH)) continue;
    if (typeof rawScope !== "object" || rawScope === null) continue;
    const scope = rawScope as Record<string, unknown>;
    const tiles = sanitizeTiles(scope.tiles);
    const updatedAtMs =
      typeof scope.updatedAtMs === "number" &&
      Number.isFinite(scope.updatedAtMs)
        ? scope.updatedAtMs
        : 0;
    result[scopeKey] = { tiles, updatedAtMs };
  }
  return result;
}

function sanitizeTiles(
  raw: unknown,
): Record<string, EpisodePersistedTileVisibility> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, EpisodePersistedTileVisibility> = {};
  for (const [tileId, rawTile] of Object.entries(raw)) {
    if (Object.keys(result).length >= MAX_TILES_PER_SCOPE) break;
    if (!isBoundedString(tileId, MAX_TILE_ID_LENGTH)) continue;
    if (typeof rawTile !== "object" || rawTile === null) continue;
    const tile = rawTile as Record<string, unknown>;
    const threeD = sanitize3dVisibility(tile.threeD);
    const imageLabelStreams = sanitizeImageLabelStreams(tile.imageLabelStreams);
    const imagePointCloudProjections = sanitizeImagePointCloudProjections(
      tile.imagePointCloudProjections,
    );
    if (threeD || imageLabelStreams || imagePointCloudProjections) {
      result[tileId] = {
        ...(imageLabelStreams ? { imageLabelStreams } : {}),
        ...(imagePointCloudProjections ? { imagePointCloudProjections } : {}),
        ...(threeD ? { threeD } : {}),
      };
    }
  }
  return result;
}

function sanitize3dVisibility(raw: unknown): Episode3dTileVisibility | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  if (!Array.isArray(candidate.enabledSourceIds)) return null;
  const primarySourceId = candidate.primarySourceId;
  if (
    primarySourceId !== null &&
    !isBoundedString(primarySourceId, MAX_STREAM_LENGTH)
  ) {
    return null;
  }
  return {
    enabledSourceIds: sanitizeStreamList(candidate.enabledSourceIds),
    primarySourceId,
  };
}

function sanitizeImageLabelStreams(
  raw: unknown,
): Record<string, readonly string[]> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const result: Record<string, readonly string[]> = {};
  for (const [imageStream, labelStreams] of Object.entries(raw)) {
    if (Object.keys(result).length >= MAX_STREAMS_PER_TILE) break;
    if (!isBoundedString(imageStream, MAX_STREAM_LENGTH)) continue;
    if (!Array.isArray(labelStreams)) continue;
    result[imageStream] = sanitizeStreamList(labelStreams);
  }
  return result;
}

function sanitizeImagePointCloudProjections(
  raw: unknown,
): Record<string, EpisodeImageTilePointCloudProjection> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const result: Record<string, EpisodeImageTilePointCloudProjection> = {};
  for (const [imageStream, projection] of Object.entries(raw)) {
    if (Object.keys(result).length >= MAX_STREAMS_PER_TILE) break;
    if (!isBoundedString(imageStream, MAX_STREAM_LENGTH)) continue;
    result[imageStream] = normalizeImagePointCloudProjection(projection);
  }
  return result;
}

function normalizeImagePointCloudProjectionUpdate(
  previous: EpisodeImageTilePointCloudProjection,
  settings: Partial<EpisodeImageTilePointCloudProjection>,
): EpisodeImageTilePointCloudProjection {
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
  return normalizeImagePointCloudProjection({
    ...previous,
    ...settings,
    streams,
  });
}

function normalizeImagePointCloudProjection(
  raw: unknown,
): EpisodeImageTilePointCloudProjection {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return DEFAULT_IMAGE_POINT_CLOUD_PROJECTION;
  }
  const candidate = raw as Partial<EpisodeImageTilePointCloudProjection>;
  const rawStreams = candidate.streams;
  const streams =
    rawStreams === null
      ? null
      : Array.isArray(rawStreams)
        ? sanitizeStreamList(rawStreams)
        : [];
  const enabled =
    candidate.enabled === true && (streams === null || streams.length > 0);
  return {
    enabled,
    pointSize: normalizeEpisodePointSize(
      candidate.pointSize,
      DEFAULT_EPISODE_PROJECTION_POINT_SIZE,
    ),
    streams: enabled ? streams : [],
  };
}

function sanitizeStreamList(raw: readonly unknown[]): readonly string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const stream of raw) {
    if (result.length >= MAX_STREAMS_PER_TILE) break;
    if (!isBoundedString(stream, MAX_STREAM_LENGTH) || seen.has(stream))
      continue;
    seen.add(stream);
    result.push(stream);
  }
  return result;
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maxLength
  );
}

function evictOldestScopes(
  byScope: Record<string, EpisodePersistedVisibilityScope>,
): void {
  while (Object.keys(byScope).length > MAX_SCOPES) {
    let oldestKey: string | null = null;
    let oldestTimestamp = Number.POSITIVE_INFINITY;
    for (const [scopeKey, scope] of Object.entries(byScope)) {
      if (scope.updatedAtMs < oldestTimestamp) {
        oldestKey = scopeKey;
        oldestTimestamp = scope.updatedAtMs;
      }
    }
    if (!oldestKey) return;
    delete byScope[oldestKey];
  }
}
