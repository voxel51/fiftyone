import { createUseEventHandler } from "@fiftyone/events";
import { AnnotationEventGroup } from "../events";

export const useAnnotationEventHandler =
  createUseEventHandler<AnnotationEventGroup>();
