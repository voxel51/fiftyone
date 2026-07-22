import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type {
  CameraFrustumPanelLayer,
  GridPanelLayer,
  PointCloudPanelLayer,
  SceneAnnotationPanelLayer,
} from "../../../../visualization/scene-3d/types";
import type { HealthNotice } from "../../status/health";
import type { Scene3dPlacementStatus } from "../camera/use-scene-3d-camera-tracking";
import {
  selectScene3dSnapshot,
  type HeldScene3dSnapshot,
} from "./scene-3d-scene-snapshot";

const DEFINITIVE_MISSING_SCENE_GRACE_MS = 2_000;

/** Renderable scene state retained across placement transitions. */
export interface Scene3dSnapshot {
  readonly annotationLayers: readonly SceneAnnotationPanelLayer[];
  readonly frustumLayers: readonly CameraFrustumPanelLayer[];
  readonly gridLayers: readonly GridPanelLayer[];
  readonly notices: readonly HealthNotice[];
  readonly placementStatus: Scene3dPlacementStatus;
  readonly pointCloudLayers: readonly PointCloudPanelLayer[];
}

/** Holds the last renderable scene through source and transform catch-up. */
export function useScene3dSnapshot({
  current,
  hasSourceData,
  key,
  readiness,
}: {
  readonly current: Scene3dSnapshot;
  readonly hasSourceData: boolean;
  readonly key: string;
  readonly readiness: "definitiveMissing" | "pending" | "ready";
}) {
  const heldRef = useRef<HeldScene3dSnapshot<Scene3dSnapshot> | null>(null);
  const [, refresh] = useState(0);
  const currentRetainable =
    current.pointCloudLayers.length > 0 ||
    current.annotationLayers.length > 0 ||
    current.gridLayers.length > 0 ||
    current.frustumLayers.length > 0;
  const selection = selectScene3dSnapshot({
    current,
    currentRetainable,
    definitiveMissingGraceMs: DEFINITIVE_MISSING_SCENE_GRACE_MS,
    empty: emptyScene3dSnapshot(current.placementStatus),
    hasSourceData,
    held: heldRef.current,
    key,
    nowMs: Date.now(),
    readiness,
  });

  // This layout effect commits the selected held snapshot before paint.
  useLayoutEffect(() => {
    heldRef.current = selection.nextHeld;
  }, [selection.nextHeld]);

  // This effect expires the bounded definitive-missing grace period.
  useEffect(() => {
    if (selection.graceRemainingMs === null) return undefined;
    const timer = setTimeout(
      () => refresh((version) => version + 1),
      selection.graceRemainingMs,
    );
    return () => clearTimeout(timer);
  }, [selection.graceRemainingMs]);

  return selection;
}

function emptyScene3dSnapshot(
  placementStatus: Scene3dPlacementStatus,
): Scene3dSnapshot {
  return {
    annotationLayers: [],
    frustumLayers: [],
    gridLayers: [],
    notices: [],
    placementStatus,
    pointCloudLayers: [],
  };
}
