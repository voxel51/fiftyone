import { useAnnotationEventHandler } from "@fiftyone/annotation";
import { useLighterEventHandler } from "@fiftyone/lighter";
import { atom, getDefaultStore } from "jotai";
import { useCallback } from "react";

export const hoveringLabelIds = atom<string[]>([]);

export default function useHover() {
  useLighterEventHandler(
    "lighter:overlay-hover",
    useCallback((payload) => {
      const store = getDefaultStore();
      store.set(hoveringLabelIds, [...store.get(hoveringLabelIds), payload.id]);
    }, [])
  );

  useLighterEventHandler(
    "lighter:overlay-unhover",
    useCallback((payload) => {
      const store = getDefaultStore();
      store.set(
        hoveringLabelIds,
        store.get(hoveringLabelIds).filter((id) => id !== payload.id)
      );
    }, [])
  );

  useLighterEventHandler(
    "lighter:overlay-all-unhover",
    useCallback(() => {
      const store = getDefaultStore();
      store.set(hoveringLabelIds, []);
    }, [])
  );

  useAnnotationEventHandler(
    "annotation:notification:canvasOverlayHover",
    useCallback((payload) => {
      const store = getDefaultStore();
      store.set(hoveringLabelIds, [...store.get(hoveringLabelIds), payload.id]);
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
