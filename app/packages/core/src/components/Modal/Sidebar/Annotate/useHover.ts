import { useAnnotationEventHandler } from "@fiftyone/annotation";
import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import { atom, getDefaultStore } from "jotai";
import { useCallback, useEffect } from "react";

export const hoveringLabelIds = atom<string[]>([]);

export default function useHover() {
  const { scene } = useLighter();

  useEffect(() => {
    const store = getDefaultStore();

    const handleHover = (event: CustomEvent) => {
      store.set(hoveringLabelIds, [
        ...store.get(hoveringLabelIds),
        event.detail.id,
      ]);
    };

    const handleUnhover = (event: CustomEvent) => {
      store.set(
        hoveringLabelIds,
        store.get(hoveringLabelIds).filter((id) => id !== event.detail.id)
      );
    };

    const handleAllUnhover = (event: CustomEvent) => {
      store.set(hoveringLabelIds, []);
    };

    scene?.on(LIGHTER_EVENTS.OVERLAY_HOVER, handleHover);

    scene?.on(LIGHTER_EVENTS.OVERLAY_UNHOVER, handleUnhover);
    scene?.on(LIGHTER_EVENTS.OVERLAY_ALL_UNHOVER, handleAllUnhover);

    return () => {
      scene?.off(LIGHTER_EVENTS.OVERLAY_HOVER, handleHover);
      scene?.off(LIGHTER_EVENTS.OVERLAY_UNHOVER, handleUnhover);
      scene?.off(LIGHTER_EVENTS.OVERLAY_ALL_UNHOVER, handleAllUnhover);
    };
  }, [scene]);

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
      getDefaultStore().set(
        hoveringLabelIds,
        store.get(hoveringLabelIds).filter((id) => id !== payload.id)
      );
    }, [])
  );
}
