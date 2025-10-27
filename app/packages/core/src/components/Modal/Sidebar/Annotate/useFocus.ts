import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import { getDefaultStore } from "jotai";
import { useCallback, useEffect, useRef } from "react";
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
      scene?.selectOverlay(id, { isBridgeLogicHandled: true });
    }
    selectId.current = null;
  }, [scene]);

  useEffect(() => {
    const handler = (event) => {
      if (event.detail.isBridgeLogicHandled) {
        return;
      }

      selectId.current = event.detail.id;

      const current = STORE.get(currentOverlay)?.id;

      if (!current || !STORE.get(hasChanges)) {
        // no unsaved changes, allow the exit
        onExit();
        return;
      }

      // there are unsaved changes, ask for confirmation
      scene?.selectOverlay(event.detail.id, { isBridgeLogicHandled: true });
      confirmExit(() => {
        scene?.deselectOverlay(current, {
          isBridgeLogicHandled: true,
        });

        if (current !== event.detail.id) {
          select();
        }
      });
    };
    scene?.on(LIGHTER_EVENTS.OVERLAY_DESELECT, handler);

    return () => {
      scene?.off(LIGHTER_EVENTS.OVERLAY_DESELECT, handler);
    };
  }, [confirmExit, scene, onExit, select, selectId]);

  useEffect(() => {
    const handler = (event) => {
      if (event.detail.isBridgeLogicHandled) {
        return;
      }
      selectId.current = event.detail.id;

      if (STORE.get(editing)) {
        // skip for new labels
        if (STORE.get(current)?.isNew) return;

        // a label is already being edited, let the DESELECT event handle it
        scene?.deselectOverlay(event.detail.id, { isBridgeLogicHandled: true });
        return;
      }

      select();
    };
    scene?.on(LIGHTER_EVENTS.OVERLAY_SELECT, handler);

    return () => {
      scene?.off(LIGHTER_EVENTS.OVERLAY_SELECT, handler);
    };
  }, [scene, select]);
}
