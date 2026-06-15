import { Archetype3d, Looker3dOverlayLabel } from "@fiftyone/looker-3d";
import { AnnotationLabel } from "@fiftyone/state";
import { DetectionOverlay } from "@fiftyone/lighter";
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
   * Notification event emitted when a label is upserted successfully.
   */
  "annotation:upsertSuccess": MutationSuccess<"upsert">;
  /**
   * Notification event emitted when an error occurs while upserting a label.
   */
  "annotation:upsertError": MutationError<"upsert">;
  /**
   * Notification event emitted when a label is deleted successfully.
   */
  "annotation:deleteSuccess": MutationSuccess<"delete">;
  /**
   * Notification event emitted when an error occurs while deleting a label.
   */
  "annotation:deleteError": MutationError<"delete">;
  /**
   * Notification event emitted when a canvas overlay is established.
   */
  "annotation:canvasDetectionOverlayEstablish": {
    id: string;
    overlay: DetectionOverlay;
  };
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
