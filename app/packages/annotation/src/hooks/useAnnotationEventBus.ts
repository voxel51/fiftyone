import { useEventBus } from "@fiftyone/events";
import { AnnotationEventGroup } from "../events";

export const useAnnotationEventBus = () => useEventBus<AnnotationEventGroup>();
