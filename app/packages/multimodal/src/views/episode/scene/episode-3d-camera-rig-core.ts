import type { PointCloudCameraPose } from "../../../visualization/panels/point-cloud";
import {
  cameraPoseFromTrackingAnchor,
  cameraTrackingAnchorFromPose,
  isFollowTrackingMode,
  trackingAnchorMatches,
  type CameraTargetResolution,
  type Episode3dCameraTargetPose,
  type Episode3dCameraTrackingAnchor,
  type Episode3dTrackingMode,
} from "./episode-3d-camera";
import type { Episode3dSceneUpAxis } from "./episode-3d-scene-up";

// OrbitControls brackets every wheel event in its own start/end pair, so a
// wheel zoom emits many micro-gestures. The trailing debounce coalesces a
// burst into one commit; for pointer drags it only delays persistence by an
// imperceptible beat.
export const RIG_COMMIT_DEBOUNCE_MS = 200;

interface MutableVectorHandle {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  set: (x: number, y: number, z: number) => unknown;
}

export interface RigCameraHandle {
  readonly position: MutableVectorHandle;
}

export interface RigControlsHandle {
  readonly target: MutableVectorHandle;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  update: () => void;
}

/**
 * Follow configuration and per-tick target resolution, pushed into the
 * controller by the React binding whenever any of them change.
 */
export interface Episode3dCameraRigInputs {
  /**
   * Restore anchor to adopt, already gate-checked by the tracking hook.
   * Adoption is one-shot per object identity, so a stale value left in place
   * can never re-apply after mode or frame round-trips.
   */
  readonly adoptAnchor: Episode3dCameraTrackingAnchor | null;
  readonly mode: Episode3dTrackingMode;
  readonly sceneUpAxis: Episode3dSceneUpAxis;
  readonly targetFrameId: string;
  readonly targetResolution: CameraTargetResolution;
  readonly worldFrameId: string;
}

export interface Episode3dCameraRigSample {
  readonly anchor: Episode3dCameraTrackingAnchor | null;
  readonly pose: PointCloudCameraPose;
}

export interface Episode3dCameraRigCallbacks {
  /** Gesture-end commit (trailing-debounced): persistence boundary. */
  readonly onCommit: (
    pose: PointCloudCameraPose,
    anchor: Episode3dCameraTrackingAnchor | null,
  ) => void;
  /** Fired on OrbitControls `start`; the pose is the pre-gesture view. */
  readonly onGestureStart: (pose: PointCloudCameraPose) => void;
  /**
   * Fired after every rig camera write and every external-write re-base.
   * Receivers must treat this as a ref-write — it runs at frame rate.
   */
  readonly onPoseSample: (sample: Episode3dCameraRigSample) => void;
}

/**
 * Imperative owner of the 3D tile's follow-mode camera composition.
 *
 * The controller keeps the live tracking anchor and recomposes
 * `camera ← anchor ∘ targetPose` on every resolved target update, entirely
 * outside React. Its coordination rule is the external-write protocol: every
 * OrbitControls `change` event not bracketed by the controller's own
 * self-write flag — user drags, wheel dollies, the shell's zoom-floor target
 * pushback, and shell-applied pose commands — re-bases the anchor from the
 * live camera synchronously, inside the same dispatch. The next follow tick
 * therefore always composes from an anchor consistent with whatever just
 * moved the camera; no channel can undo another's write.
 *
 * Recomposition is absolute (anchor ∘ target), never delta-accumulating, so
 * long playback sessions cannot drift. When target resolution is `pending`
 * or `missing` the controller writes nothing — "hold the last view" falls
 * out of not moving rather than a cached pose.
 */
export class Episode3dCameraRigController {
  private anchor: Episode3dCameraTrackingAnchor | null = null;
  /**
   * Set when an external write lands while target resolution is not
   * resolved: the anchor must be re-based from the live camera at the next
   * resolved update, before composing, or the stale anchor would snap the
   * camera back over the external write.
   */
  private anchorDirty = false;
  private commitTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private inputs: Episode3dCameraRigInputs;
  private lastAdoptedAnchor: Episode3dCameraTrackingAnchor | null = null;
  private selfWrite = false;

  constructor(
    private readonly camera: RigCameraHandle,
    private readonly controls: RigControlsHandle,
    private readonly invalidate: () => void,
    private readonly callbacks: Episode3dCameraRigCallbacks,
    initialInputs: Episode3dCameraRigInputs,
  ) {
    this.inputs = initialInputs;
    this.controls.addEventListener("start", this.handleStart);
    this.controls.addEventListener("end", this.handleEnd);
    this.controls.addEventListener("change", this.handleChange);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.controls.removeEventListener("start", this.handleStart);
    this.controls.removeEventListener("end", this.handleEnd);
    this.controls.removeEventListener("change", this.handleChange);
    // The unmount recorder owns the final persistence write; a late-firing
    // commit must never race teardown.
    this.cancelPendingCommit();
  }

  /** Current live anchor; exposed for tests. */
  getAnchor(): Episode3dCameraTrackingAnchor | null {
    return this.anchor;
  }

  /**
   * Push the latest follow configuration and target resolution. Called from
   * a layout effect so composition writes land before paint, in the same
   * frame as the content they follow.
   */
  sync(inputs: Episode3dCameraRigInputs): void {
    if (this.disposed) {
      return;
    }
    this.inputs = inputs;

    if (!isFollowTrackingMode(inputs.mode)) {
      if (this.anchor) {
        this.anchor = null;
        this.anchorDirty = false;
        this.sample(this.livePose());
      }
      return;
    }

    const adopt = inputs.adoptAnchor;
    if (
      adopt &&
      adopt !== this.lastAdoptedAnchor &&
      this.anchorMatchesInputs(adopt)
    ) {
      // A restore anchor overrides whatever the controller derived on its
      // own: it only arrives when the user has not re-oriented since mount.
      this.lastAdoptedAnchor = adopt;
      this.anchor = adopt;
      this.anchorDirty = false;
      if (inputs.targetResolution.status === "resolved") {
        this.compose(inputs.targetResolution.pose);
      } else {
        this.sample(this.livePose());
      }
      return;
    }

    if (inputs.targetResolution.status !== "resolved") {
      // pending/missing: never move the camera on stale data. The frozen
      // follow view is the absence of a write, not a held pose.
      return;
    }

    const targetPose = inputs.targetResolution.pose;
    if (
      !this.anchor ||
      this.anchorDirty ||
      !this.anchorMatchesInputs(this.anchor)
    ) {
      // Initial anchoring, mode/frame switches, and dirty marks all re-base
      // from the live camera — none of them may move it.
      this.rebaseAnchor(this.livePose(), targetPose);
      this.sample(this.livePose());
      return;
    }

    this.compose(targetPose);
  }

  private readonly handleStart = (): void => {
    this.cancelPendingCommit();
    this.callbacks.onGestureStart(this.livePose());
  };

  private readonly handleEnd = (): void => {
    this.schedulePendingCommit();
  };

  private readonly handleChange = (): void => {
    if (this.selfWrite || this.disposed) {
      return;
    }
    // External write: someone other than this controller moved the camera.
    const pose = this.livePose();
    const { mode, targetResolution } = this.inputs;
    if (isFollowTrackingMode(mode)) {
      if (targetResolution.status === "resolved") {
        this.rebaseAnchor(pose, targetResolution.pose);
      } else {
        this.anchorDirty = true;
      }
    }
    this.sample(pose);
  };

  private anchorMatchesInputs(anchor: Episode3dCameraTrackingAnchor): boolean {
    const { mode, sceneUpAxis, targetFrameId, worldFrameId } = this.inputs;
    return (
      isFollowTrackingMode(mode) &&
      targetFrameId !== "" &&
      worldFrameId !== "" &&
      trackingAnchorMatches({
        anchor,
        mode,
        sceneUpAxis,
        targetFrameId,
        worldFrameId,
      })
    );
  }

  private rebaseAnchor(
    cameraPose: PointCloudCameraPose,
    targetPose: Episode3dCameraTargetPose,
  ): void {
    const { mode, sceneUpAxis, targetFrameId, worldFrameId } = this.inputs;
    if (!isFollowTrackingMode(mode) || !targetFrameId || !worldFrameId) {
      return;
    }
    this.anchor = cameraTrackingAnchorFromPose({
      cameraPose,
      mode,
      sceneUpAxis,
      targetFrameId,
      targetPose,
      worldFrameId,
    });
    this.anchorDirty = false;
  }

  private compose(targetPose: Episode3dCameraTargetPose): void {
    const anchor = this.anchor;
    if (!anchor) {
      return;
    }
    const pose = cameraPoseFromTrackingAnchor(
      anchor,
      targetPose,
      this.inputs.sceneUpAxis,
    );
    this.selfWrite = true;
    this.camera.position.set(...pose.position);
    this.controls.target.set(...pose.target);
    this.controls.update();
    this.selfWrite = false;
    this.invalidate();
    this.sample(pose);
  }

  private livePose(): PointCloudCameraPose {
    return {
      position: [
        this.camera.position.x,
        this.camera.position.y,
        this.camera.position.z,
      ],
      target: [
        this.controls.target.x,
        this.controls.target.y,
        this.controls.target.z,
      ],
    };
  }

  private sample(pose: PointCloudCameraPose): void {
    this.callbacks.onPoseSample({ anchor: this.anchor, pose });
  }

  private schedulePendingCommit(): void {
    this.cancelPendingCommit();
    this.commitTimer = setTimeout(() => {
      this.commitTimer = null;
      // Read the live pose at fire time: if a preset or restore landed in
      // the debounce window, the commit converges on it instead of writing
      // back a pre-command snapshot.
      this.callbacks.onCommit(this.livePose(), this.anchor);
    }, RIG_COMMIT_DEBOUNCE_MS);
  }

  private cancelPendingCommit(): void {
    if (this.commitTimer !== null) {
      clearTimeout(this.commitTimer);
      this.commitTimer = null;
    }
  }
}
