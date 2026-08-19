import type {
  PointCloudCameraPose,
  PointCloudCameraProjection,
} from "../../../../visualization/scene-3d/index";
import type { Scene3dTrackingMode } from "./scene-3d-camera";
import type { Scene3dCameraComposition } from "./scene-3d-camera-composition";

/** Camera coordinate policy used when navigating between recordings. */
export type Scene3dCameraNavigationMode = "absolute" | "relative";

/** Safe default for cross-recording camera navigation. */
export const DEFAULT_SCENE_3D_CAMERA_NAVIGATION_MODE: Scene3dCameraNavigationMode =
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
 * become React subscriptions. Recording-local poses remain memory-only; the
 * provider separately persists portable camera compositions for reloads.
 */

/** One displayed camera pose expressed in a recording's world frame. */
export interface Scene3dCameraViewSnapshot {
  /** Uncontrolled camera pose as last displayed. */
  readonly pose: PointCloudCameraPose;
  /** Recording identity; raw coordinates restore only within this source. */
  readonly sourceKey: string;
  /** World frame the pose was displayed in — the pose is meaningless outside it. */
  readonly worldFrameId: string;
}

/** Session-scoped state carried across 3D source epochs and modal reopen. */
export interface Scene3dViewStateSnapshot {
  /** How camera intent carries between sample recordings. */
  readonly cameraNavigationMode: Scene3dCameraNavigationMode;
  /** Last displayed camera view; restore is gated on its world frame. */
  readonly cameraView: Scene3dCameraViewSnapshot | null;
  /** Session-scoped projection settings carried across sample navigation. */
  readonly cameraProjection: PointCloudCameraProjection | null;
  /** Portable camera intent used across recording boundaries. */
  readonly navigationCompositions: readonly Scene3dCameraComposition[];
  /** Enabled source ids; only valid against `renderableSourceIds`. */
  readonly enabledSourceIds: readonly string[] | null;
  /** Recording-local renderable ids the selection state was captured against. */
  readonly renderableSourceIds: readonly string[] | null;
  /** Stable semantic source keys used to gate cross-recording camera intent. */
  readonly renderableSourceKeys: readonly string[] | null;
  readonly trackingMode: Scene3dTrackingMode | null;
  /** Per-stream trajectory frame overrides; gated on `renderableSourceIds`. */
  readonly trajectoryFrameOverrides: Readonly<Record<string, string>> | null;
  /** Camera-target frame; recorded only for explicit user selections. */
  readonly userCameraTargetFrameId: string | null;
  /** World frame; recorded only for explicit user selections. */
  readonly userWorldFrameId: string | null;
}

/** Initial state for a 3D inspection session. */
export const EMPTY_SCENE_3D_VIEW_STATE: Scene3dViewStateSnapshot = {
  cameraNavigationMode: DEFAULT_SCENE_3D_CAMERA_NAVIGATION_MODE,
  cameraView: null,
  cameraProjection: null,
  navigationCompositions: [],
  enabledSourceIds: null,
  renderableSourceIds: null,
  renderableSourceKeys: null,
  trajectoryFrameOverrides: null,
  trackingMode: null,
  userCameraTargetFrameId: null,
  userWorldFrameId: null,
};

/** Non-reactive write-through store for one 3D inspection scope. */
export interface Scene3dViewStateStore {
  clear(): void;
  getSnapshot(): Scene3dViewStateSnapshot;
  recordCameraView(cameraView: Scene3dCameraViewSnapshot | null): void;
  recordCameraProjection(projection: PointCloudCameraProjection): void;
  recordCameraNavigationMode(mode: Scene3dCameraNavigationMode): void;
  recordNavigationCompositions(
    compositions: readonly Scene3dCameraComposition[],
  ): void;
  recordSourceSelection(selection: {
    readonly enabledSourceIds: readonly string[];
    readonly renderableSourceIds: readonly string[];
    readonly renderableSourceKeys: readonly string[];
  }): void;
  recordTrackingMode(trackingMode: Scene3dTrackingMode): void;
  recordTrajectoryFrameOverrides(
    overrides: Readonly<Record<string, string>>,
  ): void;
  recordUserCameraTargetFrameId(frameId: string): void;
  recordUserWorldFrameId(frameId: string | null): void;
}

/** Creates one non-reactive view-state store for one inspection scope. */
export function createScene3dViewStateStore(options?: {
  readonly initialState?: Partial<Scene3dViewStateSnapshot>;
  readonly onChange?: (snapshot: Scene3dViewStateSnapshot) => void;
}): Scene3dViewStateStore {
  // Replacing the object on every write makes handed-out snapshots immutable
  // by construction without freezing user-owned arrays or records.
  let state: Scene3dViewStateSnapshot = {
    ...EMPTY_SCENE_3D_VIEW_STATE,
    ...options?.initialState,
  };
  const replace = (patch: Partial<Scene3dViewStateSnapshot>) => {
    state = { ...state, ...patch };
    options?.onChange?.(state);
  };

  return {
    clear: () => {
      state = EMPTY_SCENE_3D_VIEW_STATE;
      options?.onChange?.(state);
    },
    getSnapshot: () => state,
    recordCameraNavigationMode: (cameraNavigationMode) => {
      replace({ cameraNavigationMode });
    },
    recordCameraView: (cameraView) => {
      replace({ cameraView });
    },
    recordCameraProjection: (cameraProjection) => {
      replace({ cameraProjection });
    },
    recordNavigationCompositions: (navigationCompositions) => {
      replace({ navigationCompositions });
    },
    recordSourceSelection: ({
      enabledSourceIds,
      renderableSourceIds,
      renderableSourceKeys,
    }) => {
      replace({
        enabledSourceIds,
        renderableSourceIds,
        renderableSourceKeys,
      });
    },
    recordTrackingMode: (trackingMode) => {
      replace({ trackingMode });
    },
    recordTrajectoryFrameOverrides: (trajectoryFrameOverrides) => {
      replace({ trajectoryFrameOverrides });
    },
    recordUserCameraTargetFrameId: (userCameraTargetFrameId) => {
      replace({ userCameraTargetFrameId });
    },
    recordUserWorldFrameId: (userWorldFrameId) => {
      replace({ userWorldFrameId });
    },
  };
}

/**
 * Strict shape gate: the snapshot's source-shape tokens must equal the current
 * tokens (as sets). Callers choose recording-local ids or semantic keys based
 * on whether the persisted state may cross recording boundaries.
 */
export function scene3dSourceShapeMatches(
  snapshotSourceShape: readonly string[] | null,
  currentSourceShape: readonly string[],
): boolean {
  if (!snapshotSourceShape) {
    return false;
  }

  const snapshotSet = new Set(snapshotSourceShape);
  const currentSet = new Set(currentSourceShape);
  if (snapshotSet.size !== currentSet.size) {
    return false;
  }
  for (const token of snapshotSet) {
    if (!currentSet.has(token)) {
      return false;
    }
  }

  return true;
}

/** Source-selection state after compatibility checks against a new sample. */
export interface Scene3dSelectionRestore {
  readonly enabledSourceIds: readonly string[] | null;
  readonly sourceShapeMatches: boolean;
}

/**
 * Resolves the selection slice of a snapshot against the new sample's
 * renderable source ids. On a shape mismatch every field falls back to null,
 * i.e. the caller behaves exactly like a fresh mount.
 */
export function resolveScene3dSelectionRestore(
  snapshot: Scene3dViewStateSnapshot | null | undefined,
  currentRenderableSourceIds: readonly string[],
): Scene3dSelectionRestore {
  const sourceShapeMatches =
    !!snapshot &&
    scene3dSourceShapeMatches(
      snapshot.renderableSourceIds,
      currentRenderableSourceIds,
    );

  return {
    enabledSourceIds: sourceShapeMatches ? snapshot.enabledSourceIds : null,
    sourceShapeMatches,
  };
}
