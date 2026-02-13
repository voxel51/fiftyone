import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { getDefaultStore } from "jotai";
import { useCallback, useRef } from "react";
import { editing } from "./Edit";
import { current, savedLabel } from "./Edit/state";
import useExit from "./Edit/useExit";
import { labelMap } from "./useLabels";
import { useQuickDraw } from "./Edit/useQuickDraw";
import useCreate from "./Edit/useCreate";
import { DETECTION } from "@fiftyone/utilities";

const STORE = getDefaultStore();

export default function useFocus() {
  const { scene } = useLighter();
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const selectId = useRef<string | null>(null);
  const onExit = useExit();
  const createDetection = useCreate(DETECTION);
  const { quickDrawActive, handleQuickDrawTransition } = useQuickDraw();

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
      async (payload) => {
        if (payload.ignoreSideEffects) {
          return;
        }

        if (!quickDrawActive) {
          onExit();
        } else {
          handleQuickDrawTransition(createDetection);
        }
      },
      [createDetection, handleQuickDrawTransition, onExit, quickDrawActive]
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
      [scene, select]
    )
  );
}
