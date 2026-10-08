import type { MosaicNode } from "react-mosaic-component";

/**
 * Persistence for the group sample view's tile arrangement: one versioned
 * localStorage key holding a per-dataset table (keyed by dataset id, LRU by
 * update time). A missing or invalid entry means "use the built-in layout".
 */

export interface PersistedGroupLayout {
  /** Mosaic tree whose leaves are tile ids (e.g. `media-default`). */
  readonly layout?: MosaicNode<string> | null;
  /** Tile id rendered expanded over the saved layout, when any. */
  readonly expandedTileId?: string;
}

interface TimestampedEntry {
  readonly updatedAtMs: number;
  readonly value: PersistedGroupLayout;
}

interface Payload {
  readonly version: number;
  readonly byDataset: Record<string, TimestampedEntry>;
}

export const GROUP_LAYOUT_STORAGE_KEY = "fiftyone.sample-view.layout.v1";
/** Key the Spaces-based sample view persisted its tab strip under. */
export const LEGACY_SAMPLE_PANELS_STORAGE_KEY = "fo-sample-modal-plugins";
const STORAGE_VERSION = 1;
// Cap the table (one entry per dataset and layout kind) so heavy
// multi-dataset use can't grow the payload unboundedly; least-recently-
// updated entries are evicted.
const MAX_DATASET_ENTRIES = 40;

/** Which arrangement a dataset entry holds: group content tiles, or one sample tile plus panels. */
export type SampleLayoutKind = "group" | "sample";

/** Table key for one dataset's arrangement of one kind. */
export function layoutScopeKey(
  datasetId: string,
  kind: SampleLayoutKind,
): string {
  return `${datasetId}|${kind}`;
}

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
export function sanitizeGroupLayout(
  raw: unknown,
): PersistedGroupLayout | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const candidate = raw as Record<string, unknown>;
  const result: {
    layout?: MosaicNode<string> | null;
    expandedTileId?: string;
  } = {};
  if (candidate.layout === null) {
    result.layout = null;
  } else if (isValidMosaicLayout(candidate.layout)) {
    result.layout = candidate.layout;
  }
  if (
    typeof candidate.expandedTileId === "string" &&
    candidate.expandedTileId.length > 0
  ) {
    result.expandedTileId = candidate.expandedTileId;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readPayload(): Payload {
  const empty: Payload = { version: STORAGE_VERSION, byDataset: {} };
  const store = storage();
  if (!store) return empty;
  let parsed: unknown;
  try {
    const raw = store.getItem(GROUP_LAYOUT_STORAGE_KEY);
    if (!raw) return empty;
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (typeof parsed !== "object" || parsed === null) return empty;
  const payload = parsed as Record<string, unknown>;
  if (payload.version !== STORAGE_VERSION) return empty;
  const table = payload.byDataset;
  if (typeof table !== "object" || table === null) return empty;

  const byDataset: Record<string, TimestampedEntry> = {};
  for (const [datasetId, rawEntry] of Object.entries(table)) {
    if (typeof rawEntry !== "object" || rawEntry === null) continue;
    const entry = rawEntry as Record<string, unknown>;
    const value = sanitizeGroupLayout(entry.value);
    const updatedAtMs =
      typeof entry.updatedAtMs === "number" &&
      Number.isFinite(entry.updatedAtMs)
        ? entry.updatedAtMs
        : 0;
    if (value) byDataset[datasetId] = { updatedAtMs, value };
  }
  return { version: STORAGE_VERSION, byDataset };
}

function writePayload(payload: Payload): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(GROUP_LAYOUT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota or privacy mode: persistence is best-effort
  }
}

/** The persisted layout for `datasetId`, or `null` when nothing valid is stored. */
export function readGroupLayout(
  datasetId: string,
): PersistedGroupLayout | null {
  return readPayload().byDataset[datasetId]?.value ?? null;
}

/**
 * Replace the persisted entry for `datasetId` and bump it to most recently
 * used, evicting the least recently updated entries beyond the cap.
 */
export function writeGroupLayout(
  value: PersistedGroupLayout,
  datasetId: string,
): void {
  const { byDataset } = readPayload();
  const sanitized = sanitizeGroupLayout(value);
  if (!sanitized) {
    delete byDataset[datasetId];
  } else {
    byDataset[datasetId] = { updatedAtMs: Date.now(), value: sanitized };
  }
  const entries = Object.entries(byDataset)
    .sort(([, a], [, b]) => b.updatedAtMs - a.updatedAtMs)
    .slice(0, MAX_DATASET_ENTRIES);
  writePayload({
    version: STORAGE_VERSION,
    byDataset: Object.fromEntries(entries),
  });
}
