import type { MosaicNode } from "react-mosaic-component";
import { collectTileIds } from "../views/MosaicGrid/MosaicGrid";
import type { TilingTile } from "./types";

const KEY_PREFIX = "fiftyone.tiling.layout";

function storageKey(datasetId: string): string {
  return `${KEY_PREFIX}.${datasetId}`;
}

/**
 * Reads a persisted mosaic layout for the given dataset from localStorage.
 *
 * Returns `undefined` when:
 * - `datasetId` is not provided
 * - nothing has been saved yet
 * - the saved value fails to parse
 * - any tile id in the saved layout is absent from `knownTiles` (graceful
 *   degradation when the dataset's available streams change between sessions)
 */
export function loadLayout(
  datasetId: string | undefined,
  knownTiles: Record<string, TilingTile> | undefined
): MosaicNode<string> | undefined {
  if (!datasetId) return undefined;
  try {
    const raw = localStorage.getItem(storageKey(datasetId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as MosaicNode<string>;
    const knownIds = new Set(Object.keys(knownTiles ?? {}));
    const valid = collectTileIds(parsed).every((id) => knownIds.has(id));
    return valid ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Writes the current mosaic layout for the given dataset to localStorage.
 * Passing `null` clears the entry. No-ops when `datasetId` is not provided
 * or when localStorage is unavailable.
 */
export function saveLayout(
  datasetId: string | undefined,
  layout: MosaicNode<string> | null
): void {
  if (!datasetId) return;
  try {
    if (layout === null) {
      localStorage.removeItem(storageKey(datasetId));
    } else {
      localStorage.setItem(storageKey(datasetId), JSON.stringify(layout));
    }
  } catch {
    // localStorage unavailable (private browsing quota, SSR, etc.)
  }
}
