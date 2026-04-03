import { useAnnotationEventHandler } from "@fiftyone/annotation";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useCallback } from "react";
import { hoverLabel } from "./redux/annotationSlice";
import { annotationStore } from "./redux/store";

export default function useHover() {
  const { scene } = useLighter();
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  useEventHandler(
    "lighter:overlay-hover",
    useCallback((payload) => {
      annotationStore.dispatch(hoverLabel(payload.id));
    }, [])
  );

  useEventHandler(
    "lighter:overlay-unhover",
    useCallback((_payload) => {
      annotationStore.dispatch(hoverLabel(null));
    }, [])
  );

  useEventHandler(
    "lighter:overlay-all-unhover",
    useCallback((_payload) => {
      annotationStore.dispatch(hoverLabel(null));
    }, [])
  );

  useAnnotationEventHandler(
    "annotation:canvasOverlayHover",
    useCallback((payload) => {
      annotationStore.dispatch(hoverLabel(payload.id));
    }, [])
  );

  useAnnotationEventHandler(
    "annotation:canvasOverlayUnhover",
    useCallback((_payload) => {
      annotationStore.dispatch(hoverLabel(null));
    }, [])
  );
}
