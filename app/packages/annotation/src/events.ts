import { createUseEventHandler, useEventBus } from "@fiftyone/events";
import { AnnotationLabel } from "@fiftyone/state";
import { Field } from "@fiftyone/utilities";

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

export type AnnotationEventGroup = {
  /**
   * Notification event emitted when a label is upserted successfully.
   */
  "annotation:notification:upsertSuccess": MutationSuccess<"upsert">;
  /**
   * Notification event emitted when an error occurs while upserting a label.
   */
  "annotation:notification:upsertError": MutationError<"upsert">;
  /**
   * Notification event emitted when a label is deleted successfully.
   */
  "annotation:notification:deleteSuccess": MutationSuccess<"delete">;
  /**
   * Notification event emitted when an error occurs while deleting a label.
   */
  "annotation:notification:deleteError": MutationError<"delete">;
  /**
   * Notification event emitted when a sidebar value is updated.
   */
  "annotation:notification:sidebarValueUpdated": {
    overlayId: string;
    currentLabel: AnnotationLabel["data"];
    value: Partial<AnnotationLabel["data"]>;
  };
  /**
   * Notification event emitted when a label is selected.
   */
  "annotation:notification:sidebarLabelSelected": {
    id: string;
    type: AnnotationLabel["type"];
    data?: Partial<AnnotationLabel["data"]>;
  };
  /**
   * Notification event emitted when a label is hovered.
   */
  "annotation:notification:sidebarLabelHover": {
    id: string;
    tooltip?: boolean;
  };
  /**
   * Notification event emitted when a label is unhovered.
   */
  "annotation:notification:sidebarLabelUnhover": {
    id: string;
  };
};

export const useAnnotationEventHandler =
  createUseEventHandler<AnnotationEventGroup>();

export const useAnnotationEventBus = () => useEventBus<AnnotationEventGroup>();
