import type React from "react";
import { createMcapTileRegistry } from "./mcap-tile-registry";

/**
 * Modal-scoped registry of tile settings content, keyed by tile id.
 *
 * Successor to the tiling DOM-portal slot (`setSettingsSlotEl` +
 * `TileSettingsContent`): a tile registers its settings as a React element
 * and the sidebar renders it inside its own tree, so the settings UI is
 * ordinary composition — the sidebar can wrap it (status strips, scroll
 * containers) and React devtools match what is on screen. Tiles that still
 * portal keep working; the sidebar prefers a registration when the focused
 * tile has one and falls back to the slot otherwise.
 */
const registry = createMcapTileRegistry<React.ReactNode>("McapTileSettings");

export const McapTileSettingsProvider = registry.Provider;

/**
 * Publishes a tile's settings element for its mounted lifetime. Memoize the
 * element so re-registrations track real settings changes, not renders.
 */
export const useRegisterMcapTileSettings = registry.useRegister;

/** The focused tile's registered settings element, or null to use the slot. */
export function useMcapTileSettings(
  tileId: string | null | undefined,
): React.ReactNode | null {
  const entries = registry.useEntries();
  return (tileId ? entries.get(tileId) : null) ?? null;
}
