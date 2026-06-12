import {
  useAnnotationEngine,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { getDefaultStore } from "jotai";
import { useCallback } from "react";
import { labelMap } from "./useLabels";

export default function useHover() {
  const engine = useAnnotationEngine();
  const { scene } = useLighter();
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  const hoverOn = useCallback(
    (id: string) => {
      const label = getDefaultStore().get(labelMap)[id];
      if (!label) return;

      engine.interaction.setHovered(
        {
          sample: engine.ambientSample(),
          path: getDefaultStore().get(label).path,
          instanceId: id,
        },
        true
      );
    },
    [engine]
  );

  // resolve from the hovered set itself, so hover-off works even after the
  // label has left the map
  const hoverOff = useCallback(
    (id: string) => {
      const ref = engine.interaction
        .getHovered()
        .find((hovered) => hovered.instanceId === id);

      if (ref) {
        engine.interaction.setHovered(ref, false);
      }
    },
    [engine]
  );

  useEventHandler(
    "lighter:overlay-hover",
    useCallback((payload) => hoverOn(payload.id), [hoverOn])
  );

  useEventHandler(
    "lighter:overlay-unhover",
    useCallback((payload) => hoverOff(payload.id), [hoverOff])
  );

  useEventHandler(
    "lighter:overlay-all-unhover",
    useCallback(() => {
      engine.interaction.pruneHovered(engine.interaction.getHovered());
    }, [engine])
  );

  useAnnotationEventHandler(
    "annotation:canvasOverlayHover",
    useCallback((payload) => hoverOn(payload.id), [hoverOn])
  );

  useAnnotationEventHandler(
    "annotation:canvasOverlayUnhover",
    useCallback((payload) => hoverOff(payload.id), [hoverOff])
  );
}
