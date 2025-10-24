import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import { getDefaultStore } from "jotai";
import { useEffect, useRef } from "react";
import useConfirmExit from "./Confirmation/useConfirmExit";
import { editing } from "./Edit";
import { currentOverlay, hasChanges, savedLabel } from "./Edit/state";
import useExit from "./Edit/useExit";
import useSave from "./Edit/useSave";
import { labelMap } from "./useLabels";

export default function useFocus() {
  const { scene } = useLighter();
  const { confirmExit } = useConfirmExit(useExit, useSave);
  const selectId = useRef<string | null>(null);
  const onExit = useExit(false);

  useEffect(() => {
    const handler = (event) => {
      if (event.detail.isBridgeLogicHandled) {
        return;
      }
      const store = getDefaultStore();
      if (!store.get(editing)) {
        const label = store.get(labelMap)[event.detail.id];

        if (label) {
          store.set(savedLabel, store.get(label)?.data);
          store.set(editing, label);
        }
      } else {
        selectId.current = event.detail.id;

        scene?.deselectOverlay(event.detail.id, { isBridgeLogicHandled: true });
      }
    };
    scene?.on(LIGHTER_EVENTS.OVERLAY_SELECT, handler);

    return () => {
      scene?.off(LIGHTER_EVENTS.OVERLAY_SELECT, handler);
    };
  }, [scene]);

  useEffect(() => {
    const store = getDefaultStore();
    const select = (id: string) => {
      const label = store.get(labelMap)[id];
      if (label) {
        store.set(savedLabel, store.get(label)?.data);
        store.set(editing, label);
        scene?.selectOverlay(id, { isBridgeLogicHandled: true });
      }
    };

    const handler = (event) => {
      if (event.detail.isBridgeLogicHandled) {
        return;
      }
      selectId.current = event.detail.id;
      if (store.get(hasChanges)) {
        const current = store.get(currentOverlay).id;
        scene?.selectOverlay(event.detail.id, { isBridgeLogicHandled: true });
        confirmExit(() => {
          scene?.deselectOverlay(current, {
            isBridgeLogicHandled: true,
          });

          select(selectId.current);
        });
        return;
      }

      onExit();
    };
    scene?.on(LIGHTER_EVENTS.OVERLAY_DESELECT, handler);

    return () => {
      scene?.off(LIGHTER_EVENTS.OVERLAY_DESELECT, handler);
    };
  }, [confirmExit, scene, onExit, selectId]);
}
