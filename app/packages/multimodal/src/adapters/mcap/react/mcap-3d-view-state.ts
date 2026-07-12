import type {
  PointCloudCameraPose,
  PointCloudCameraProjection,
} from "../../../visualization/panels/point-cloud";
import type { Mcap3dTrackingMode } from "./mcap-3d-camera";
import type { Mcap3dCameraComposition } from "./mcap-3d-camera-composition";

/** Camera coordinate policy used when navigating between recordings. */
export type Mcap3dCameraNavigationMode = "absolute" | "relative";

/** Safe default for cross-recording camera navigation. */
export const DEFAULT_MCAP_3D_CAMERA_NAVIGATION_MODE: Mcap3dCameraNavigationMode =
  "relative";

/**
 * Inspection-session carry-over of the 3D tile's view state across sample
 * navigation and modal reopen.
 *
 * The modal shell survives sample navigation while source-scoped camera and
 * selection state changes underneath it. This store is the bridge across
 * those source epochs and modal teardown: hooks write through as state changes,
 * then field-by-field compatibility gates decide what applies to the next
 * source. A dataset/media-field registry prevents cross-dataset leakage.
 *
 * This is deliberately a non-reactive store: the access pattern is a one-shot
 * snapshot read at mount plus write-through recording. Camera samples must not
 * become React subscriptions. It is also deliberately memory-only: camera
 * composition survives an accidental modal close, but not a page reload;
 * durable dataset preferences are persisted separately.
 */

/** One displayed camera pose expressed in a recording's world frame. */
export interface Mcap3dCameraViewSnapshot {
  /** Uncontrolled camera pose as last displayed. */
  readonly pose: PointCloudCameraPose;
  /** Recording identity; raw coordinates restore only within this source. */
  readonly sourceKey: string;
  /** World frame the pose was displayed in — the pose is meaningless outside it. */
  readonly worldFrameId: string;
}

/** Session-scoped state carried across 3D source epochs and modal reopen. */
export interface Mcap3dViewStateSnapshot {
  /** How camera intent carries between sample recordings. */
  readonly cameraNavigationMode: Mcap3dCameraNavigationMode;
  /** Last displayed camera view; restore is gated on its world frame. */
  readonly cameraView: Mcap3dCameraViewSnapshot | null;
  /** Session-scoped projection settings carried across sample navigation. */
  readonly cameraProjection: PointCloudCameraProjection | null;
  /** Portable camera intent used across recording boundaries. */
  readonly navigationCompositions: readonly Mcap3dCameraComposition[];
  /** Enabled source ids; only valid against `renderableSourceIds`. */
  readonly enabledSourceIds: readonly string[] | null;
  /** The renderable-source shape the selection state was captured against. */
  readonly renderableSourceIds: readonly string[] | null;
  readonly trackingMode: Mcap3dTrackingMode | null;
  /** Per-topic trajectory frame overrides; gated on `renderableSourceIds`. */
  readonly trajectoryFrameOverrides: Readonly<Record<string, string>> | null;
  /** Camera-target frame; recorded only for explicit user selections. */
  readonly userCameraTargetFrameId: string | null;
  /** World frame; recorded only for explicit user selections. */
  readonly userWorldFrameId: string | null;
}

/** Initial state for a 3D inspection session. */
export const EMPTY_MCAP_3D_VIEW_STATE: Mcap3dViewStateSnapshot = {
  cameraNavigationMode: DEFAULT_MCAP_3D_CAMERA_NAVIGATION_MODE,
  cameraView: null,
  cameraProjection: null,
  navigationCompositions: [],
  enabledSourceIds: null,
  renderableSourceIds: null,
  trajectoryFrameOverrides: null,
  trackingMode: null,
  userCameraTargetFrameId: null,
  userWorldFrameId: null,
};

let restoreOnceKeyCounter = 0;

/** Non-reactive write-through store for one 3D inspection scope. */
export interface Mcap3dViewStateStore {
  clear(): void;
  getSnapshot(): Mcap3dViewStateSnapshot;
  recordCameraView(cameraView: Mcap3dCameraViewSnapshot | null): void;
  recordCameraProjection(projection: PointCloudCameraProjection): void;
  recordCameraNavigationMode(mode: Mcap3dCameraNavigationMode): void;
  recordNavigationCompositions(
    compositions: readonly Mcap3dCameraComposition[],
  ): void;
  recordSourceSelection(selection: {
    readonly enabledSourceIds: readonly string[];
    readonly renderableSourceIds: readonly string[];
  }): void;
  recordTrackingMode(trackingMode: Mcap3dTrackingMode): void;
  recordTrajectoryFrameOverrides(
    overrides: Readonly<Record<string, string>>,
  ): void;
  recordUserCameraTargetFrameId(frameId: string): void;
  recordUserWorldFrameId(frameId: string): void;
}

/** Creates one non-reactive view-state store for one inspection scope. */
export function createMcap3dViewStateStore(): Mcap3dViewStateStore {
  // Replacing the object on every write makes handed-out snapshots immutable
  // by construction without freezing user-owned arrays or records.
  let state = EMPTY_MCAP_3D_VIEW_STATE;

  return {
    clear: () => {
      state = EMPTY_MCAP_3D_VIEW_STATE;
    },
    getSnapshot: () => state,
    recordCameraNavigationMode: (cameraNavigationMode) => {
      state = { ...state, cameraNavigationMode };
    },
    recordCameraView: (cameraView) => {
      state = { ...state, cameraView };
    },
    recordCameraProjection: (cameraProjection) => {
      state = { ...state, cameraProjection };
    },
    recordNavigationCompositions: (navigationCompositions) => {
      state = { ...state, navigationCompositions };
    },
    recordSourceSelection: ({ enabledSourceIds, renderableSourceIds }) => {
      state = { ...state, enabledSourceIds, renderableSourceIds };
    },
    recordTrackingMode: (trackingMode) => {
      state = { ...state, trackingMode };
    },
    recordTrajectoryFrameOverrides: (trajectoryFrameOverrides) => {
      state = { ...state, trajectoryFrameOverrides };
    },
    recordUserCameraTargetFrameId: (userCameraTargetFrameId) => {
      state = { ...state, userCameraTargetFrameId };
    },
    recordUserWorldFrameId: (userWorldFrameId) => {
      state = { ...state, userWorldFrameId };
    },
  };
}

/**
 * Unique key prefix for the "3d view state restored" latency-debug marks.
 * The latency session outlives the tile (it is renderer-scoped), so each
 * mount needs its own onceKey namespace for restore marks.
 */
export function nextMcap3dViewStateRestoreOnceKey(): string {
  restoreOnceKeyCounter += 1;
  return `3d-view-state-restored:${restoreOnceKeyCounter}`;
}

/**
 * Strict shape gate: the snapshot's renderable source ids must equal the new
 * sample's (as sets). Selection state carried across samples is only
 * meaningful when the recordings are same-shaped.
 */
export function mcap3dSourceShapeMatches(
  snapshotSourceIds: readonly string[] | null,
  currentSourceIds: readonly string[],
): boolean {
  if (!snapshotSourceIds) {
    return false;
  }

  const snapshotSet = new Set(snapshotSourceIds);
  const currentSet = new Set(currentSourceIds);
  if (snapshotSet.size !== currentSet.size) {
    return false;
  }
  for (const id of snapshotSet) {
    if (!currentSet.has(id)) {
      return false;
    }
  }

  return true;
}

/** Source-selection state after compatibility checks against a new sample. */
export interface Mcap3dSelectionRestore {
  readonly enabledSourceIds: readonly string[] | null;
  readonly sourceShapeMatches: boolean;
}

/**
 * Resolves the selection slice of a snapshot against the new sample's
 * renderable source ids. On a shape mismatch every field falls back to null,
 * i.e. the caller behaves exactly like a fresh mount.
 */
export function resolveMcap3dSelectionRestore(
  snapshot: Mcap3dViewStateSnapshot | null | undefined,
  currentRenderableSourceIds: readonly string[],
): Mcap3dSelectionRestore {
  const sourceShapeMatches =
    !!snapshot &&
    mcap3dSourceShapeMatches(
      snapshot.renderableSourceIds,
      currentRenderableSourceIds,
    );

  return {
    enabledSourceIds: sourceShapeMatches ? snapshot.enabledSourceIds : null,
    sourceShapeMatches,
  };
}
