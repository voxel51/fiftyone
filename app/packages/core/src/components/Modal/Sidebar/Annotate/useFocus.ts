import { useLighter, useLighterEventHandler } from "@fiftyone/lighter";
import { getDefaultStore } from "jotai";
import { useCallback, useRef } from "react";
import useConfirmExit from "./Confirmation/useConfirmExit";
import { editing } from "./Edit";
import { current, currentOverlay, hasChanges, savedLabel } from "./Edit/state";
import useExit from "./Edit/useExit";
import useSave from "./Edit/useSave";
import { labelMap } from "./useLabels";

const STORE = getDefaultStore();

export default function useFocus() {
  const { scene } = useLighter();
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

  useLighterEventHandler(
    "lighter:overlay-deselect",
    useCallback(
      (payload) => {
        if (payload.ignoreSideEffects) {
          return;
        }

        const current = STORE.get(currentOverlay)?.id;

        if (!current || !STORE.get(hasChanges)) {
          // no unsaved changes, allow the exit
          onExit();

          return;
        }

        // there are unsaved changes, ask for confirmation
        scene?.selectOverlay(payload.id, { ignoreSideEffects: true });
        confirmExit(() => {
          scene?.deselectOverlay(current, {
            ignoreSideEffects: true,
          });

          select();
        });
      },
      [confirmExit, scene, onExit, select]
    )
  );

  useLighterEventHandler(
    "lighter:overlay-select",
    useCallback(
      (payload) => {
        if (payload.ignoreSideEffects) {
          return;
        }
        selectId.current = payload.id;

        if (STORE.get(editing)) {
          // skip for new labels
          if (STORE.get(current)?.isNew) return;

          // a label is already being edited, let the DESELECT event handle it
          scene?.deselectOverlay(payload.id, { ignoreSideEffects: true });
          return;
        }

        select();
      },
      [scene, select]
    )
  );
}
