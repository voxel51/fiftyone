import { atom, getDefaultStore, type PrimitiveAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";

import type { PointCloudCameraPose } from "../../../visualization/panels/point-cloud";

const GRID_CAMERA_SCOPE_TTL_MS = 30 * 60 * 1000;
const MAX_GRID_CAMERA_SCOPES = 32;
const cameraPoseAtomsByScope = new Map<
  string,
  {
    activeMounts: number;
    readonly atom: PrimitiveAtom<PointCloudCameraPose | null>;
    lastAccessedAtMs: number;
  }
>();

/**
 * Shared camera pose for 3D episode grid previews.
 */
export function useEpisodeGridCameraPose(scopeKey: string, enabled = true) {
  const store = getDefaultStore();
  const poseAtom = cameraPoseAtomForScope(scopeKey);
  const [pose, setPose] = useState(() => store.get(poseAtom));

  // This effect keeps the scope in the registry while a preview references it.
  useEffect(
    () => retainCameraPoseScope(scopeKey, poseAtom),
    [poseAtom, scopeKey],
  );

  // This effect refreshes registry recency and evicts idle scopes after each
  // render without introducing registry bookkeeping into React state.
  useEffect(() => {
    touchAndEvictCameraPoseScopes(scopeKey, poseAtom);
  });

  // This effect subscribes only previews that are actively rendering.
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    setPose(store.get(poseAtom));
    return store.sub(poseAtom, () => {
      setPose(store.get(poseAtom));
    });
  }, [enabled, poseAtom, store]);

  const updatePose = useCallback(
    (nextPose: PointCloudCameraPose | null) => {
      store.set(poseAtom, nextPose);
    },
    [poseAtom, store],
  );

  // Read synchronously on re-entry so the first active render cannot schedule
  // a snapshot with the stale pose retained while this cell was hidden.
  const currentPose = enabled ? store.get(poseAtom) : pose;
  return [currentPose, updatePose] as const;
}

/**
 * Clears in-memory episode grid camera state for tests.
 */
export function __resetEpisodeGridCameraPoseForTests() {
  cameraPoseAtomsByScope.clear();
}

function cameraPoseAtomForScope(scopeKey: string) {
  const existing = cameraPoseAtomsByScope.get(scopeKey);
  if (existing) {
    return existing.atom;
  }

  const poseAtom = atom<PointCloudCameraPose | null>(null);
  cameraPoseAtomsByScope.set(scopeKey, {
    activeMounts: 0,
    atom: poseAtom,
    lastAccessedAtMs: 0,
  });
  return poseAtom;
}

function retainCameraPoseScope(
  scopeKey: string,
  poseAtom: PrimitiveAtom<PointCloudCameraPose | null>,
) {
  let entry = cameraPoseAtomsByScope.get(scopeKey);
  if (!entry || entry.atom !== poseAtom) {
    entry = {
      activeMounts: 0,
      atom: poseAtom,
      lastAccessedAtMs: 0,
    };
    cameraPoseAtomsByScope.set(scopeKey, entry);
  }
  entry.activeMounts += 1;

  return () => {
    const current = cameraPoseAtomsByScope.get(scopeKey);
    if (!current || current.atom !== poseAtom) return;
    current.activeMounts = Math.max(0, current.activeMounts - 1);
    evictExpiredCameraPoseScopes(Date.now());
    evictInactiveCameraPoseScopesToLimit();
  };
}

function touchAndEvictCameraPoseScopes(
  scopeKey: string,
  poseAtom: PrimitiveAtom<PointCloudCameraPose | null>,
) {
  const entry = cameraPoseAtomsByScope.get(scopeKey);
  if (!entry || entry.atom !== poseAtom) return;
  entry.lastAccessedAtMs = Date.now();
  cameraPoseAtomsByScope.delete(scopeKey);
  cameraPoseAtomsByScope.set(scopeKey, entry);
  evictExpiredCameraPoseScopes(entry.lastAccessedAtMs);
  evictInactiveCameraPoseScopesToLimit(scopeKey);
}

function evictExpiredCameraPoseScopes(now: number) {
  for (const [key, entry] of cameraPoseAtomsByScope) {
    if (
      entry.activeMounts === 0 &&
      now - entry.lastAccessedAtMs > GRID_CAMERA_SCOPE_TTL_MS
    ) {
      cameraPoseAtomsByScope.delete(key);
    }
  }
}

function evictInactiveCameraPoseScopesToLimit(protectedScopeKey?: string) {
  while (cameraPoseAtomsByScope.size > MAX_GRID_CAMERA_SCOPES) {
    const oldestInactive = [...cameraPoseAtomsByScope].find(
      ([key, entry]) => key !== protectedScopeKey && entry.activeMounts === 0,
    );
    if (!oldestInactive) break;
    cameraPoseAtomsByScope.delete(oldestInactive[0]);
  }
}
