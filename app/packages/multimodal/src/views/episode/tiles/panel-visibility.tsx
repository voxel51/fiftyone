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
  DEFAULT_PROJECTION_POINT_SIZE,
  normalizePointSize,
} from "../presentation/point-size-policy";

/** Persisted source visibility for one episode 3D tile. */
export interface Scene3dTileVisibility {
  readonly enabledSourceIds: readonly string[];
  /** `null` records that the user deliberately left no primary geometry. */
  readonly primarySourceId: string | null;
}

type ImageLabelStreamsByImage = Readonly<Record<string, readonly string[]>>;

/** 3D-label overlay preferences owned by one image tile. */
export interface ImageTile3dLabelProjection {
  readonly enabled: boolean;
  /** Explicit scene-annotation streams to project; null projects every one. */
  readonly streams: readonly string[] | null;
}

type Image3dLabelProjectionsByImage = Readonly<
  Record<string, ImageTile3dLabelProjection>
>;

/** Point-cloud overlay preferences owned by one image tile. */
export interface ImageTilePointCloudProjection {
  readonly enabled: boolean;
  readonly pointSize: number;
  /** Explicit cloud streams to project; null projects every cloud. */
  readonly streams: readonly string[] | null;
}

type ImagePointCloudProjectionsByImage = Readonly<
  Record<string, ImageTilePointCloudProjection>
>;

interface PersistedTileVisibility {
  readonly imageLabelStreams?: ImageLabelStreamsByImage;
  readonly threeD?: Scene3dTileVisibility;
}

interface SessionTileProjections {
  readonly image3dLabelProjections?: Image3dLabelProjectionsByImage;
  readonly imagePointCloudProjections?: ImagePointCloudProjectionsByImage;
}

interface PersistedVisibilityScope {
  readonly tiles: Readonly<Record<string, PersistedTileVisibility>>;
  readonly updatedAtMs: number;
}

interface PersistedVisibilityStore {
  readonly byScope: Readonly<Record<string, PersistedVisibilityScope>>;
  readonly version: typeof STORAGE_VERSION;
}

interface SessionProjectionScope {
  readonly tiles: Readonly<Record<string, SessionTileProjections>>;
  readonly updatedAtMs: number;
}

interface SessionProjectionStore {
  readonly byScope: Readonly<Record<string, SessionProjectionScope>>;
  readonly version: typeof PROJECTION_STORAGE_VERSION;
}

const PanelVisibilityScopeContext = createContext<string | null>(null);

const STORAGE_KEY = "fiftyone.episode.panel-visibility.v2";
const STORAGE_VERSION = 2;
const PROJECTION_STORAGE_KEY = "fiftyone.episode.projections.v1";
const PROJECTION_STORAGE_VERSION = 1;
const MAX_SCOPES = 20;
const MAX_TILES_PER_SCOPE = 64;
const MAX_STREAMS_PER_TILE = 128;
const MAX_STREAM_LENGTH = 512;
const MAX_SCOPE_LENGTH = 1024;
const MAX_TILE_ID_LENGTH = 256;

let cachedStorageValue: string | null | undefined;
let cachedStore: PersistedVisibilityStore | null = null;
let cachedProjectionStorageValue: string | null | undefined;
let cachedProjectionStore: SessionProjectionStore | null = null;

const DEFAULT_IMAGE_POINT_CLOUD_PROJECTION: ImageTilePointCloudProjection =
  Object.freeze({
    enabled: false,
    pointSize: DEFAULT_PROJECTION_POINT_SIZE,
    streams: [],
  });
const DEFAULT_IMAGE_3D_LABEL_PROJECTION: ImageTile3dLabelProjection =
  Object.freeze({
    enabled: false,
    streams: [],
  });
const EMPTY_IMAGE_LABEL_STREAMS: readonly string[] = Object.freeze([]);

/**
 * Scopes panel visibility to one dataset/source and media field. The scope is
 * deliberately separate from browser-wide visual styling: stream names and
 * panel intent are meaningful only within the recording family that owns
 * them.
 */
export const PanelVisibilityProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly scopeKey?: string;
}> = ({ children, scopeKey }) => (
  <PanelVisibilityScopeContext.Provider value={scopeKey?.trim() || null}>
    {children}
  </PanelVisibilityScopeContext.Provider>
);

/** Returns the recording-specific scope used for panel visibility. */
export function usePanelVisibilityScope(): string | null {
  return useContext(PanelVisibilityScopeContext);
}

/** Reads one 3D tile's durable visibility before it creates stream demand. */
export function readScene3dTileVisibility(
  scopeKey: string | null,
  tileId: string | null,
): Scene3dTileVisibility | null {
  return readTileVisibility(scopeKey, tileId)?.threeD ?? null;
}

/** Writes one 3D tile's visibility without disturbing its image settings. */
export function writeScene3dTileVisibility(
  scopeKey: string | null,
  tileId: string | null,
  visibility: Scene3dTileVisibility,
): void {
  writeTileVisibility(scopeKey, tileId, { threeD: visibility });
}

/**
 * Per-image-panel label visibility. A missing entry and an explicit empty
 * entry both render no labels; retaining the empty entry remembers an
 * intentional "all off" choice when label streams later change.
 */
export function useImageTileLabelStreams(imageStream: string): {
  readonly labelStreams: readonly string[];
  readonly setLabelStreams: (streams: readonly string[]) => void;
} {
  const scopeKey = usePanelVisibilityScope();
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
    labelStreams: imageStream
      ? (streamsByImage[imageStream] ?? EMPTY_IMAGE_LABEL_STREAMS)
      : EMPTY_IMAGE_LABEL_STREAMS,
    setLabelStreams,
  };
}

/**
 * Per-image-panel 3D-label projection state. Projections are opt-in and the
 * explicit choices remain scoped to this image tile for this browser session.
 */
export function useImageTile3dLabelProjection(imageStream: string): {
  readonly projection: ImageTile3dLabelProjection;
  readonly setProjection: (
    settings: Partial<ImageTile3dLabelProjection>,
  ) => void;
} {
  const scopeKey = usePanelVisibilityScope();
  const tileId = useTileId();
  const [projectionsByImage, setProjectionsByImage] =
    useState<Image3dLabelProjectionsByImage>(
      () =>
        readTileProjections(scopeKey, tileId)?.image3dLabelProjections ?? {},
    );
  const projectionsByImageRef = useRef(projectionsByImage);
  projectionsByImageRef.current = projectionsByImage;

  // This layout effect handles an in-place scope/tile swap before paint.
  useLayoutEffect(() => {
    const next =
      readTileProjections(scopeKey, tileId)?.image3dLabelProjections ?? {};
    projectionsByImageRef.current = next;
    setProjectionsByImage(next);
  }, [scopeKey, tileId]);

  const setProjection = useCallback(
    (settings: Partial<ImageTile3dLabelProjection>) => {
      if (!imageStream) return;
      const previous =
        projectionsByImageRef.current[imageStream] ??
        DEFAULT_IMAGE_3D_LABEL_PROJECTION;
      const projection = normalizeImage3dLabelProjectionUpdate(
        previous,
        settings,
      );
      const next = {
        ...projectionsByImageRef.current,
        [imageStream]: projection,
      };
      projectionsByImageRef.current = next;
      setProjectionsByImage(next);
      writeTileProjections(scopeKey, tileId, {
        image3dLabelProjections: next,
      });
    },
    [imageStream, scopeKey, tileId],
  );

  return {
    projection: imageStream
      ? (projectionsByImage[imageStream] ?? DEFAULT_IMAGE_3D_LABEL_PROJECTION)
      : DEFAULT_IMAGE_3D_LABEL_PROJECTION,
    setProjection,
  };
}

/**
 * Per-image-panel point-cloud overlay state. Camera calibration and geometry
 * remain source-scoped because 3D frustums consume them; overlay visibility,
 * stream selection, and point size belong to the individual image tile for
 * this browser session.
 */
export function useImageTilePointCloudProjection(imageStream: string): {
  readonly projection: ImageTilePointCloudProjection;
  readonly setProjection: (
    settings: Partial<ImageTilePointCloudProjection>,
  ) => void;
} {
  const scopeKey = usePanelVisibilityScope();
  const tileId = useTileId();
  const [projectionsByImage, setProjectionsByImage] =
    useState<ImagePointCloudProjectionsByImage>(
      () =>
        readTileProjections(scopeKey, tileId)?.imagePointCloudProjections ?? {},
    );
  const projectionsByImageRef = useRef(projectionsByImage);
  projectionsByImageRef.current = projectionsByImage;

  // This layout effect handles an in-place scope/tile swap before paint.
  useLayoutEffect(() => {
    const next =
      readTileProjections(scopeKey, tileId)?.imagePointCloudProjections ?? {};
    projectionsByImageRef.current = next;
    setProjectionsByImage(next);
  }, [scopeKey, tileId]);

  const setProjection = useCallback(
    (settings: Partial<ImageTilePointCloudProjection>) => {
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
      writeTileProjections(scopeKey, tileId, {
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
): PersistedTileVisibility | null {
  if (!scopeKey || !tileId) return null;
  return readStore()?.byScope[scopeKey]?.tiles[tileId] ?? null;
}

function writeTileVisibility(
  scopeKey: string | null,
  tileId: string | null,
  patch: Partial<PersistedTileVisibility>,
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
    const next: PersistedVisibilityStore = {
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

function readStore(): PersistedVisibilityStore | null {
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

function readTileProjections(
  scopeKey: string | null,
  tileId: string | null,
): SessionTileProjections | null {
  if (!scopeKey || !tileId) return null;
  return readProjectionStore()?.byScope[scopeKey]?.tiles[tileId] ?? null;
}

function writeTileProjections(
  scopeKey: string | null,
  tileId: string | null,
  patch: Partial<SessionTileProjections>,
): void {
  if (!isBoundedString(scopeKey, MAX_SCOPE_LENGTH)) return;
  if (!isBoundedString(tileId, MAX_TILE_ID_LENGTH)) return;

  try {
    const storage = globalThis.sessionStorage;
    if (!storage) return;
    const current = readProjectionStore();
    const byScope = { ...current?.byScope };
    const currentScope = byScope[scopeKey];
    const tiles = { ...currentScope?.tiles };
    tiles[tileId] = { ...tiles[tileId], ...patch };
    byScope[scopeKey] = { tiles, updatedAtMs: Date.now() };
    evictOldestScopes(byScope);
    const next: SessionProjectionStore = {
      byScope,
      version: PROJECTION_STORAGE_VERSION,
    };
    const serialized = JSON.stringify(next);
    storage.setItem(PROJECTION_STORAGE_KEY, serialized);
    cachedProjectionStorageValue = serialized;
    cachedProjectionStore = next;
  } catch {
    // Projection persistence is best-effort and must never block playback.
  }
}

function readProjectionStore(): SessionProjectionStore | null {
  try {
    const storage = globalThis.sessionStorage;
    const raw = storage?.getItem(PROJECTION_STORAGE_KEY);
    if (raw === cachedProjectionStorageValue) return cachedProjectionStore;
    cachedProjectionStorageValue = raw ?? null;
    cachedProjectionStore = null;
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (candidate.version !== PROJECTION_STORAGE_VERSION) return null;
    const byScope = sanitizeProjectionScopes(candidate.byScope);
    cachedProjectionStore = {
      byScope,
      version: PROJECTION_STORAGE_VERSION,
    };
    return cachedProjectionStore;
  } catch {
    cachedProjectionStore = null;
    return null;
  }
}

function sanitizeScopes(
  raw: unknown,
): Record<string, PersistedVisibilityScope> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, PersistedVisibilityScope> = {};
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

function sanitizeProjectionScopes(
  raw: unknown,
): Record<string, SessionProjectionScope> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, SessionProjectionScope> = {};
  for (const [scopeKey, rawScope] of Object.entries(raw)) {
    if (Object.keys(result).length >= MAX_SCOPES) break;
    if (!isBoundedString(scopeKey, MAX_SCOPE_LENGTH)) continue;
    if (typeof rawScope !== "object" || rawScope === null) continue;
    const scope = rawScope as Record<string, unknown>;
    const tiles = sanitizeProjectionTiles(scope.tiles);
    const updatedAtMs =
      typeof scope.updatedAtMs === "number" &&
      Number.isFinite(scope.updatedAtMs)
        ? scope.updatedAtMs
        : 0;
    result[scopeKey] = { tiles, updatedAtMs };
  }
  return result;
}

function sanitizeTiles(raw: unknown): Record<string, PersistedTileVisibility> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, PersistedTileVisibility> = {};
  for (const [tileId, rawTile] of Object.entries(raw)) {
    if (Object.keys(result).length >= MAX_TILES_PER_SCOPE) break;
    if (!isBoundedString(tileId, MAX_TILE_ID_LENGTH)) continue;
    if (typeof rawTile !== "object" || rawTile === null) continue;
    const tile = rawTile as Record<string, unknown>;
    const threeD = sanitize3dVisibility(tile.threeD);
    const imageLabelStreams = sanitizeImageLabelStreams(tile.imageLabelStreams);
    if (threeD || imageLabelStreams) {
      result[tileId] = {
        ...(imageLabelStreams ? { imageLabelStreams } : {}),
        ...(threeD ? { threeD } : {}),
      };
    }
  }
  return result;
}

function sanitizeProjectionTiles(
  raw: unknown,
): Record<string, SessionTileProjections> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, SessionTileProjections> = {};
  for (const [tileId, rawTile] of Object.entries(raw)) {
    if (Object.keys(result).length >= MAX_TILES_PER_SCOPE) break;
    if (!isBoundedString(tileId, MAX_TILE_ID_LENGTH)) continue;
    if (typeof rawTile !== "object" || rawTile === null) continue;
    const tile = rawTile as Record<string, unknown>;
    const image3dLabelProjections = sanitizeImage3dLabelProjections(
      tile.image3dLabelProjections,
    );
    const imagePointCloudProjections = sanitizeImagePointCloudProjections(
      tile.imagePointCloudProjections,
    );
    if (image3dLabelProjections || imagePointCloudProjections) {
      result[tileId] = {
        ...(image3dLabelProjections ? { image3dLabelProjections } : {}),
        ...(imagePointCloudProjections ? { imagePointCloudProjections } : {}),
      };
    }
  }
  return result;
}

function sanitize3dVisibility(raw: unknown): Scene3dTileVisibility | null {
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

function sanitizeImage3dLabelProjections(
  raw: unknown,
): Record<string, ImageTile3dLabelProjection> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const result: Record<string, ImageTile3dLabelProjection> = {};
  for (const [imageStream, projection] of Object.entries(raw)) {
    if (Object.keys(result).length >= MAX_STREAMS_PER_TILE) break;
    if (!isBoundedString(imageStream, MAX_STREAM_LENGTH)) continue;
    result[imageStream] = normalizeImage3dLabelProjection(projection);
  }
  return result;
}

function sanitizeImagePointCloudProjections(
  raw: unknown,
): Record<string, ImageTilePointCloudProjection> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const result: Record<string, ImageTilePointCloudProjection> = {};
  for (const [imageStream, projection] of Object.entries(raw)) {
    if (Object.keys(result).length >= MAX_STREAMS_PER_TILE) break;
    if (!isBoundedString(imageStream, MAX_STREAM_LENGTH)) continue;
    result[imageStream] = normalizeImagePointCloudProjection(projection);
  }
  return result;
}

function normalizeImage3dLabelProjectionUpdate(
  previous: ImageTile3dLabelProjection,
  settings: Partial<ImageTile3dLabelProjection>,
): ImageTile3dLabelProjection {
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
  return normalizeImage3dLabelProjection({
    ...previous,
    ...settings,
    streams,
  });
}

function normalizeImage3dLabelProjection(
  raw: unknown,
): ImageTile3dLabelProjection {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return DEFAULT_IMAGE_3D_LABEL_PROJECTION;
  }
  const candidate = raw as Partial<ImageTile3dLabelProjection>;
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
    streams: enabled ? streams : [],
  };
}

function normalizeImagePointCloudProjectionUpdate(
  previous: ImageTilePointCloudProjection,
  settings: Partial<ImageTilePointCloudProjection>,
): ImageTilePointCloudProjection {
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
): ImageTilePointCloudProjection {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return DEFAULT_IMAGE_POINT_CLOUD_PROJECTION;
  }
  const candidate = raw as Partial<ImageTilePointCloudProjection>;
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
    pointSize: normalizePointSize(
      candidate.pointSize,
      DEFAULT_PROJECTION_POINT_SIZE,
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

function evictOldestScopes<T extends { readonly updatedAtMs: number }>(
  byScope: Record<string, T>,
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
