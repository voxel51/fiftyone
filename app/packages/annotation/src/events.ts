import { createUseEventHandler, useEventBus } from "@fiftyone/events";
import { AnnotationLabel } from "@fiftyone/state";
import { Field } from "@fiftyone/utilities";

export const AnnotationChannelId = "default";

export type AnnotationEventGroup = {
  "annotation:upsert": {
    label: AnnotationLabel;
    schema: Field;
    onSuccess?: () => void;
    onError?: (error?: Error | string) => void;
  };
  "annotation:delete": {
    label: AnnotationLabel;
    schema: Field;
    onSuccess?: () => void;
    onError?: (error?: Error | string) => void;
  };
  "annotation:sidebarValueUpdated": {
    overlayId: string;
    currentLabel: AnnotationLabel["data"];
    value: Partial<AnnotationLabel["data"]>;
  };
  "annotation:selected": {
    id: string;
    type: AnnotationLabel["type"];
    data?: Partial<AnnotationLabel["data"]>;
  };
};

export const useAnnotationEventHandler =
  createUseEventHandler<AnnotationEventGroup>();

export const useAnnotationEventBus = () => useEventBus<AnnotationEventGroup>();
