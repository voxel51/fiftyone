import { useCallback } from "react";

import { useAnnotationEventBus } from "@fiftyone/annotation";

export default function useSave() {
  const eventBus = useAnnotationEventBus();

  return useCallback(() => {
    eventBus.dispatch("annotation:persistenceRequested");
  }, [eventBus]);
}
