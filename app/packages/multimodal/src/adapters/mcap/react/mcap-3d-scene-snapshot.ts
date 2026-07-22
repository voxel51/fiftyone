import type {
  CameraFrustumPanelLayer,
  GridPanelLayer,
  PointCloudPanelLayer,
  SceneAnnotationPanelLayer,
} from "../../../visualization/panels/point-cloud/types";
import type { McapHealthNotice } from "./mcap-health";
import type { Mcap3dPlacementStatus } from "./use-mcap-3d-camera-tracking";

/** Placement state relevant to retaining the last valid 3D scene. */
export type Mcap3dSceneSnapshotReadiness =
  | "ready"
  | "pending"
  | "definitiveMissing";

/** A scene snapshot retained across asynchronous placement transitions. */
export interface HeldMcap3dSceneSnapshot<Snapshot> {
  readonly definitiveMissingSinceMs: number | null;
  readonly key: string;
  readonly retainable: boolean;
  readonly snapshot: Snapshot;
}

/** Why the selector is displaying a previously committed scene. */
export type Mcap3dHeldSceneReason = "pending" | "definitiveMissing";

/** Result of selecting the current or retained 3D scene. */
export interface Mcap3dSceneSnapshotSelection<Snapshot> {
  readonly graceRemainingMs: number | null;
  readonly heldReason: Mcap3dHeldSceneReason | null;
  readonly nextHeld: HeldMcap3dSceneSnapshot<Snapshot> | null;
  readonly snapshot: Snapshot;
}

/** Renderable 3D scene state committed atomically across stream transitions. */
export interface Mcap3dSceneSnapshot {
  readonly annotationLayers: readonly SceneAnnotationPanelLayer[];
  readonly frustumLayers: readonly CameraFrustumPanelLayer[];
  readonly gridLayers: readonly GridPanelLayer[];
  readonly notices: readonly McapHealthNotice[];
  readonly placementStatus: Mcap3dPlacementStatus;
  readonly pointCloudLayers: readonly PointCloudPanelLayer[];
}

/**
 * Removes disabled sources from a held scene without disturbing layers that
 * are still selected. This lets an additive source transition retain useful
 * work while ensuring a source the user disabled disappears immediately.
 */
export function restrictHeldMcap3dSceneSnapshotToTopics(
  held: HeldMcap3dSceneSnapshot<Mcap3dSceneSnapshot> | null,
  selectedTopics: ReadonlySet<string>,
): HeldMcap3dSceneSnapshot<Mcap3dSceneSnapshot> | null {
  if (!held) return null;

  const snapshot = held.snapshot;
  const nextSnapshot: Mcap3dSceneSnapshot = {
    annotationLayers: filterPreservingIdentity(
      snapshot.annotationLayers,
      (layer) =>
        layer.sourceId === undefined || selectedTopics.has(layer.sourceId),
    ),
    frustumLayers: filterPreservingIdentity(snapshot.frustumLayers, (layer) =>
      selectedTopics.has(layer.id),
    ),
    gridLayers: filterPreservingIdentity(snapshot.gridLayers, (layer) =>
      selectedTopics.has(layer.id),
    ),
    notices: filterPreservingIdentity(
      snapshot.notices,
      (notice) =>
        notice.topicId === undefined || selectedTopics.has(notice.topicId),
    ),
    placementStatus: snapshot.placementStatus,
    pointCloudLayers: filterPreservingIdentity(
      snapshot.pointCloudLayers,
      (layer) => selectedTopics.has(layer.id),
    ),
  };
  const retainable = mcap3dSceneSnapshotHasLayers(nextSnapshot);

  return {
    ...held,
    retainable,
    snapshot: sceneSnapshotArraysMatch(snapshot, nextSnapshot)
      ? snapshot
      : nextSnapshot,
  };
}

/** Returns whether a 3D scene contains any source-backed render layers. */
export function mcap3dSceneSnapshotHasLayers(
  snapshot: Mcap3dSceneSnapshot,
): boolean {
  return (
    snapshot.pointCloudLayers.length > 0 ||
    snapshot.annotationLayers.length > 0 ||
    snapshot.gridLayers.length > 0 ||
    snapshot.frustumLayers.length > 0
  );
}

/**
 * Selects a stable 3D scene without hiding persistent placement failures.
 * Pending placement retains the last scene for the same semantic source.
 * Definitively missing placement gets only a bounded grace period, and only
 * while source data still exists; otherwise the current scene commits.
 */
export function selectMcap3dSceneSnapshot<Snapshot>({
  current,
  currentRetainable,
  definitiveMissingGraceMs,
  empty,
  hasSourceData,
  held,
  key,
  nowMs,
  readiness,
}: {
  readonly current: Snapshot;
  readonly currentRetainable: boolean;
  readonly definitiveMissingGraceMs: number;
  readonly empty: Snapshot;
  readonly hasSourceData: boolean;
  readonly held: HeldMcap3dSceneSnapshot<Snapshot> | null;
  readonly key: string;
  readonly nowMs: number;
  readonly readiness: Mcap3dSceneSnapshotReadiness;
}): Mcap3dSceneSnapshotSelection<Snapshot> {
  if (readiness === "ready") {
    return committedSelection(current, currentRetainable, key);
  }

  const matchingHeld = held?.key === key ? held : null;
  if (readiness === "pending") {
    if (matchingHeld?.retainable) {
      const nextHeld = {
        ...matchingHeld,
        definitiveMissingSinceMs: null,
      };
      return {
        graceRemainingMs: null,
        heldReason: "pending",
        nextHeld,
        snapshot: matchingHeld.snapshot,
      };
    }
    return {
      graceRemainingMs: null,
      heldReason: null,
      nextHeld: null,
      snapshot: empty,
    };
  }

  const graceMs = Math.max(0, definitiveMissingGraceMs);
  if (hasSourceData && matchingHeld?.retainable && graceMs > 0) {
    const missingSinceMs =
      matchingHeld.definitiveMissingSinceMs ?? Math.max(0, nowMs);
    const elapsedMs = Math.max(0, nowMs - missingSinceMs);
    const graceRemainingMs = graceMs - elapsedMs;
    if (graceRemainingMs > 0) {
      const nextHeld = {
        ...matchingHeld,
        definitiveMissingSinceMs: missingSinceMs,
      };
      return {
        graceRemainingMs,
        heldReason: "definitiveMissing",
        nextHeld,
        snapshot: matchingHeld.snapshot,
      };
    }
  }

  return committedSelection(current, currentRetainable, key);
}

function committedSelection<Snapshot>(
  snapshot: Snapshot,
  retainable: boolean,
  key: string,
): Mcap3dSceneSnapshotSelection<Snapshot> {
  return {
    graceRemainingMs: null,
    heldReason: null,
    nextHeld: {
      definitiveMissingSinceMs: null,
      key,
      retainable,
      snapshot,
    },
    snapshot,
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
  first: Mcap3dSceneSnapshot,
  second: Mcap3dSceneSnapshot,
): boolean {
  return (
    first.annotationLayers === second.annotationLayers &&
    first.frustumLayers === second.frustumLayers &&
    first.gridLayers === second.gridLayers &&
    first.notices === second.notices &&
    first.pointCloudLayers === second.pointCloudLayers
  );
}
