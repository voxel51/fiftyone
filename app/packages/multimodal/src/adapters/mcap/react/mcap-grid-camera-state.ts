import { atom, getDefaultStore, useAtom } from "jotai";

import type { PointCloudCameraPose } from "../../../visualization/panels/point-cloud";

const mcapGridCameraPoseAtom = atom<PointCloudCameraPose | null>(null);

/**
 * Shared camera pose for 3D MCAP grid previews.
 */
export function useMcapGridCameraPose() {
  return useAtom(mcapGridCameraPoseAtom);
}

/**
 * Clears in-memory MCAP grid camera state for tests.
 */
export function __resetMcapGridCameraPoseForTests() {
  getDefaultStore().set(mcapGridCameraPoseAtom, null);
}
