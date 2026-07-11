import { atom, getDefaultStore } from "jotai";
import { useCallback, useEffect, useState } from "react";

import type { PointCloudCameraPose } from "../../../visualization/panels/point-cloud";

const mcapGridCameraPoseAtom = atom(null as PointCloudCameraPose | null);

/**
 * Shared camera pose for 3D MCAP grid previews.
 */
export function useMcapGridCameraPose(enabled = true) {
  const store = getDefaultStore();
  const [pose, setPose] = useState(() => store.get(mcapGridCameraPoseAtom));

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    setPose(store.get(mcapGridCameraPoseAtom));
    return store.sub(mcapGridCameraPoseAtom, () => {
      setPose(store.get(mcapGridCameraPoseAtom));
    });
  }, [enabled, store]);

  const updatePose = useCallback(
    (nextPose: PointCloudCameraPose | null) => {
      store.set(mcapGridCameraPoseAtom, nextPose);
    },
    [store],
  );

  // Read synchronously on re-entry so the first active render cannot schedule
  // a snapshot with the stale pose retained while this cell was hidden.
  const currentPose = enabled ? store.get(mcapGridCameraPoseAtom) : pose;
  return [currentPose, updatePose] as const;
}

/**
 * Clears in-memory MCAP grid camera state for tests.
 */
export function __resetMcapGridCameraPoseForTests() {
  getDefaultStore().set(mcapGridCameraPoseAtom, null);
}
