import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { isGeneratedView } from "@fiftyone/state";
import { useCallback, useRef } from "react";
import { useRecoilValue } from "recoil";
import useExit from "./Edit/useExit";
import {
  useAnnotationSelector,
  useStartEditingLabel,
} from "./redux/hooks";

export default function useFocus() {
  const { scene } = useLighter();
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const selectId = useRef<string | null>(null);
  const onExit = useExit();
  const isGenerated = useRecoilValue(isGeneratedView);
  const startEditing = useStartEditingLabel();

  // Read editing state from Redux
  const editingLabel = useAnnotationSelector(
    (s) => s.annotation.editingLabel
  );

  const select = useCallback(() => {
    const id = selectId.current;
    if (!id) return;

    startEditing(id);
    scene?.selectOverlay(id, { ignoreSideEffects: true });
    selectId.current = null;
  }, [scene, startEditing]);

  useEventHandler(
    "lighter:overlay-deselect",
    useCallback(
      (payload) => {
        if (payload.ignoreSideEffects) return;
        if (isGenerated) return;
        onExit();
      },
      [isGenerated, onExit]
    )
  );

  useEventHandler(
    "lighter:overlay-select",
    useCallback(
      (payload) => {
        if (payload.ignoreSideEffects) return;

        selectId.current = payload.id;

        if (editingLabel) {
          const currentLabel = editingLabel;

          if (currentLabel.isNew) return;

          if (currentLabel.overlayId === payload.id) return;

          // Exit current edit, then select the new label
          onExit();
          Promise.resolve().then(() => select());
          return;
        }

        select();
      },
      [scene, select, editingLabel, onExit]
    )
  );
}
