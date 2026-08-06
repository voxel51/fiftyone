import type { MosaicNode } from "react-mosaic-component";
import { sanitizeBoundedStringList } from "../../../utils/bounded-string-list";
import { createTimestampLruScopedStore } from "../../../utils/scoped-store";
import { isEpisodeTileExtensionId } from "../../../extensions/tiles/registry";
import {
  normalizeScene3dUpAxis,
  type Scene3dUpAxis,
} from "../spatial/view-preferences";
import type { Scene3dTrackingMode } from "../scene/camera/scene-3d-camera";
import { LOG_LEVELS, type LogLevel } from "../../../ir";
import {
  DEFAULT_LOG_TILE_SETTINGS,
  type LogTileSettings,
} from "../logs/log-tile-state";
import {
  DEFAULT_MAP_TILE_SETTINGS,
  normalizeMapBaseLayer,
  type MapTileSettings,
} from "../map/tile/tile-state";
import { sanitizeTimelineSamplingRateHz } from "../playback/timeline-sampling";
import { TILE_TYPE } from "../tiles/tile-types";

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
 * falls back to the built-in defaults (see `use-modal-layout`).
 */

/**
 * Per-scope persisted fields. Every field is optional — callers fall back to
 * built-in defaults per-field.
 */
export interface PersistedModalLayout {
  /** Tile id rendered expanded over the saved layout, when any. */
  expandedTileId?: string;
  /** Opaque JSON settings owned by namespaced, build-time tile extensions. */
  extensionSettings?: Record<string, PersistedExtensionSettingsValue>;
  leftSidebarOpen?: boolean;
  /** Mosaic tree whose leaves are tile ids (e.g. `image-default`). */
  layout?: MosaicNode<string> | null;
  /**
   * Enabled plot series per plot tile id. Series reference streams of
   * one dataset's recordings, so this field is dataset-scoped only —
   * it is never merged into (or read from) the browser-wide fallback.
   */
  plotSeries?: Record<string, readonly PersistedPlotSeries[]>;
  /**
   * Map tile stream visibility and follow/basemap preferences. Dataset-scoped:
   * stream names belong to one recording family.
   */
  mapSettings?: Record<string, PersistedMapSettings>;
  /**
   * Log console stream/level visibility and follow preference per log tile
   * id. Dataset-scoped: stream names belong to one recording family.
   */
  logSettings?: Record<string, PersistedLogSettings>;
  /**
   * Inspected stream per raw-message tile id. Streams belong to one
   * dataset's recordings, so this field is dataset-scoped only — like
   * `plotSeries`, never merged into the browser-wide fallback.
   */
  rawStreams?: Record<string, string>;
  /** Playback presentation settings per 3D tile. Dataset-scoped only. */
  scene3dSettings?: Record<string, PersistedScene3dSettings>;
  /**
   * User-authored tile titles per tile id. Dataset-scoped only: names
   * are layout semantics for this recording family, not reusable fallback
   * chrome across unrelated stream sets.
   */
  tileTitles?: Record<string, string>;
  /**
   * World axis treated as up by the 3D episode scene. Dataset-scoped only:
   * coordinate conventions belong to the dataset, not the browser fallback.
   */
  sceneUpAxis?: Scene3dUpAxis;
  /** Durable 3D conventions, isolated by selected media field. */
  cameraPreferences?: Record<string, PersistedCameraPreferences>;
  /** Left sidebar width in px; the shell clamps it on restore. */
  sidebarWidthPx?: number;
  /** Episode data-sampling cadence. Dataset/source-scoped only. */
  timelineSamplingRateHz?: number;
}

/** Durable 3D coordinate conventions for one dataset media field. */
export interface PersistedCameraPreferences {
  readonly defaultTrackingMode?: Scene3dTrackingMode;
  readonly preferredCameraTargetFrameId?: string;
  readonly preferredWorldFrameId?: string;
  readonly sceneUpAxis?: Scene3dUpAxis;
}

/**
 * One persisted plot series: a stream's numeric field and the color the
 * user saw it in.
 */
export interface PersistedPlotSeries {
  readonly color: string;
  readonly fieldPath: string;
  readonly stream: string;
}

export type PersistedMapSettings = MapTileSettings;

export type PersistedLogSettings = LogTileSettings;

export interface PersistedScene3dSettings {
  readonly smoothTrackedLabels: boolean;
}

/** JSON values accepted from extension-owned tile settings. */
export type PersistedExtensionSettingsValue =
  | boolean
  | number
  | string
  | null
  | readonly PersistedExtensionSettingsValue[]
  | { readonly [key: string]: PersistedExtensionSettingsValue };

// Bound the persisted plot config so a corrupt or adversarial payload
// cannot balloon the localStorage entry parsed on every modal mount.
const MAX_PLOT_TILES = 32;
const MAX_PLOT_SERIES_PER_TILE = 64;
const MAX_RAW_TILES = 32;
const MAX_RAW_STREAM_LENGTH = 512;
const MAX_MAP_TILES = 16;
const MAX_LOG_TILES = 16;
const MAX_SCENE_3D_TILES = 16;
const MAX_MAP_STREAMS_PER_TILE = 64;
const MAX_MAP_STREAM_LENGTH = 512;
const MAX_TILE_TITLES = 64;
const MAX_TILE_TITLE_LENGTH = 160;
const MAX_CAMERA_PREFERENCE_FIELDS = 16;
const MAX_CAMERA_SCOPE_LENGTH = 256;
const MAX_FRAME_ID_LENGTH = 512;
const MAX_EXTENSION_TILES = 32;
const MAX_EXTENSION_SETTINGS_DEPTH = 8;
const MAX_EXTENSION_SETTINGS_NODES = 2_048;
const MAX_EXTENSION_SETTINGS_KEYS = 128;
const MAX_EXTENSION_SETTINGS_KEY_LENGTH = 256;
const MAX_EXTENSION_SETTINGS_STRING_LENGTH = 8_192;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const STORAGE_KEY = "fiftyone.episode.modal-layout.v3";
const STORAGE_VERSION = 3;
const FALLBACK_OMITTED_FIELDS = [
  "logSettings",
  "mapSettings",
  "cameraPreferences",
  "extensionSettings",
  "plotSeries",
  "rawStreams",
  "scene3dSettings",
  "sceneUpAxis",
  "tileTitles",
  "timelineSamplingRateHz",
] as const;

// Cap the per-dataset table so heavy multi-dataset use can't grow the
// payload unboundedly — localStorage is quota'd and the whole key is
// parsed on every modal mount. 20 comfortably covers a user's active
// datasets; least-recently-updated entries beyond that are evicted and
// simply use defaults on their next open.
const MAX_DATASET_ENTRIES = 20;

const modalLayoutStore = createTimestampLruScopedStore<
  PersistedModalLayout,
  PersistedModalLayout
>({
  fallback: {
    location: { field: "fallback" },
    sanitize: sanitizedFallbackLayout,
    serialize: (layout) => ({ ...layout }),
  },
  key: STORAGE_KEY,
  maxScopes: MAX_DATASET_ENTRIES,
  sanitizeScope: sanitizeEntry,
  scopeField: "byDataset",
  serializeScope: (layout) => ({ ...layout }),
  storage: () => globalThis.localStorage,
  version: STORAGE_VERSION,
});

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
function sanitizeEntry(raw: unknown): PersistedModalLayout | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const candidate = raw as Record<string, unknown>;
  return {
    cameraPreferences: sanitizeCameraPreferences(candidate.cameraPreferences),
    extensionSettings: sanitizeExtensionSettings(candidate.extensionSettings),
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
    scene3dSettings: sanitizeScene3dSettings(candidate.scene3dSettings),
    sceneUpAxis: normalizeScene3dUpAxis(candidate.sceneUpAxis),
    sidebarWidthPx:
      typeof candidate.sidebarWidthPx === "number" &&
      Number.isFinite(candidate.sidebarWidthPx) &&
      candidate.sidebarWidthPx > 0
        ? candidate.sidebarWidthPx
        : undefined,
    tileTitles: sanitizeTileTitles(candidate.tileTitles),
    timelineSamplingRateHz: sanitizeTimelineSamplingRateHz(
      candidate.timelineSamplingRateHz,
    ),
  };
}

/** Bounds opaque extension state before it enters layout persistence. */
export function sanitizeExtensionSettings(
  value: unknown,
): Record<string, PersistedExtensionSettingsValue> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const result: Record<string, PersistedExtensionSettingsValue> = {};
  let acceptedTileCount = 0;
  for (const [tileId, rawSettings] of Object.entries(value)) {
    if (acceptedTileCount >= MAX_EXTENSION_TILES) break;
    const tileType = tileTypeFromId(tileId);
    if (!tileType || !isEpisodeTileExtensionId(tileType)) continue;
    const budget = { nodes: 0 };
    const settings = sanitizeExtensionJsonValue(rawSettings, 0, budget);
    if (settings !== undefined) {
      result[tileId] = settings;
      acceptedTileCount += 1;
    }
  }
  return acceptedTileCount > 0 ? result : undefined;
}

function sanitizeExtensionJsonValue(
  value: unknown,
  depth: number,
  budget: { nodes: number },
): PersistedExtensionSettingsValue | undefined {
  budget.nodes += 1;
  if (
    budget.nodes > MAX_EXTENSION_SETTINGS_NODES ||
    depth > MAX_EXTENSION_SETTINGS_DEPTH
  ) {
    return undefined;
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    return value.length <= MAX_EXTENSION_SETTINGS_STRING_LENGTH
      ? value
      : value.slice(0, MAX_EXTENSION_SETTINGS_STRING_LENGTH);
  }
  if (Array.isArray(value)) {
    const result: PersistedExtensionSettingsValue[] = [];
    for (const item of value.slice(0, MAX_EXTENSION_SETTINGS_KEYS)) {
      const sanitized = sanitizeExtensionJsonValue(item, depth + 1, budget);
      if (sanitized !== undefined) result.push(sanitized);
    }
    return result;
  }
  if (typeof value !== "object") return undefined;

  const result: Record<string, PersistedExtensionSettingsValue> = {};
  for (const [key, item] of Object.entries(value).slice(
    0,
    MAX_EXTENSION_SETTINGS_KEYS,
  )) {
    if (!key || key.length > MAX_EXTENSION_SETTINGS_KEY_LENGTH) continue;
    const sanitized = sanitizeExtensionJsonValue(item, depth + 1, budget);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function sanitizeCameraPreferences(
  value: unknown,
): Record<string, PersistedCameraPreferences> | undefined {
  if (typeof value !== "object" || value === null) return undefined;

  const result: Record<string, PersistedCameraPreferences> = {};
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
    const sceneUpAxis = normalizeScene3dUpAxis(candidate.sceneUpAxis);
    const preferences: PersistedCameraPreferences = {
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
): Scene3dTrackingMode | undefined {
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
): Record<string, readonly PersistedPlotSeries[]> | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const result: Record<string, readonly PersistedPlotSeries[]> = {};
  let tileCount = 0;
  for (const [tileId, rawSeries] of Object.entries(raw)) {
    if (
      tileTypeFromId(tileId) !== TILE_TYPE.PLOT ||
      !Array.isArray(rawSeries)
    ) {
      continue;
    }
    if (tileCount >= MAX_PLOT_TILES) break;

    const series: PersistedPlotSeries[] = [];
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
      tileTypeFromId(tileId) !== TILE_TYPE.RAW ||
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

/** Structural validation of per-3D-tile playback presentation settings. */
export function sanitizeScene3dSettings(
  raw: unknown,
): Record<string, PersistedScene3dSettings> | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const result: Record<string, PersistedScene3dSettings> = {};
  let tileCount = 0;
  for (const [tileId, settings] of Object.entries(raw)) {
    if (
      tileCount >= MAX_SCENE_3D_TILES ||
      tileTypeFromId(tileId) !== TILE_TYPE.THREE_D ||
      typeof settings !== "object" ||
      settings === null ||
      Array.isArray(settings)
    ) {
      continue;
    }
    const smoothTrackedLabels = (settings as Record<string, unknown>)
      .smoothTrackedLabels;
    if (typeof smoothTrackedLabels !== "boolean") continue;
    result[tileId] = { smoothTrackedLabels };
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
): Record<string, PersistedMapSettings> | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const result: Record<string, PersistedMapSettings> = {};
  let tileCount = 0;
  for (const [tileId, settings] of Object.entries(raw)) {
    if (
      tileCount >= MAX_MAP_TILES ||
      tileTypeFromId(tileId) !== TILE_TYPE.MAP ||
      typeof settings !== "object" ||
      settings === null ||
      Array.isArray(settings)
    ) {
      continue;
    }

    const record = settings as Record<string, unknown>;
    const baseLayer =
      normalizeMapBaseLayer(record.baseLayer) ??
      DEFAULT_MAP_TILE_SETTINGS.baseLayer;
    const enabledStreams = sanitizeStreamList(record.enabledStreams);
    const followEgo =
      typeof record.followEgo === "boolean"
        ? record.followEgo
        : DEFAULT_MAP_TILE_SETTINGS.followEgo;

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
): Record<string, PersistedLogSettings> | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const result: Record<string, PersistedLogSettings> = {};
  let tileCount = 0;
  for (const [tileId, settings] of Object.entries(raw)) {
    if (
      tileCount >= MAX_LOG_TILES ||
      tileTypeFromId(tileId) !== TILE_TYPE.LOG ||
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
        : DEFAULT_LOG_TILE_SETTINGS.followPlayhead;
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
    return DEFAULT_LOG_TILE_SETTINGS.selectedLevels;
  }
  // An empty result is kept: all-levels-off is a deliberate view state,
  // exactly like the map tile's explicit empty stream list.
  return LOG_LEVELS.filter((level) => raw.includes(level));
}

function sanitizeStreamList(raw: unknown): readonly string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return sanitizeBoundedStringList(
    raw,
    MAX_MAP_STREAMS_PER_TILE,
    MAX_MAP_STREAM_LENGTH,
  );
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
    if (tileTypeFromId(tileId) === null || typeof title !== "string") {
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

/**
 * Read the persisted modal layout for `datasetKey`, or `null` when
 * nothing valid is stored. Scoped reads restore only the exact entry; a
 * missing entry means the caller should use built-in defaults. Unscoped reads
 * use the browser-wide fallback.
 */
export function readModalLayout(
  datasetKey?: string,
): PersistedModalLayout | null {
  return datasetKey
    ? modalLayoutStore.readScope(datasetKey)
    : modalLayoutStore.readFallback();
}

/**
 * Merge `patch` into the persisted layout. Partial on purpose: sidebar
 * toggles, the width observer, and the layout observer write
 * independently.
 *
 * Scoped writes update only the scoped entry. Unscoped writes update the
 * browser-wide fallback.
 */
export function writeModalLayout(
  patch: Partial<PersistedModalLayout>,
  datasetKey?: string,
): void {
  if (datasetKey) {
    modalLayoutStore.updateScope(datasetKey, (current) => ({
      ...current,
      ...patch,
    }));
    return;
  }
  modalLayoutStore.updateFallback((current) =>
    stripDatasetScopedLayoutFields({ ...current, ...patch }),
  );
}

/** Reads durable 3D conventions for one selected media field. */
export function readCameraPreferences(
  datasetKey: string | undefined,
  mediaField: string | undefined,
): PersistedCameraPreferences | null {
  const field = mediaField?.trim();
  if (!datasetKey || !field) return null;
  return readModalLayout(datasetKey)?.cameraPreferences?.[field] ?? null;
}

/** Merges one media field's durable 3D conventions into dataset storage. */
export function writeCameraPreferences(
  patch: Partial<PersistedCameraPreferences>,
  datasetKey: string | undefined,
  mediaField: string | undefined,
): void {
  const field = mediaField?.trim();
  if (!datasetKey || !field) return;

  const layout = readModalLayout(datasetKey);
  const currentByField = layout?.cameraPreferences ?? {};
  const retainedEntries = Object.entries(currentByField)
    .filter(([key]) => key !== field)
    .slice(-(MAX_CAMERA_PREFERENCE_FIELDS - 1));
  writeModalLayout(
    {
      cameraPreferences: {
        ...Object.fromEntries(retainedEntries),
        [field]: { ...currentByField[field], ...patch },
      },
    },
    datasetKey,
  );
}

function stripDatasetScopedLayoutFields(
  layout: Partial<PersistedModalLayout>,
): PersistedModalLayout {
  const fallback = { ...layout };
  for (const field of FALLBACK_OMITTED_FIELDS) {
    delete fallback[field];
  }
  return fallback;
}

function sanitizedFallbackLayout(
  raw: unknown,
): PersistedModalLayout | undefined {
  const entry = sanitizeEntry(raw);
  if (!entry) {
    return undefined;
  }
  const fallback = stripDatasetScopedLayoutFields(entry);
  return Object.values(fallback).some((value) => value !== undefined)
    ? fallback
    : undefined;
}

/**
 * Tile type encoded in a tile id. Ids are `${type}-${suffix}` (e.g.
 * `image-default`, `3d-2`), so the type is everything before the
 * final dash. Returns `null` for ids without a suffix.
 */
export function tileTypeFromId(tileId: string): string | null {
  const finalDashIndex = tileId.lastIndexOf("-");
  const hasTypeBeforeDash = finalDashIndex > 0;
  const hasSuffixAfterDash = finalDashIndex < tileId.length - 1;

  if (!hasTypeBeforeDash || !hasSuffixAfterDash) {
    return null;
  }

  return tileId.slice(0, finalDashIndex);
}
