import { useAtomValue } from "jotai";
import { useCallback } from "react";

import { useActivityToast } from "@fiftyone/state";
import { current } from "./state";

import { useAnnotationEventBus } from "@fiftyone/annotation";
import { useLighter } from "@fiftyone/lighter";
import useCreate from "./useCreate";
import { useQuickDraw } from "./useQuickDraw";

import type { BaseOverlay } from "@fiftyone/lighter";
import { DETECTION } from "@fiftyone/utilities";
import { IconName, Variant } from "@voxel51/voodo";

export default function useSave() {
  const { scene, addOverlay } = useLighter();
  const label = useAtomValue(current);
  const { setConfig } = useActivityToast();
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

      setConfig({
        iconName: IconName.Check,
        message: `Label "${label.data.label}" saved. Ready for next...`,
        variant: Variant.Success,
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
    trackLastUsedDetection,
  ]);
}
