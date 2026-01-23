import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { getDefaultStore } from "jotai";
import { useCallback, useRef } from "react";
import useConfirmExit from "./Confirmation/useConfirmExit";
import { editing } from "./Edit";
import { current, hasChanges, savedLabel } from "./Edit/state";
import useExit from "./Edit/useExit";
import useSave from "./Edit/useSave";
import { labelMap } from "./useLabels";

const STORE = getDefaultStore();

export default function useFocus() {
  const { scene, removeOverlay } = useLighter();
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const { confirmExit } = useConfirmExit(useExit, useSave);
  const selectId = useRef<string | null>(null);
  const onExit = useExit(false);

  const select = useCallback(() => {
    const id = selectId.current;
    if (!id) {
      return;
    }

    const label = STORE.get(labelMap)[id];
    if (id && label) {
      STORE.set(savedLabel, STORE.get(label)?.data);
      STORE.set(editing, label);
      scene?.selectOverlay(id, { ignoreSideEffects: true });
    }
    selectId.current = null;
  }, [scene]);

  useEventHandler(
    "lighter:overlay-deselect",
    useCallback(
      (payload) => {
        if (payload.ignoreSideEffects) {
          return;
        }

        const id = STORE.get(current)?.overlay?.id;

        // no unsaved changes, allow the exit
        if (!id || !STORE.get(hasChanges)) {
          onExit();
          return;
        }

        // there are unsaved changes, ask for confirmation
        scene?.selectOverlay(payload.id, { ignoreSideEffects: true });
        confirmExit(() => {
          scene?.deselectOverlay(id, {
            ignoreSideEffects: true,
          });

          select();
        });
      },
      [confirmExit, scene, onExit, select]
    )
  );

  useEventHandler(
    "lighter:overlay-select",
    useCallback(
      (payload) => {
        if (payload.ignoreSideEffects) {
          return;
        }
        selectId.current = payload.id;

        if (STORE.get(editing)) {
          // if it's a new label with no changes, discard it and allow the selection
          const currentLabel = STORE.get(current);

          if (currentLabel?.isNew) return;

          // a label is already being edited, let the DESELECT event handle it
          scene?.deselectOverlay(payload.id, { ignoreSideEffects: true });
          return;
        }

        select();
      },
      [scene, select, onExit, removeOverlay]
    )
  );
}
