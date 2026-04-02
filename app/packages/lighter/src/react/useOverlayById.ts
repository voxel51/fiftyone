/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { BaseOverlay } from "../overlay/BaseOverlay";
import { useLighter } from "./useLighter";

/**
 * Look up an overlay by ID from the current Lighter scene.
 *
 * Components should store overlay **IDs** in state (serializable) and resolve
 * the live overlay object at render time via this hook.
 */
export const useOverlayById = (id: string | null): BaseOverlay | null => {
  const { getOverlay } = useLighter();
  return id ? getOverlay(id) ?? null : null;
};
