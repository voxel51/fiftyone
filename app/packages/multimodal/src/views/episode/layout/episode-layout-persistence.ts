import type { MosaicNode } from "react-mosaic-component";
import {
  normalizeEpisode3dSceneUpAxis,
  type Episode3dSceneUpAxis,
} from "../scene/episode-3d-scene-up";
import type { Episode3dTrackingMode } from "../scene/episode-3d-camera";
import { LOG_LEVELS, type LogLevel } from "../../../ir";
import {
  DEFAULT_EPISODE_LOG_TILE_SETTINGS,
  type EpisodeLogTileSettings,
} from "../logs/episode-log-tile-state";
import {
  DEFAULT_EPISODE_MAP_TILE_SETTINGS,
  normalizeEpisodeMapBaseLayer,
  type EpisodeMapTileSettings,
} from "../map/episode-map-tile-state";
import { EPISODE_TILE_TYPE } from "../tiles/episode-tile-types";

/**
 * Persistence for the episode modal's chrome: sidebar visibility, sidebar
 * width, the mosaic tile arrangement, and the currently expanded tile.
 *
 * One localStorage key holding scoped entries plus a browser-wide fallback
 * for callers that do not provide a scope. Samples in a dataset are
 * typically different recordings with the same stream structure, so the
 * sample renderer scopes by dataset; the standalone episode explorer scopes by
 * source. A scoped read intentionally restores only that exact scope, so a
 * new dataset or new explorer episode starts from the built-in defaults.
 *
 * Restore is best-effort: anything unreadable or structurally invalid
 * falls back to the built-in defaults (see `use-episode-modal-layout`).
 */

/**
 * Per-scope persisted fields. Every field is optional — callers fall back to
 * built-in defaults per-field.
 */
export interface EpisodePersistedModalLayout {
  /** Tile id rendered expanded over the saved layout, when any. */
  expandedTileId?: string;
  leftSidebarOpen?: boolean;
  /** Mosaic tree whose leaves are tile ids (e.g. `image-default`). */
  layout?: MosaicNode<string> | null;
  /**
   * Enabled plot series per plot tile id. Series reference streams of
   * one dataset's recordings, so this field is dataset-scoped only —
   * it is never merged into (or read from) the browser-wide fallback.
   */
  plotSeries?: Record<string, readonly EpisodePersistedPlotSeries[]>;
  /**
   * Map tile stream visibility and follow/basemap preferences. Dataset-scoped:
   * stream names belong to one recording family.
   */
  mapSettings?: Record<string, EpisodePersistedMapSettings>;
  /**
   * Log console stream/level visibility and follow preference per log tile
   * id. Dataset-scoped: stream names belong to one recording family.
   */
  logSettings?: Record<string, EpisodePersistedLogSettings>;
  /**
   * Inspected stream per raw-message tile id. Streams belong to one
   * dataset's recordings, so this field is dataset-scoped only — like
   * `plotSeries`, never merged into the browser-wide fallback.
   */
  rawStreams?: Record<string, string>;
  /**
   * User-authored panel titles per tile id. Dataset-scoped only: names
   * are layout semantics for this recording family, not reusable fallback
   * chrome across unrelated stream sets.
   */
  tileTitles?: Record<string, string>;
  /**
   * World axis treated as up by the 3D episode scene. Dataset-scoped only:
   * coordinate conventions belong to the dataset, not the browser fallback.
   */
  sceneUpAxis?: Episode3dSceneUpAxis;
  /** Durable 3D conventions, isolated by selected media field. */
  cameraPreferences?: Record<string, EpisodePersistedCameraPreferences>;
  /** Left sidebar width in px; the shell clamps it on restore. */
  sidebarWidthPx?: number;
}

/** Durable 3D coordinate conventions for one dataset media field. */
export interface EpisodePersistedCameraPreferences {
  readonly defaultTrackingMode?: Episode3dTrackingMode;
  readonly preferredCameraTargetFrameId?: string;
  readonly preferredWorldFrameId?: string;
  readonly sceneUpAxis?: Episode3dSceneUpAxis;
}

/**
 * One persisted plot series: a stream's numeric field and the color the
 * user saw it in.
 */
export interface EpisodePersistedPlotSeries {
  readonly color: string;
  readonly fieldPath: string;
  readonly stream: string;
}

export type EpisodePersistedMapSettings = EpisodeMapTileSettings;

export type EpisodePersistedLogSettings = EpisodeLogTileSettings;

// Bound the persisted plot config so a corrupt or adversarial payload
// cannot balloon the localStorage entry parsed on every modal mount.
const MAX_PLOT_TILES = 32;
const MAX_PLOT_SERIES_PER_TILE = 64;
const MAX_RAW_TILES = 32;
const MAX_RAW_STREAM_LENGTH = 512;
const MAX_MAP_TILES = 16;
const MAX_LOG_TILES = 16;
const MAX_MAP_STREAMS_PER_TILE = 64;
const MAX_MAP_STREAM_LENGTH = 512;
const MAX_TILE_TITLES = 64;
const MAX_TILE_TITLE_LENGTH = 160;
const MAX_CAMERA_PREFERENCE_FIELDS = 16;
const MAX_CAMERA_SCOPE_LENGTH = 256;
const MAX_FRAME_ID_LENGTH = 512;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

interface PersistedDatasetEntry extends EpisodePersistedModalLayout {
  /** Last-write timestamp; drives least-recently-updated eviction. */
  updatedAtMs: number;
}

interface PersistedStore {
  version: typeof STORAGE_VERSION;
  /** Browser-wide layer used only by unscoped callers. */
  fallback?: EpisodePersistedModalLayout;
  byDataset?: Record<string, PersistedDatasetEntry>;
}

const STORAGE_KEY = "fiftyone.episode.modal-layout.v2";
const STORAGE_VERSION = 2;
const FALLBACK_OMITTED_FIELDS = [
  "logSettings",
  "mapSettings",
  "cameraPreferences",
  "plotSeries",
  "rawStreams",
  "sceneUpAxis",
  "tileTitles",
] as const;

// Cap the per-dataset table so heavy multi-dataset use can't grow the
// payload unboundedly — localStorage is quota'd and the whole key is
// parsed on every modal mount. 20 comfortably covers a user's active
// datasets; least-recently-updated entries beyond that are evicted and
// simply use defaults on their next open.
const MAX_DATASET_ENTRIES = 20;

/** True when the value is a structurally valid mosaic tree of tile ids. */
export function isValidMosaicLayout(node: unknown): node is MosaicNode<string> {
  if (typeof node === "string") return node.length > 0;
  if (typeof node !== "object" || node === null) return false;
  const parent = node as Record<string, unknown>;
  return (
    (parent.direction === "row" || parent.direction === "column") &&
    (parent.splitPercentage === undefined ||
      (typeof parent.splitPercentage === "number" &&
        parent.splitPercentage >= 0 &&
        parent.splitPercentage <= 100)) &&
    isValidMosaicLayout(parent.first) &&
    isValidMosaicLayout(parent.second)
  );
}

/** Field-by-field sanitization of one persisted entry. */
function sanitizeEntry(raw: unknown): EpisodePersistedModalLayout | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const candidate = raw as Record<string, unknown>;
  return {
    cameraPreferences: sanitizeCameraPreferences(candidate.cameraPreferences),
    expandedTileId: sanitizeTileId(candidate.expandedTileId),
    leftSidebarOpen:
      typeof candidate.leftSidebarOpen === "boolean"
        ? candidate.leftSidebarOpen
        : undefined,
    layout: isValidMosaicLayout(candidate.layout)
      ? candidate.layout
      : undefined,
    logSettings: sanitizeLogSettings(candidate.logSettings),
    mapSettings: sanitizeMapSettings(candidate.mapSettings),
    plotSeries: sanitizePlotSeries(candidate.plotSeries),
    rawStreams: sanitizeRawStreams(candidate.rawStreams),
    sceneUpAxis: normalizeEpisode3dSceneUpAxis(candidate.sceneUpAxis),
    sidebarWidthPx:
      typeof candidate.sidebarWidthPx === "number" &&
      Number.isFinite(candidate.sidebarWidthPx) &&
      candidate.sidebarWidthPx > 0
        ? candidate.sidebarWidthPx
        : undefined,
    tileTitles: sanitizeTileTitles(candidate.tileTitles),
  };
}

function sanitizeCameraPreferences(
  value: unknown,
): Record<string, EpisodePersistedCameraPreferences> | undefined {
  if (typeof value !== "object" || value === null) return undefined;

  const result: Record<string, EpisodePersistedCameraPreferences> = {};
  for (const [rawScope, rawPreferences] of Object.entries(value)) {
    if (Object.keys(result).length >= MAX_CAMERA_PREFERENCE_FIELDS) break;
    const scope = rawScope.trim();
    if (!scope || scope.length > MAX_CAMERA_SCOPE_LENGTH) continue;
    if (typeof rawPreferences !== "object" || rawPreferences === null) {
      continue;
    }

    const candidate = rawPreferences as Record<string, unknown>;
    const defaultTrackingMode = normalizeTrackingMode(
      candidate.defaultTrackingMode,
    );
    const preferredCameraTargetFrameId = sanitizeFrameId(
      candidate.preferredCameraTargetFrameId,
    );
    const preferredWorldFrameId = sanitizeFrameId(
      candidate.preferredWorldFrameId,
    );
    const sceneUpAxis = normalizeEpisode3dSceneUpAxis(candidate.sceneUpAxis);
    const preferences: EpisodePersistedCameraPreferences = {
      ...(defaultTrackingMode ? { defaultTrackingMode } : {}),
      ...(preferredCameraTargetFrameId ? { preferredCameraTargetFrameId } : {}),
      ...(preferredWorldFrameId ? { preferredWorldFrameId } : {}),
      ...(sceneUpAxis ? { sceneUpAxis } : {}),
    };
    if (Object.keys(preferences).length > 0) {
      result[scope] = preferences;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeFrameId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const frameId = value.trim();
  return frameId && frameId.length <= MAX_FRAME_ID_LENGTH ? frameId : undefined;
}

function normalizeTrackingMode(
  value: unknown,
): Episode3dTrackingMode | undefined {
  return value === "free" ||
    value === "position" ||
    value === "heading" ||
    value === "pose"
    ? value
    : undefined;
}

function sanitizeTileId(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/**
 * Structural validation of the persisted plot-series table: keys must
 * be plot tile ids, every series a `{stream, fieldPath, color}` record
 * with a hex color, both tables capped. Invalid rows drop individually.
 */
export function sanitizePlotSeries(
  raw: unknown,
): Record<string, readonly EpisodePersistedPlotSeries[]> | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const result: Record<string, readonly EpisodePersistedPlotSeries[]> = {};
  let tileCount = 0;
  for (const [tileId, rawSeries] of Object.entries(raw)) {
    if (
      episodeTileTypeFromId(tileId) !== EPISODE_TILE_TYPE.PLOT ||
      !Array.isArray(rawSeries)
    ) {
      continue;
    }
    if (tileCount >= MAX_PLOT_TILES) break;

    const series: EpisodePersistedPlotSeries[] = [];
    for (const entry of rawSeries as unknown[]) {
      if (series.length >= MAX_PLOT_SERIES_PER_TILE) break;
      if (typeof entry !== "object" || entry === null) continue;
      const record = entry as Record<string, unknown>;
      const stream = record.stream;
      if (
        typeof stream === "string" &&
        stream.length > 0 &&
        typeof record.fieldPath === "string" &&
        record.fieldPath.length > 0 &&
        typeof record.color === "string" &&
        HEX_COLOR_PATTERN.test(record.color)
      ) {
        series.push({
          color: record.color,
          fieldPath: record.fieldPath,
          stream,
        });
      }
    }
    if (series.length > 0) {
      result[tileId] = series;
      tileCount += 1;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Structural validation of the persisted raw-stream table: keys must be
 * raw tile ids, values non-empty bounded stream strings, table capped.
 * Invalid rows drop individually.
 */
export function sanitizeRawStreams(
  raw: unknown,
): Record<string, string> | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const result: Record<string, string> = {};
  let tileCount = 0;
  for (const [tileId, stream] of Object.entries(raw)) {
    if (
      episodeTileTypeFromId(tileId) !== EPISODE_TILE_TYPE.RAW ||
      typeof stream !== "string" ||
      stream.length === 0 ||
      stream.length > MAX_RAW_STREAM_LENGTH
    ) {
      continue;
    }
    if (tileCount >= MAX_RAW_TILES) break;
    result[tileId] = stream;
    tileCount += 1;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Structural validation of per-map tile settings. Stream arrays are allowed
 * to be empty (the user may hide every GPS stream), stream strings are bounded,
 * and only map tile ids are restored.
 */
export function sanitizeMapSettings(
  raw: unknown,
): Record<string, EpisodePersistedMapSettings> | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const result: Record<string, EpisodePersistedMapSettings> = {};
  let tileCount = 0;
  for (const [tileId, settings] of Object.entries(raw)) {
    if (
      tileCount >= MAX_MAP_TILES ||
      episodeTileTypeFromId(tileId) !== EPISODE_TILE_TYPE.MAP ||
      typeof settings !== "object" ||
      settings === null ||
      Array.isArray(settings)
    ) {
      continue;
    }

    const record = settings as Record<string, unknown>;
    const baseLayer =
      normalizeEpisodeMapBaseLayer(record.baseLayer) ??
      DEFAULT_EPISODE_MAP_TILE_SETTINGS.baseLayer;
    const enabledStreams = sanitizeStreamList(record.enabledStreams);
    const followEgo =
      typeof record.followEgo === "boolean"
        ? record.followEgo
        : DEFAULT_EPISODE_MAP_TILE_SETTINGS.followEgo;

    result[tileId] = {
      baseLayer,
      followEgo,
      ...(enabledStreams !== undefined ? { enabledStreams } : {}),
    };
    tileCount += 1;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export function sanitizeLogSettings(
  raw: unknown,
): Record<string, EpisodePersistedLogSettings> | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const result: Record<string, EpisodePersistedLogSettings> = {};
  let tileCount = 0;
  for (const [tileId, settings] of Object.entries(raw)) {
    if (
      tileCount >= MAX_LOG_TILES ||
      episodeTileTypeFromId(tileId) !== EPISODE_TILE_TYPE.LOG ||
      typeof settings !== "object" ||
      settings === null ||
      Array.isArray(settings)
    ) {
      continue;
    }

    const record = settings as Record<string, unknown>;
    const enabledStreams = sanitizeStreamList(record.enabledStreams);
    const followPlayhead =
      typeof record.followPlayhead === "boolean"
        ? record.followPlayhead
        : DEFAULT_EPISODE_LOG_TILE_SETTINGS.followPlayhead;
    const selectedLevels = sanitizeLogLevels(record.selectedLevels);

    result[tileId] = {
      followPlayhead,
      selectedLevels,
      ...(enabledStreams !== undefined ? { enabledStreams } : {}),
    };
    tileCount += 1;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeLogLevels(raw: unknown): readonly LogLevel[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_EPISODE_LOG_TILE_SETTINGS.selectedLevels;
  }
  // An empty result is kept: all-levels-off is a deliberate view state,
  // exactly like the map tile's explicit empty stream list.
  return LOG_LEVELS.filter((level) => raw.includes(level));
}

function sanitizeStreamList(raw: unknown): readonly string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const streams: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (streams.length >= MAX_MAP_STREAMS_PER_TILE) break;
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > MAX_MAP_STREAM_LENGTH ||
      seen.has(value)
    ) {
      continue;
    }
    seen.add(value);
    streams.push(value);
  }
  return streams;
}

/**
 * Structural validation of user-authored tile titles. Unknown tile-id
 * shapes and empty/overlong titles drop individually.
 */
export function sanitizeTileTitles(
  raw: unknown,
): Record<string, string> | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const result: Record<string, string> = {};
  let titleCount = 0;
  for (const [tileId, title] of Object.entries(raw)) {
    if (titleCount >= MAX_TILE_TITLES) break;
    if (episodeTileTypeFromId(tileId) === null || typeof title !== "string") {
      continue;
    }
    const trimmed = title.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_TILE_TITLE_LENGTH) {
      continue;
    }
    result[tileId] = trimmed;
    titleCount += 1;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/** Parse and sanitize whatever is in storage into the current store shape. */
function readStore(): {
  fallback?: EpisodePersistedModalLayout;
  byDataset: Record<string, PersistedDatasetEntry>;
} | null {
  try {
    const storage = globalThis.localStorage;
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const version = (parsed as { version?: unknown }).version;
    if (version !== STORAGE_VERSION) return null;
    const store = parsed as { fallback?: unknown; byDataset?: unknown };
    const byDataset: Record<string, PersistedDatasetEntry> = {};
    if (typeof store.byDataset === "object" && store.byDataset !== null) {
      for (const [key, value] of Object.entries(store.byDataset)) {
        const entry = sanitizeEntry(value);
        if (!entry) continue;
        const updatedAtMs = (value as { updatedAtMs?: unknown }).updatedAtMs;
        byDataset[key] = {
          ...entry,
          updatedAtMs:
            typeof updatedAtMs === "number" && Number.isFinite(updatedAtMs)
              ? updatedAtMs
              : 0,
        };
      }
    }
    const fallback =
      store.fallback === undefined
        ? undefined
        : sanitizedFallbackLayout(store.fallback);
    return {
      fallback,
      byDataset,
    };
  } catch {
    // Corrupt JSON / storage unavailable (private mode, SSR) — behave as
    // if nothing is stored.
    return null;
  }
}

/**
 * Read the persisted modal layout for `datasetKey`, or `null` when
 * nothing valid is stored. Scoped reads restore only the exact entry; a
 * missing entry means the caller should use built-in defaults. Unscoped reads
 * use the browser-wide fallback.
 */
export function readEpisodeModalLayout(
  datasetKey?: string,
): EpisodePersistedModalLayout | null {
  const store = readStore();
  if (!store) return null;
  if (datasetKey) {
    const entry = store.byDataset[datasetKey];
    return entry ? layoutFromDatasetEntry(entry) : null;
  }

  return store.fallback ?? null;
}

/**
 * Merge `patch` into the persisted layout. Partial on purpose: sidebar
 * toggles, the width observer, and the layout observer write
 * independently.
 *
 * Scoped writes update only the scoped entry. Unscoped writes update the
 * browser-wide fallback.
 */
export function writeEpisodeModalLayout(
  patch: Partial<EpisodePersistedModalLayout>,
  datasetKey?: string,
): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    const store = readStore();
    const byDataset = { ...store?.byDataset };
    let fallback = store?.fallback;
    if (datasetKey) {
      byDataset[datasetKey] = {
        ...byDataset[datasetKey],
        ...patch,
        updatedAtMs: Date.now(),
      };
      evictLeastRecentlyUpdated(byDataset);
    } else {
      fallback = stripDatasetScopedLayoutFields({
        ...fallback,
        ...patch,
      });
    }
    const next: PersistedStore = {
      version: STORAGE_VERSION,
      fallback,
      byDataset,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded / storage unavailable — persisting layout is a
    // nicety, never an error path.
  }
}

/** Reads durable 3D conventions for one selected media field. */
export function readEpisodeCameraPreferences(
  datasetKey: string | undefined,
  mediaField: string | undefined,
): EpisodePersistedCameraPreferences | null {
  const field = mediaField?.trim();
  if (!datasetKey || !field) return null;
  return readEpisodeModalLayout(datasetKey)?.cameraPreferences?.[field] ?? null;
}

/** Merges one media field's durable 3D conventions into dataset storage. */
export function writeEpisodeCameraPreferences(
  patch: Partial<EpisodePersistedCameraPreferences>,
  datasetKey: string | undefined,
  mediaField: string | undefined,
): void {
  const field = mediaField?.trim();
  if (!datasetKey || !field) return;

  const layout = readEpisodeModalLayout(datasetKey);
  const currentByField = layout?.cameraPreferences ?? {};
  const retainedEntries = Object.entries(currentByField)
    .filter(([key]) => key !== field)
    .slice(-(MAX_CAMERA_PREFERENCE_FIELDS - 1));
  writeEpisodeModalLayout(
    {
      cameraPreferences: {
        ...Object.fromEntries(retainedEntries),
        [field]: { ...currentByField[field], ...patch },
      },
    },
    datasetKey,
  );
}

function layoutFromDatasetEntry(
  entry: PersistedDatasetEntry,
): EpisodePersistedModalLayout {
  const { updatedAtMs: _updatedAtMs, ...layout } = entry;
  return layout;
}

function stripDatasetScopedLayoutFields(
  layout: Partial<EpisodePersistedModalLayout>,
): EpisodePersistedModalLayout {
  const fallback = { ...layout };
  for (const field of FALLBACK_OMITTED_FIELDS) {
    delete fallback[field];
  }
  return fallback;
}

function sanitizedFallbackLayout(
  raw: unknown,
): EpisodePersistedModalLayout | undefined {
  const entry = sanitizeEntry(raw);
  if (!entry) {
    return undefined;
  }
  const fallback = stripDatasetScopedLayoutFields(entry);
  return Object.values(fallback).some((value) => value !== undefined)
    ? fallback
    : undefined;
}

/** Drop the least-recently-updated entries beyond the table cap. */
function evictLeastRecentlyUpdated(
  byDataset: Record<string, PersistedDatasetEntry>,
): void {
  const keys = Object.keys(byDataset);
  if (keys.length <= MAX_DATASET_ENTRIES) return;
  keys
    .sort((a, b) => byDataset[a].updatedAtMs - byDataset[b].updatedAtMs)
    .slice(0, keys.length - MAX_DATASET_ENTRIES)
    .forEach((key) => delete byDataset[key]);
}

/**
 * Tile type encoded in a tile id. Ids are `${type}-${suffix}` (e.g.
 * `image-default`, `3d-2`), so the type is everything before the
 * final dash. Returns `null` for ids without a suffix.
 */
export function episodeTileTypeFromId(tileId: string): string | null {
  const finalDashIndex = tileId.lastIndexOf("-");
  const hasTypeBeforeDash = finalDashIndex > 0;
  const hasSuffixAfterDash = finalDashIndex < tileId.length - 1;

  if (!hasTypeBeforeDash || !hasSuffixAfterDash) {
    return null;
  }

  return tileId.slice(0, finalDashIndex);
}
