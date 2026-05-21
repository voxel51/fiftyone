/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useRecoilValue } from "recoil";
import * as internals from "../../recoil/renderConfig3d.atoms";

/**
 * Returns whether the 3D viewer is currently visible in the modal.
 */
export const useIs3dVisible = () =>
  useRecoilValue(internals.groupMediaIs3dVisible);

/**
 * Returns whether the 3D slice selection is currently pinned.
 */
export const useIs3dPinned = () => useRecoilValue(internals.is3dPinned);

/**
 * Returns the list of 3D slice names currently active in the modal.
 */
export const useActive3dSlices = () => useRecoilValue(internals.active3dSlices);
