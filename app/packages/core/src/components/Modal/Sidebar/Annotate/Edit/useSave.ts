import { useAnnotationEventBus } from "@fiftyone/annotation";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { current } from "./state";

export default function useSave() {
  const label = useAtomValue(current);
  const eventBus = useAnnotationEventBus();

  return useCallback(() => {
    if (!label) {
      return;
    }

    eventBus.dispatch("annotation:persistenceRequested");
  }, [label, eventBus]);
}
