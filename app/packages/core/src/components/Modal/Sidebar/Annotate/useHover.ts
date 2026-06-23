import { useAnnotationEventHandler } from "@fiftyone/annotation";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { atom, useAtomValue } from "jotai";
import { atomFamily } from "jotai/utils";
import { getDefaultStore } from "jotai";
import { useCallback } from "react";

const hoveringLabelIds = atom<string[]>([]);

const isLabelHoveringFamily = atomFamily((id: string) =>
  atom((get) => get(hoveringLabelIds).includes(id))
);

// Evict atoms older than 10 minutes so the cache doesn't grow without bound across
// long annotation sessions with many distinct label IDs. These atoms are purely
// derived and hold no mutable state, so eviction and lazy recreation is transparent.
isLabelHoveringFamily.setShouldRemove(
  (createdAt) => Date.now() - createdAt > 10 * 60 * 1000
);

export const useIsLabelHovering = (id: string): boolean =>
  useAtomValue(isLabelHoveringFamily(id));

export default function useHover() {
  const { scene } = useLighter();
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
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
