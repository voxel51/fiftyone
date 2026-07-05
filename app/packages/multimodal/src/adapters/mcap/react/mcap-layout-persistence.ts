import type { MosaicNode } from "react-mosaic-component";
import {
  normalizeMcap3dSceneUpAxis,
  type Mcap3dSceneUpAxis,
} from "./mcap-3d-scene-up";
import { MCAP_TILE_TYPE } from "./mcap-tile-types";

/**
 * Persistence for the MCAP modal's chrome: sidebar visibility, sidebar
 * width, the mosaic tile arrangement, and the currently expanded tile.
 *
 * One localStorage key holding per-dataset entries plus a browser-wide
 * fallback. Samples in a dataset are typically different recordings with
 * the same topic structure, so the arrangement a user settles on should
 * follow them from sample to sample — and datasets with different topic
 * shapes should each keep their own. Every write also updates the
 * fallback, which tracks the latest arrangement anywhere, so a
 * never-seen dataset opens with the same continuity the old
 * browser-wide key provided. Legacy v1 payloads (one browser-wide
 * entry) are read as that fallback layer, so upgrading loses nothing;
 * the first v2 write migrates them into `fallback` for good.
 *
 * Restore is best-effort: anything unreadable or structurally invalid
 * falls back to the built-in defaults (see `use-mcap-modal-layout`).
 */

/**
 * Per-scope persisted fields. Every field is optional — callers fall
 * back per-field, and a dataset entry falls back to the shared
 * `fallback` entry per-field on read.
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

// Bound the persisted plot config so a corrupt or adversarial payload
// cannot balloon the localStorage entry parsed on every modal mount.
const MAX_PLOT_TILES = 32;
const MAX_PLOT_SERIES_PER_TILE = 64;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

interface PersistedDatasetEntry extends McapPersistedModalLayout {
  /** Last-write timestamp; drives least-recently-updated eviction. */
  updatedAtMs: number;
}

interface PersistedStore {
  version: typeof VERSION;
  /** Latest arrangement written anywhere — the never-seen-dataset layer. */
  fallback?: McapPersistedModalLayout;
  byDataset?: Record<string, PersistedDatasetEntry>;
}

const STORAGE_KEY = "fiftyone.mcap.modal-layout";
const VERSION = 2;
const LEGACY_VERSION = 1;

// Cap the per-dataset table so heavy multi-dataset use can't grow the
// payload unboundedly — localStorage is quota'd and the whole key is
// parsed on every modal mount. 20 comfortably covers a user's active
// datasets; least-recently-updated entries beyond that are evicted and
// simply fall back to the shared entry on their next open.
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
    plotSeries: sanitizePlotSeries(candidate.plotSeries),
    sceneUpAxis: normalizeMcap3dSceneUpAxis(candidate.sceneUpAxis),
    sidebarWidthPx:
      typeof candidate.sidebarWidthPx === "number" &&
      Number.isFinite(candidate.sidebarWidthPx) &&
      candidate.sidebarWidthPx > 0
        ? candidate.sidebarWidthPx
        : undefined,
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
 * Parse and sanitize whatever is in storage into the v2 store shape.
 * v1 payloads are read as the fallback layer (their single entry was
 * browser-wide, which is exactly what `fallback` means now).
 */
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
    if (version === LEGACY_VERSION) {
      return { fallback: sanitizeEntry(parsed), byDataset: {} };
    }
    if (version !== VERSION) return null;
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
    return {
      fallback:
        store.fallback === undefined
          ? undefined
          : sanitizeEntry(store.fallback),
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
 * nothing valid is stored. Each field resolves from the dataset's entry
 * first and the browser-wide fallback second; individual fields remain
 * optional — callers fall back per-field.
 */
export function readMcapModalLayout(
  datasetKey?: string,
): McapPersistedModalLayout | null {
  const store = readStore();
  if (!store) return null;
  const entry = datasetKey ? store.byDataset[datasetKey] : undefined;
  const fallback = store.fallback;
  if (!entry && !fallback) return null;
  return {
    expandedTileId: entry?.expandedTileId ?? fallback?.expandedTileId,
    leftSidebarOpen: entry?.leftSidebarOpen ?? fallback?.leftSidebarOpen,
    layout: entry?.layout ?? fallback?.layout,
    // Dataset-scoped on purpose: series reference this dataset's topics,
    // so another dataset's plots must never leak in via the fallback.
    plotSeries: entry?.plotSeries,
    // Dataset-scoped on purpose: world-up conventions are recording-family
    // semantics, not reusable browser chrome.
    sceneUpAxis: entry?.sceneUpAxis,
    sidebarWidthPx: entry?.sidebarWidthPx ?? fallback?.sidebarWidthPx,
  };
}

/**
 * Merge `patch` into the persisted layout. Partial on purpose: sidebar
 * toggles, the width observer, and the layout observer write
 * independently.
 *
 * Writes update both the dataset's entry and the browser-wide fallback:
 * the fallback tracks the latest arrangement anywhere, so a dataset the
 * user has never opened before starts from their most recent
 * arrangement instead of the built-in defaults.
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
    if (datasetKey) {
      byDataset[datasetKey] = {
        ...byDataset[datasetKey],
        ...patch,
        updatedAtMs: Date.now(),
      };
      evictLeastRecentlyUpdated(byDataset);
    }
    // The fallback layer tracks the latest arrangement anywhere, but
    // plot series and scene-up semantics are dataset-scoped — strip them
    // from both the incoming patch and anything an older write left behind.
    const {
      plotSeries: _datasetOnlyPlotSeries,
      sceneUpAxis: _datasetOnlySceneUpAxis,
      ...fallbackPatch
    } = patch;
    const fallback = { ...store?.fallback, ...fallbackPatch };
    delete fallback.plotSeries;
    delete fallback.sceneUpAxis;
    const next: PersistedStore = {
      version: VERSION,
      fallback,
      byDataset,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded / storage unavailable — persisting layout is a
    // nicety, never an error path.
  }
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
