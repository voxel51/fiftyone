import type { LighterInteractionPolicy } from "@fiftyone/annotation";
import { useLighter } from "@fiftyone/lighter";
import { getDefaultStore } from "jotai";
import { useCallback, useMemo, useRef } from "react";
import {
  editingLabelAtom,
  pendingNewTypeAtom,
} from "./Edit/useAnnotationContext/atoms";
import { current } from "./Edit/useAnnotationContext/selectors";
import useExit from "./Edit/useExit";

const STORE = getDefaultStore();

/**
 * The pre-entity DRAFT lock's interaction ownership. While a draft holds the
 * form: a foreign select is revoked and consumed (the draft's own overlay
 * keeps its scene-native selection); a deselect is consumed and routed
 * through the draft's own exit (an empty draft is removed, a drawn one
 * released). Committed labels carry no lock — this interceptor self-gates on
 * the draft state and stays inert otherwise.
 */
export const useDraftLockInteraction = (): LighterInteractionPolicy => {
  const { scene } = useLighter();
  const onExit = useExit();

  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const interceptSelect = useCallback((id: string): boolean => {
    if (
      !STORE.get(editingLabelAtom) &&
      STORE.get(pendingNewTypeAtom) === null
    ) {
      return false;
    }

    const currentLabel = STORE.get(current);

    if (!currentLabel?.isNew) {
      return false;
    }

    // only FOREIGN overlays get their selection cancelled — the draft's own
    // overlay keeps the editing affordance on the box being drawn
    if (currentLabel.overlay?.id !== id) {
      sceneRef.current?.deselectOverlay(id, { ignoreSideEffects: true });
    }

    return true;
  }, []);

  const interceptDeselect = useCallback((): boolean => {
    const isDraft =
      STORE.get(pendingNewTypeAtom) !== null ||
      Boolean(STORE.get(current)?.isNew);

    if (!isDraft) {
      return false;
    }

    // a draft's ref is never engine-active, so the engine route can't end it
    onExitRef.current();
    return true;
  }, []);

  return useMemo(
    () => ({ interceptSelect, interceptDeselect }),
    [interceptSelect, interceptDeselect],
  );
};
