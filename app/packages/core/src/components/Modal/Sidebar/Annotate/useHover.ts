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
      const current = store.get(hoveringLabelIds);
      if (!current.includes(payload.id)) {
        store.set(hoveringLabelIds, [...current, payload.id]);
      }
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
