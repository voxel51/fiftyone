import type { MosaicNode } from "react-mosaic-component";

/**
 * Persistence for the MCAP modal's chrome: sidebar visibility and the
 * mosaic tile arrangement.
 *
 * One browser-wide key (not per source): samples in a dataset are
 * typically different recordings with the same topic structure, so the
 * arrangement a user settles on should follow them from sample to
 * sample — a per-source key would reset the layout on every navigation,
 * which defeats the point of remembering it.
 *
 * Restore is best-effort: anything unreadable or structurally invalid
 * falls back to the built-in defaults (see `use-mcap-modal-layout`).
 */

export interface McapPersistedModalLayout {
  version: 1;
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
  /** Mosaic tree whose leaves are tile ids (e.g. `image-default`). */
  layout?: MosaicNode<string> | null;
}

const STORAGE_KEY = "fiftyone.mcap.modal-layout";
const VERSION = 1;

/** True when the value is a structurally valid mosaic tree of tile ids. */
export function isValidMosaicLayout(node: unknown): node is MosaicNode<string> {
  if (typeof node === "string") return node.length > 0;
  if (typeof node !== "object" || node === null) return false;
  const parent = node as Record<string, unknown>;
  return (
    (parent.direction === "row" || parent.direction === "column") &&
    (parent.splitPercentage === undefined ||
      typeof parent.splitPercentage === "number") &&
    isValidMosaicLayout(parent.first) &&
    isValidMosaicLayout(parent.second)
  );
}

/**
 * Read the persisted modal layout, or `null` when nothing valid is
 * stored. Individual fields are still optional — callers fall back
 * per-field.
 */
export function readMcapModalLayout(): McapPersistedModalLayout | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== VERSION
    ) {
      return null;
    }
    const candidate = parsed as McapPersistedModalLayout;
    return {
      version: VERSION,
      leftSidebarOpen:
        typeof candidate.leftSidebarOpen === "boolean"
          ? candidate.leftSidebarOpen
          : undefined,
      rightSidebarOpen:
        typeof candidate.rightSidebarOpen === "boolean"
          ? candidate.rightSidebarOpen
          : undefined,
      layout: isValidMosaicLayout(candidate.layout)
        ? candidate.layout
        : undefined,
    };
  } catch {
    // Corrupt JSON / storage unavailable (private mode, SSR) — behave as
    // if nothing is stored.
    return null;
  }
}

/**
 * Merge `patch` into the persisted layout. Partial on purpose: sidebar
 * toggles and the layout observer write independently.
 */
export function writeMcapModalLayout(
  patch: Partial<Omit<McapPersistedModalLayout, "version">>
): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    const current = readMcapModalLayout();
    const next: McapPersistedModalLayout = {
      version: VERSION,
      ...current,
      ...patch,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded / storage unavailable — persisting layout is a
    // nicety, never an error path.
  }
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
