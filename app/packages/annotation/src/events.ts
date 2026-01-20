import { Archetype3d, Looker3dOverlayLabel } from "@fiftyone/looker-3d";
import { AnnotationLabel } from "@fiftyone/state";

export const AnnotationChannelId = "default";

type MutationError<T> = {
  labelId: string;
  type: T;
  error?: Error;
};

type MutationSuccess<T> = {
  labelId: string;
  type: T;
};

type PrimitiveMutationError = {
  path: string;
  type: "update";
  error?: Error;
};

type PrimitiveMutationSuccess = {
  path: string;
  type: "update";
};

export type AnnotationEventGroup = {
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
   * Notification event emitted when a sidebar value is updated.
   */
  "annotation:sidebarValueUpdated": {
    overlayId: string;
    currentLabel: AnnotationLabel["data"];
    value: Partial<AnnotationLabel["data"]>;
  };
  /**
   * Notification event emitted when a label is selected.
   */
  "annotation:sidebarLabelSelected": {
    id: string;
    type: AnnotationLabel["type"];
    data?: Partial<AnnotationLabel["data"]>;
  };
  /**
   * Notification event emitted when a label is hovered.
   */
  "annotation:sidebarLabelHover": {
    id: string;
    tooltip?: boolean;
  };
  /**
   * Notification event emitted when a label is unhovered.
   */
  "annotation:sidebarLabelUnhover": {
    id: string;
  };
  /**
   * Notification event emitted when a canvas overlay is hovered.
   * TODO: FOR NOW THIS IS ONLY FOR 3D LABELS.
   * USE THIS FOR 2D ONCE WE GET RID OF LIGHTER HOVER EVENTS.
   */
  "annotation:canvasOverlayHover": {
    id: string;
  };
  /**
   * Notification event emitted when a canvas overlay is unhovered.
   * TODO: FOR NOW THIS IS ONLY FOR 3D LABELS.
   * USE THIS FOR 2D ONCE WE GET RID OF LIGHTER HOVER EVENTS.
   */
  "annotation:canvasOverlayUnhover": {
    id: string;
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
   * Notification event emitted when a label is unselected for annotation.
   */
  "annotation:3dLabelUnselected": {
    id: string;
  };
  /**
   * Notification event emitted when cuboid creation starts (first click).
   */
  "annotation:cuboidCreationStarted": {
    position: [number, number, number];
  };
  /**
   * Notification event emitted when a primitive field is updated successfully.
   */
  "primitive:updateSuccess": PrimitiveMutationSuccess;
  /**
   * Notification event emitted when an error occurs while updating a primitive field.
   */
  "primitive:updateError": PrimitiveMutationError;
};
