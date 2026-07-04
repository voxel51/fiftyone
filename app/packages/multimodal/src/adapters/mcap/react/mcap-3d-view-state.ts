import type { PointCloudCameraPose } from "../../../visualization/panels/point-cloud";
import type {
  Mcap3dCameraTrackingAnchor,
  Mcap3dTrackingMode,
} from "./mcap-3d-camera";

/**
 * Session-scoped carry-over of the 3D tile's view state across sample
 * navigation.
 *
 * The 3D tile lives inside the modal renderer's keyed remount boundary, so
 * all of its view state (camera pose, frame selections, enabled sources,
 * trajectory overrides) is torn down on every sample hop. This module is the
 * bridge across that boundary: the tile's hooks write their state through as
 * it changes, the next mount reads one snapshot back, and field-by-field
 * compatibility gates decide what applies. The renderer clears the store when
 * the modal closes (it persists across hops and unmounts only then).
 *
 * This is a deliberate plain module-level store, not a Jotai atom (the default
 * choice for new state): this package has no jotai dependency, and the access
 * pattern is a one-shot snapshot read at mount plus write-through recording —
 * there are no reactive subscribers, so an atom would add a dependency without
 * adding behavior. It is also deliberately memory-only (unlike the
 * localStorage-backed toggles in `mcap-modal-settings.tsx`): a camera pose or
 * frame selection is only meaningful within one modal session.
 */

export interface Mcap3dCameraViewSnapshot {
  /** Uncontrolled camera pose as last displayed. */
  readonly pose: PointCloudCameraPose;
  /** World frame the pose was displayed in — the pose is meaningless outside it. */
  readonly worldFrameId: string;
}

export interface Mcap3dViewStateSnapshot {
  /** Last displayed camera view; restore is gated on its world frame. */
  readonly cameraView: Mcap3dCameraViewSnapshot | null;
  /** Enabled source ids; only valid against `renderableSourceIds`. */
  readonly enabledSourceIds: readonly string[] | null;
  /** The renderable-source shape the selection state was captured against. */
  readonly renderableSourceIds: readonly string[] | null;
  /** Follow-mode anchor; carries its own mode/world/target frame gates. */
  readonly trackingAnchor: Mcap3dCameraTrackingAnchor | null;
  readonly trackingMode: Mcap3dTrackingMode | null;
  /** Per-topic trajectory frame overrides; gated on `renderableSourceIds`. */
  readonly trajectoryFrameOverrides: Readonly<Record<string, string>> | null;
  /** Camera-target frame; recorded only for explicit user selections. */
  readonly userCameraTargetFrameId: string | null;
  /** World frame; recorded only for explicit user selections. */
  readonly userWorldFrameId: string | null;
}

export const EMPTY_MCAP_3D_VIEW_STATE: Mcap3dViewStateSnapshot = {
  cameraView: null,
  enabledSourceIds: null,
  renderableSourceIds: null,
  trackingAnchor: null,
  trajectoryFrameOverrides: null,
  trackingMode: null,
  userCameraTargetFrameId: null,
  userWorldFrameId: null,
};

// The state object is replaced (never mutated) on every write, so a snapshot
// returned by `getMcap3dViewStateSnapshot` is frozen in time by construction.
let state: Mcap3dViewStateSnapshot = EMPTY_MCAP_3D_VIEW_STATE;
let restoreOnceKeyCounter = 0;

export function getMcap3dViewStateSnapshot(): Mcap3dViewStateSnapshot {
  return state;
}

export function recordMcap3dSourceSelection({
  enabledSourceIds,
  renderableSourceIds,
}: {
  readonly enabledSourceIds: readonly string[];
  readonly renderableSourceIds: readonly string[];
}): void {
  state = { ...state, enabledSourceIds, renderableSourceIds };
}

export function recordMcap3dTrajectoryFrameOverrides(
  trajectoryFrameOverrides: Readonly<Record<string, string>>,
): void {
  state = { ...state, trajectoryFrameOverrides };
}

export function recordMcap3dTrackingMode(
  trackingMode: Mcap3dTrackingMode,
): void {
  state = { ...state, trackingMode };
}

export function recordMcap3dUserWorldFrameId(frameId: string): void {
  state = { ...state, userWorldFrameId: frameId };
}

export function recordMcap3dUserCameraTargetFrameId(frameId: string): void {
  state = { ...state, userCameraTargetFrameId: frameId };
}

export function recordMcap3dCameraView(
  cameraView: Mcap3dCameraViewSnapshot,
): void {
  state = { ...state, cameraView };
}

export function recordMcap3dTrackingAnchor(
  trackingAnchor: Mcap3dCameraTrackingAnchor,
): void {
  state = { ...state, trackingAnchor };
}

export function clearMcap3dViewState(): void {
  state = EMPTY_MCAP_3D_VIEW_STATE;
}

export function resetMcap3dViewStateForTests(): void {
  clearMcap3dViewState();
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
