import { useAnnotationEventHandler } from "@fiftyone/annotation";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { atom, getDefaultStore } from "jotai";
import { useCallback } from "react";

export const hoveringLabelIds = atom<string[]>([]);

export default function useHover() {
  const { scene } = useLighter();
  const useEventHandler = useLighterEventHandler(
    scene?.getSceneId() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  useEventHandler(
    "lighter:overlay-hover",
    useCallback((payload) => {
      const store = getDefaultStore();
      const current = store.get(hoveringLabelIds);
      if (!current.includes(payload.id)) {
        store.set(hoveringLabelIds, [...current, payload.id]);
      }
    }, [])
  );

  useEventHandler(
    "lighter:overlay-unhover",
    useCallback((payload) => {
      const store = getDefaultStore();
      store.set(
        hoveringLabelIds,
        store.get(hoveringLabelIds).filter((id) => id !== payload.id)
      );
    }, [])
  );

  useEventHandler(
    "lighter:overlay-all-unhover",
    useCallback((_payload) => {
      const store = getDefaultStore();
      store.set(hoveringLabelIds, []);
    }, [])
  );

  useAnnotationEventHandler(
    "annotation:canvasOverlayHover",
    useCallback((payload) => {
      const store = getDefaultStore();
      const current = store.get(hoveringLabelIds);
      if (!current.includes(payload.id)) {
        store.set(hoveringLabelIds, [...current, payload.id]);
      }
    }, [])
  );

  useAnnotationEventHandler(
    "annotation:canvasOverlayUnhover",
    useCallback((payload) => {
      const store = getDefaultStore();
      store.set(
        hoveringLabelIds,
        store.get(hoveringLabelIds).filter((id) => id !== payload.id)
      );
    }, [])
  );
}
