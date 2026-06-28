import { Archetype3d, Looker3dOverlayLabel } from "@fiftyone/looker-3d";
import { AnnotationLabel } from "@fiftyone/state";
import type {
  AnnotationAgentDownloadProgress,
  AnnotationAgentLifecycleStatus,
} from "./agents";
import type { ProviderError } from "./providers";

export const AnnotationChannelId = "default";

type MutationError<T> = {
  labelId: string;
  type: T;
  error?: Error;
};

type MutationSuccess<T> = {
  labelId: string;
  type: T;
  labelType?: AnnotationLabel["type"];
};

export type AnnotationEventGroup = {
  /**
   * Notification event emitted when aggregate annotation persistence is requested.
   */
  "annotation:persistenceRequested": void;
  /**
   * Notification event emitted when a persistence request is in flight.
   */
  "annotation:persistenceInFlight": void;
  /**
   * Notification event emitted when aggregate annotation persistence is successful.
   */
  "annotation:persistenceSuccess": void;
  /**
   * Notification event emitted when aggregate annotation persistence is unsuccessful.
   */
  "annotation:persistenceError": { error?: Error };
  /**
   * Notification event emitted when a label is deleted successfully.
   */
  "annotation:deleteSuccess": MutationSuccess<"delete">;
  /**
   * Notification event emitted when an error occurs while deleting a label.
   */
  "annotation:deleteError": MutationError<"delete">;
  /**
   * Notification event emitted when a label is selected for annotation.
   */
  "annotation:3dLabelSelected": {
    id: string;
    archetype: Archetype3d;
    label: Looker3dOverlayLabel;
  };
  /**
   * Notification event emitted when a 3D polyline vertex is selected.
   */
  "annotation:3dPolylineVertexSelected": {
    labelId: string;
    segmentIndex: number;
    pointIndex: number;
    position: [number, number, number];
  };
  /**
   * Notification event emitted when cuboid creation starts (first click).
   */
  "annotation:cuboidCreationStarted": {
    position: [number, number, number];
  };

  /**
   * Notification event emitted when entering annotation mode.
   */
  "annotation:enterAnnotationMode": {
    path?: string;
    labelId?: string;
  };

  /**
   * Notification event emitted when exiting annotation mode.
   */
  "annotation:exitAnnotationMode": void;

  /**
   * Notification event emitted when a label edit occurs.
   */
  "annotation:labelEdit": { label: Partial<AnnotationLabel["data"]> };

  /**
   * Notification event emitted when a label edit is undone.
   */
  "annotation:undoLabelEdit": { label: Partial<AnnotationLabel["data"]> };

  /**
   * Notification event emitted when a label's `keyframe` attribute changes
   * on a tracked instance. Consumers (e.g. auto-interpolate) use this to
   * re-propagate between bracketing keyframes after a change.
   *
   * - `kind: "set"` — keyframe just became `true`, either by mark-keyframe
   *   gesture or by an edit (draw / drag / resize) that promotes the label.
   * - `kind: "removed"` — keyframe was `true` and no longer is, either by
   *   unmarking or by deleting the underlying detection.
   */
  "annotation:keyframeChanged": {
    /** Synthetic overlay id (`instance-…` / `track-…`). */
    trackId: string;
    /** Cross-frame identity, when the label has an `fo.Instance`. */
    instanceId: string | null;
    /** 1-indexed frame number where the change happened. */
    frame: number;
    kind: "set" | "removed";
    /**
     * Gesture `undoKey` the triggering edit committed under. When present, the
     * auto-interpolate re-lerp commits under it too, coalescing the geometry
     * edit / keyframe toggle and the resulting interpolation into ONE undo unit.
     */
    undoKey?: string;
  };

  /**
   * Notification event emitted when an entire object track is deleted.
   */
  "annotation:trackDeleted": {
    /** Synthetic overlay id (`instance-…` / `track-…`) of the deleted track. */
    trackId: string;
  };

  /**
   * Notification event emitted when a track is split at a frame: frames at or
   * after `atFrame` are re-keyed onto a fresh instance, the original keeps the
   * earlier frames.
   */
  "annotation:trackSplit": {
    /** Synthetic overlay id of the track that was split. */
    trackId: string;
    /** The original track's `instance._id` (keeps frames `< atFrame`). */
    instanceId: string;
    /** The minted `instance._id` carrying frames `>= atFrame`. */
    newInstanceId: string;
    /** 1-indexed split boundary; this frame lands on the new track. */
    atFrame: number;
  };

  /**
   * Notification event emitted when one track is merged into another: the
   * source's frames are re-keyed onto the target's instance (target-wins on
   * overlapping frames) and the source ceases to exist.
   */
  "annotation:trackMerged": {
    /** Synthetic overlay id of the absorbed (source) track. */
    sourceTrackId: string;
    /** Synthetic overlay id of the surviving (target) track. */
    targetTrackId: string;
    /** The source track's `instance._id` (no longer present after merge). */
    sourceInstanceId: string;
    /** The target track's `instance._id` (now carries the merged frames). */
    targetInstanceId: string;
  };

  /**
   * Notification event emitted when the active annotation agent transitions
   * between lifecycle states (e.g. `"initializing"` → `"inferring"`).
   */
  "annotation:agentLifecycleStatusChange": {
    status: AnnotationAgentLifecycleStatus;
  };

  /**
   * Notification event emitted when the active annotation agent reports
   * download progress for model weights or other large assets.
   */
  "annotation:agentDownloadProgress": AnnotationAgentDownloadProgress;

  /**
   * Notification event emitted when the active annotation agent reports
   * a terminal error. Paired with a `"status": "error"` lifecycle change.
   */
  "annotation:agentError": { error: ProviderError };
};
