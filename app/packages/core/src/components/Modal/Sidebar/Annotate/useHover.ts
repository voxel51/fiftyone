import { useAnnotationEventHandler } from "@fiftyone/annotation";
import { useLighter, useLighterEventHandler } from "@fiftyone/lighter";
import { atom, getDefaultStore } from "jotai";
import { useCallback } from "react";

export const hoveringLabelIds = atom<string[]>([]);

export default function useHover() {
  const { scene } = useLighter();
  const sceneId = scene?.getSceneId() ?? "lighter";
  const useEventHandler = useLighterEventHandler(sceneId);
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
    "annotation:notification:canvasOverlayHover",
    useCallback((payload) => {
      const store = getDefaultStore();
      const current = store.get(hoveringLabelIds);
      if (!current.includes(payload.id)) {
        store.set(hoveringLabelIds, [...current, payload.id]);
      }
    }, [])
  );

  useAnnotationEventHandler(
    "annotation:notification:canvasOverlayUnhover",
    useCallback((payload) => {
      const store = getDefaultStore();
      store.set(
        hoveringLabelIds,
        store.get(hoveringLabelIds).filter((id) => id !== payload.id)
      );
    }, [])
  );
}
