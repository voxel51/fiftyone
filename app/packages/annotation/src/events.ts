import { createUseEventHandler, useEventBus } from "@fiftyone/events";
import { AnnotationLabel } from "@fiftyone/state";
import { Field } from "@fiftyone/utilities";

export const AnnotationChannelId = "default";

type MutationError<T> = {
  sourceId: string;
  type: T;
  error?: Error | string;
};

type MutationSuccess<T> = {
  sourceId: string;
  type: T;
};

export type AnnotationEventGroup = {
  /**
   * Mutation event to trigger an upsert operation.
   */
  "annotation:command:upsert": {
    /**
     * The id of the source of the upsert event.
     */
    sourceId: string;
    /**
     * The label that is being upserted.
     */
    label: AnnotationLabel;
    /**
     * The schema of the label that is being upserted.
     */
    schema: Field;
  };
  /**
   * Notification event emitted when a label is upserted successfully.
   */
  "annotation:notification:upsertSuccess": MutationSuccess<"upsert">;
  /**
   * Notification event emitted when an error occurs while upserting a label.
   */
  "annotation:notification:upsertError": MutationError<"upsert">;
  /**
   * Mutation event to trigger a delete operation.
   */
  "annotation:command:delete": {
    /**
     * The id of the source of the delete event.
     */
    sourceId: string;
    /**
     * The label that is being deleted.
     */
    label: AnnotationLabel;
    /**
     * The schema of the label that is being deleted.
     */
    schema: Field;
  };
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
};

export const useAnnotationEventHandler =
  createUseEventHandler<AnnotationEventGroup>();

export const useAnnotationEventBus = () => useEventBus<AnnotationEventGroup>();
