import type {
  PointCloudCameraPose,
  PointCloudCameraProjection,
} from "../../../../visualization/scene-3d/index";
import type { Episode3dTrackingMode } from "./episode-3d-camera";
import type { Episode3dCameraComposition } from "./episode-3d-camera-composition";

/** Camera coordinate policy used when navigating between recordings. */
export type Episode3dCameraNavigationMode = "absolute" | "relative";

/** Safe default for cross-recording camera navigation. */
export const DEFAULT_EPISODE_3D_CAMERA_NAVIGATION_MODE: Episode3dCameraNavigationMode =
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
export interface Episode3dCameraViewSnapshot {
  /** Uncontrolled camera pose as last displayed. */
  readonly pose: PointCloudCameraPose;
  /** Recording identity; raw coordinates restore only within this source. */
  readonly sourceKey: string;
  /** World frame the pose was displayed in — the pose is meaningless outside it. */
  readonly worldFrameId: string;
}

/** Session-scoped state carried across 3D source epochs and modal reopen. */
export interface Episode3dViewStateSnapshot {
  /** How camera intent carries between sample recordings. */
  readonly cameraNavigationMode: Episode3dCameraNavigationMode;
  /** Last displayed camera view; restore is gated on its world frame. */
  readonly cameraView: Episode3dCameraViewSnapshot | null;
  /** Session-scoped projection settings carried across sample navigation. */
  readonly cameraProjection: PointCloudCameraProjection | null;
  /** Portable camera intent used across recording boundaries. */
  readonly navigationCompositions: readonly Episode3dCameraComposition[];
  /** Enabled source ids; only valid against `renderableSourceIds`. */
  readonly enabledSourceIds: readonly string[] | null;
  /** The renderable-source shape the selection state was captured against. */
  readonly renderableSourceIds: readonly string[] | null;
  readonly trackingMode: Episode3dTrackingMode | null;
  /** Per-stream trajectory frame overrides; gated on `renderableSourceIds`. */
  readonly trajectoryFrameOverrides: Readonly<Record<string, string>> | null;
  /** Camera-target frame; recorded only for explicit user selections. */
  readonly userCameraTargetFrameId: string | null;
  /** World frame; recorded only for explicit user selections. */
  readonly userWorldFrameId: string | null;
}

/** Initial state for a 3D inspection session. */
export const EMPTY_EPISODE_3D_VIEW_STATE: Episode3dViewStateSnapshot = {
  cameraNavigationMode: DEFAULT_EPISODE_3D_CAMERA_NAVIGATION_MODE,
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
export interface Episode3dViewStateStore {
  clear(): void;
  getSnapshot(): Episode3dViewStateSnapshot;
  recordCameraView(cameraView: Episode3dCameraViewSnapshot | null): void;
  recordCameraProjection(projection: PointCloudCameraProjection): void;
  recordCameraNavigationMode(mode: Episode3dCameraNavigationMode): void;
  recordNavigationCompositions(
    compositions: readonly Episode3dCameraComposition[],
  ): void;
  recordSourceSelection(selection: {
    readonly enabledSourceIds: readonly string[];
    readonly renderableSourceIds: readonly string[];
  }): void;
  recordTrackingMode(trackingMode: Episode3dTrackingMode): void;
  recordTrajectoryFrameOverrides(
    overrides: Readonly<Record<string, string>>,
  ): void;
  recordUserCameraTargetFrameId(frameId: string): void;
  recordUserWorldFrameId(frameId: string | null): void;
}

/** Creates one non-reactive view-state store for one inspection scope. */
export function createEpisode3dViewStateStore(): Episode3dViewStateStore {
  // Replacing the object on every write makes handed-out snapshots immutable
  // by construction without freezing user-owned arrays or records.
  let state = EMPTY_EPISODE_3D_VIEW_STATE;

  return {
    clear: () => {
      state = EMPTY_EPISODE_3D_VIEW_STATE;
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
export function nextEpisode3dViewStateRestoreOnceKey(): string {
  restoreOnceKeyCounter += 1;
  return `3d-view-state-restored:${restoreOnceKeyCounter}`;
}

/**
 * Strict shape gate: the snapshot's renderable source ids must equal the new
 * sample's (as sets). Selection state carried across samples is only
 * meaningful when the recordings are same-shaped.
 */
export function episode3dSourceShapeMatches(
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
export interface Episode3dSelectionRestore {
  readonly enabledSourceIds: readonly string[] | null;
  readonly sourceShapeMatches: boolean;
}

/**
 * Resolves the selection slice of a snapshot against the new sample's
 * renderable source ids. On a shape mismatch every field falls back to null,
 * i.e. the caller behaves exactly like a fresh mount.
 */
export function resolveEpisode3dSelectionRestore(
  snapshot: Episode3dViewStateSnapshot | null | undefined,
  currentRenderableSourceIds: readonly string[],
): Episode3dSelectionRestore {
  const sourceShapeMatches =
    !!snapshot &&
    episode3dSourceShapeMatches(
      snapshot.renderableSourceIds,
      currentRenderableSourceIds,
    );

  return {
    enabledSourceIds: sourceShapeMatches ? snapshot.enabledSourceIds : null,
    sourceShapeMatches,
  };
}
