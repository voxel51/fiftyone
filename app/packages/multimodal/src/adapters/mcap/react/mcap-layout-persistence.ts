import type { MosaicNode } from "react-mosaic-component";
import {
  normalizeMcap3dSceneUpAxis,
  type Mcap3dSceneUpAxis,
} from "./mcap-3d-scene-up";
import {
  DEFAULT_MCAP_MAP_TILE_SETTINGS,
  normalizeMcapMapBaseLayer,
  type McapMapTileSettings,
} from "./mcap-map-tile-state";
import { MCAP_TILE_TYPE } from "./mcap-tile-types";

/**
 * Persistence for the MCAP modal's chrome: sidebar visibility, sidebar
 * width, the mosaic tile arrangement, and the currently expanded tile.
 *
 * One localStorage key holding scoped entries plus a browser-wide fallback
 * for callers that do not provide a scope. Samples in a dataset are
 * typically different recordings with the same topic structure, so the
 * sample renderer scopes by dataset; the standalone MCAP explorer scopes by
 * source. A scoped read intentionally restores only that exact scope, so a
 * new dataset or new explorer MCAP starts from the built-in defaults.
 *
 * Restore is best-effort: anything unreadable or structurally invalid
 * falls back to the built-in defaults (see `use-mcap-modal-layout`).
 */

/**
 * Per-scope persisted fields. Every field is optional — callers fall back to
 * built-in defaults per-field.
 */
export interface McapPersistedModalLayout {
  /** Tile id rendered expanded over the saved layout, when any. */
  expandedTileId?: string;
  leftSidebarOpen?: boolean;
  /** Mosaic tree whose leaves are tile ids (e.g. `image-default`). */
  layout?: MosaicNode<string> | null;
  /**
   * Enabled plot series per plot tile id. Series reference topics of
   * one dataset's recordings, so this field is dataset-scoped only —
   * it is never merged into (or read from) the browser-wide fallback.
   */
  plotSeries?: Record<string, readonly McapPersistedPlotSeries[]>;
  /**
   * Map tile topic visibility and follow/basemap preferences. Dataset-scoped:
   * topic names belong to one recording family.
   */
  mapSettings?: Record<string, McapPersistedMapSettings>;
  /**
   * Inspected topic per raw-message tile id. Topics belong to one
   * dataset's recordings, so this field is dataset-scoped only — like
   * `plotSeries`, never merged into the browser-wide fallback.
   */
  rawTopics?: Record<string, string>;
  /**
   * User-authored panel titles per tile id. Dataset-scoped only: names
   * are layout semantics for this recording family, not reusable fallback
   * chrome across unrelated topic sets.
   */
  tileTitles?: Record<string, string>;
  /**
   * World axis treated as up by the 3D MCAP scene. Dataset-scoped only:
   * coordinate conventions belong to the dataset, not the browser fallback.
   */
  sceneUpAxis?: Mcap3dSceneUpAxis;
  /** Left sidebar width in px; the shell clamps it on restore. */
  sidebarWidthPx?: number;
}

/**
 * One persisted plot series: a topic's numeric field and the color the
 * user saw it in.
 */
export interface McapPersistedPlotSeries {
  readonly color: string;
  readonly fieldPath: string;
  readonly topic: string;
}

export type McapPersistedMapSettings = McapMapTileSettings;

// Bound the persisted plot config so a corrupt or adversarial payload
// cannot balloon the localStorage entry parsed on every modal mount.
const MAX_PLOT_TILES = 32;
const MAX_PLOT_SERIES_PER_TILE = 64;
const MAX_RAW_TILES = 32;
const MAX_RAW_TOPIC_LENGTH = 512;
const MAX_MAP_TILES = 16;
const MAX_MAP_TOPICS_PER_TILE = 64;
const MAX_MAP_TOPIC_LENGTH = 512;
const MAX_TILE_TITLES = 64;
const MAX_TILE_TITLE_LENGTH = 160;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

interface PersistedDatasetEntry extends McapPersistedModalLayout {
  /** Last-write timestamp; drives least-recently-updated eviction. */
  updatedAtMs: number;
}

interface PersistedStore {
  version: typeof STORAGE_VERSION;
  /** Browser-wide layer used only by unscoped callers. */
  fallback?: McapPersistedModalLayout;
  byDataset?: Record<string, PersistedDatasetEntry>;
}

const STORAGE_KEY = "fiftyone.mcap.modal-layout";
const STORAGE_VERSION = 1;
const FALLBACK_OMITTED_FIELDS = [
  "mapSettings",
  "plotSeries",
  "rawTopics",
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

/** Field-by-field sanitization of one persisted entry (any version). */
function sanitizeEntry(raw: unknown): McapPersistedModalLayout | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const candidate = raw as Record<string, unknown>;
  return {
    expandedTileId: sanitizeTileId(candidate.expandedTileId),
    leftSidebarOpen:
      typeof candidate.leftSidebarOpen === "boolean"
        ? candidate.leftSidebarOpen
        : undefined,
    layout: isValidMosaicLayout(candidate.layout)
      ? candidate.layout
      : undefined,
    mapSettings: sanitizeMapSettings(candidate.mapSettings),
    plotSeries: sanitizePlotSeries(candidate.plotSeries),
    rawTopics: sanitizeRawTopics(candidate.rawTopics),
    sceneUpAxis: normalizeMcap3dSceneUpAxis(candidate.sceneUpAxis),
    sidebarWidthPx:
      typeof candidate.sidebarWidthPx === "number" &&
      Number.isFinite(candidate.sidebarWidthPx) &&
      candidate.sidebarWidthPx > 0
        ? candidate.sidebarWidthPx
        : undefined,
    tileTitles: sanitizeTileTitles(candidate.tileTitles),
  };
}

function sanitizeTileId(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/**
 * Structural validation of the persisted plot-series table: keys must
 * be plot tile ids, every series a `{topic, fieldPath, color}` record
 * with a hex color, both tables capped. Invalid rows drop individually.
 */
export function sanitizePlotSeries(
  raw: unknown,
): Record<string, readonly McapPersistedPlotSeries[]> | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const result: Record<string, readonly McapPersistedPlotSeries[]> = {};
  let tileCount = 0;
  for (const [tileId, rawSeries] of Object.entries(raw)) {
    if (
      mcapTileTypeFromId(tileId) !== MCAP_TILE_TYPE.PLOT ||
      !Array.isArray(rawSeries)
    ) {
      continue;
    }
    if (tileCount >= MAX_PLOT_TILES) break;

    const series: McapPersistedPlotSeries[] = [];
    for (const entry of rawSeries as unknown[]) {
      if (series.length >= MAX_PLOT_SERIES_PER_TILE) break;
      if (typeof entry !== "object" || entry === null) continue;
      const record = entry as Record<string, unknown>;
      if (
        typeof record.topic === "string" &&
        record.topic.length > 0 &&
        typeof record.fieldPath === "string" &&
        record.fieldPath.length > 0 &&
        typeof record.color === "string" &&
        HEX_COLOR_PATTERN.test(record.color)
      ) {
        series.push({
          color: record.color,
          fieldPath: record.fieldPath,
          topic: record.topic,
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
 * Structural validation of the persisted raw-topic table: keys must be
 * raw tile ids, values non-empty bounded topic strings, table capped.
 * Invalid rows drop individually.
 */
export function sanitizeRawTopics(
  raw: unknown,
): Record<string, string> | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const result: Record<string, string> = {};
  let tileCount = 0;
  for (const [tileId, topic] of Object.entries(raw)) {
    if (
      mcapTileTypeFromId(tileId) !== MCAP_TILE_TYPE.RAW ||
      typeof topic !== "string" ||
      topic.length === 0 ||
      topic.length > MAX_RAW_TOPIC_LENGTH
    ) {
      continue;
    }
    if (tileCount >= MAX_RAW_TILES) break;
    result[tileId] = topic;
    tileCount += 1;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Structural validation of per-map tile settings. Topic arrays are allowed
 * to be empty (the user may hide every GPS topic), topic strings are bounded,
 * and only map tile ids are restored.
 */
export function sanitizeMapSettings(
  raw: unknown,
): Record<string, McapPersistedMapSettings> | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const result: Record<string, McapPersistedMapSettings> = {};
  let tileCount = 0;
  for (const [tileId, settings] of Object.entries(raw)) {
    if (
      tileCount >= MAX_MAP_TILES ||
      mcapTileTypeFromId(tileId) !== MCAP_TILE_TYPE.MAP ||
      typeof settings !== "object" ||
      settings === null ||
      Array.isArray(settings)
    ) {
      continue;
    }

    const record = settings as Record<string, unknown>;
    const baseLayer =
      normalizeMcapMapBaseLayer(record.baseLayer) ??
      DEFAULT_MCAP_MAP_TILE_SETTINGS.baseLayer;
    const enabledTopics = sanitizeMapTopicList(record.enabledTopics);
    const followEgo =
      typeof record.followEgo === "boolean"
        ? record.followEgo
        : DEFAULT_MCAP_MAP_TILE_SETTINGS.followEgo;

    result[tileId] = {
      baseLayer,
      followEgo,
      ...(enabledTopics !== undefined ? { enabledTopics } : {}),
    };
    tileCount += 1;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeMapTopicList(raw: unknown): readonly string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const topics: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (topics.length >= MAX_MAP_TOPICS_PER_TILE) break;
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > MAX_MAP_TOPIC_LENGTH ||
      seen.has(value)
    ) {
      continue;
    }
    seen.add(value);
    topics.push(value);
  }
  return topics;
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
    if (mcapTileTypeFromId(tileId) === null || typeof title !== "string") {
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
  fallback?: McapPersistedModalLayout;
  byDataset: Record<string, PersistedDatasetEntry>;
} | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const version = (parsed as { version?: unknown }).version;
    if (version !== STORAGE_VERSION) {
      if (version === undefined) {
        const legacyFallback = sanitizedFallbackLayout(parsed);
        return legacyFallback
          ? { fallback: legacyFallback, byDataset: {} }
          : null;
      }
      return null;
    }
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
export function readMcapModalLayout(
  datasetKey?: string,
): McapPersistedModalLayout | null {
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
export function writeMcapModalLayout(
  patch: Partial<McapPersistedModalLayout>,
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

function layoutFromDatasetEntry(
  entry: PersistedDatasetEntry,
): McapPersistedModalLayout {
  const { updatedAtMs: _updatedAtMs, ...layout } = entry;
  return layout;
}

function stripDatasetScopedLayoutFields(
  layout: Partial<McapPersistedModalLayout>,
): McapPersistedModalLayout {
  const fallback = { ...layout };
  for (const field of FALLBACK_OMITTED_FIELDS) {
    delete fallback[field];
  }
  return fallback;
}

function sanitizedFallbackLayout(
  raw: unknown,
): McapPersistedModalLayout | undefined {
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
export function mcapTileTypeFromId(tileId: string): string | null {
  const finalDashIndex = tileId.lastIndexOf("-");
  const hasTypeBeforeDash = finalDashIndex > 0;
  const hasSuffixAfterDash = finalDashIndex < tileId.length - 1;

  if (!hasTypeBeforeDash || !hasSuffixAfterDash) {
    return null;
  }

  return tileId.slice(0, finalDashIndex);
}
