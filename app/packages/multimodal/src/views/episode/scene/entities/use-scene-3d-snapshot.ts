import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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
  selectedStreams,
}: {
  readonly current: Scene3dSnapshot;
  readonly hasSourceData: boolean;
  readonly key: string;
  readonly readiness: "definitiveMissing" | "pending" | "ready";
  readonly selectedStreams: readonly string[];
}) {
  const heldRef = useRef<HeldScene3dSnapshot<Scene3dSnapshot> | null>(null);
  const [, refresh] = useState(0);
  const selectedStreamSet = useMemo(
    () => new Set(selectedStreams),
    [selectedStreams],
  );
  const currentRetainable = scene3dSnapshotHasLayers(current);
  const selection = selectScene3dSnapshot({
    current,
    currentRetainable,
    definitiveMissingGraceMs: DEFINITIVE_MISSING_SCENE_GRACE_MS,
    empty: emptyScene3dSnapshot(current.placementStatus),
    hasSourceData,
    held: restrictHeldScene3dSnapshotToStreams(
      heldRef.current,
      selectedStreamSet,
    ),
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

/**
 * Removes disabled streams from a held scene without disturbing layers that
 * are still selected. Additive transitions can retain useful work while a
 * stream the user disabled disappears immediately.
 */
export function restrictHeldScene3dSnapshotToStreams(
  held: HeldScene3dSnapshot<Scene3dSnapshot> | null,
  selectedStreams: ReadonlySet<string>,
): HeldScene3dSnapshot<Scene3dSnapshot> | null {
  if (!held) return null;

  const snapshot = held.snapshot;
  const nextSnapshot: Scene3dSnapshot = {
    annotationLayers: filterPreservingIdentity(
      snapshot.annotationLayers,
      (layer) =>
        layer.sourceId === undefined || selectedStreams.has(layer.sourceId),
    ),
    frustumLayers: filterPreservingIdentity(snapshot.frustumLayers, (layer) =>
      selectedStreams.has(layer.id),
    ),
    gridLayers: filterPreservingIdentity(snapshot.gridLayers, (layer) =>
      selectedStreams.has(layer.id),
    ),
    notices: filterPreservingIdentity(
      snapshot.notices,
      (notice) =>
        notice.streamId === undefined || selectedStreams.has(notice.streamId),
    ),
    placementStatus: snapshot.placementStatus,
    pointCloudLayers: filterPreservingIdentity(
      snapshot.pointCloudLayers,
      (layer) => selectedStreams.has(layer.id),
    ),
  };
  const retainable = scene3dSnapshotHasLayers(nextSnapshot);

  return {
    ...held,
    retainable,
    snapshot: sceneSnapshotArraysMatch(snapshot, nextSnapshot)
      ? snapshot
      : nextSnapshot,
  };
}

/** Returns whether a scene contains any source-backed render layers. */
export function scene3dSnapshotHasLayers(snapshot: Scene3dSnapshot): boolean {
  return (
    snapshot.pointCloudLayers.length > 0 ||
    snapshot.annotationLayers.length > 0 ||
    snapshot.gridLayers.length > 0 ||
    snapshot.frustumLayers.length > 0
  );
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

function filterPreservingIdentity<Item>(
  items: readonly Item[],
  predicate: (item: Item) => boolean,
): readonly Item[] {
  const filtered = items.filter(predicate);
  return filtered.length === items.length ? items : filtered;
}

function sceneSnapshotArraysMatch(
  first: Scene3dSnapshot,
  second: Scene3dSnapshot,
): boolean {
  return (
    first.annotationLayers === second.annotationLayers &&
    first.frustumLayers === second.frustumLayers &&
    first.gridLayers === second.gridLayers &&
    first.notices === second.notices &&
    first.pointCloudLayers === second.pointCloudLayers
  );
}
