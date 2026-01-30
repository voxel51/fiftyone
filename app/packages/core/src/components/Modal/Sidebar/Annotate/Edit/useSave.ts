import { useCallback } from "react";
import { useAtomValue } from "jotai";

import { current } from "./state";
import * as fos from "@fiftyone/state";

import useCreate from "./useCreate";
import { useQuickDraw } from "./useQuickDraw";
import { useLighter } from "@fiftyone/lighter";
import { useAnnotationEventBus } from "@fiftyone/annotation";

import { DETECTION } from "@fiftyone/utilities";
import type { BaseOverlay } from "@fiftyone/lighter";

export default function useSave() {
  const { scene, addOverlay } = useLighter();
  const label = useAtomValue(current);
  const setNotification = fos.useNotification();
  const { quickDrawActive, trackLastUsedDetection } = useQuickDraw();
  const createDetection = useCreate(DETECTION);
  const eventBus = useAnnotationEventBus();

  return useCallback(() => {
    if (!label) {
      return;
    }

    if (quickDrawActive) {
      // Always exit interactive mode after save
      // This ensures clean state transition
      if (scene && !scene.isDestroyed && scene.renderLoopActive) {
        scene.exitInteractiveMode();
        addOverlay(label.overlay as BaseOverlay);
      }

      // Track last-used detection field and label for auto-assignment
      trackLastUsedDetection(label.path, label.data.label);

      // Create next detection immediately
      // This will enter interactive mode with a new handler
      createDetection();

      setNotification({
        msg: `Label "${label.data.label}" saved. Ready for next...`,
        variant: "success",
      });

      return;
    }
    eventBus.dispatch("annotation:persistenceRequested");
  }, [
    addOverlay,
    createDetection,
    eventBus,
    label,
    quickDrawActive,
    scene,
    setNotification,
    trackLastUsedDetection,
  ]);
}
