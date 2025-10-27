import {
  BoundingBoxOverlay,
  TransformOverlayCommand,
  UpdateLabelCommand,
  useLighter,
} from "@fiftyone/lighter";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { editing } from ".";
import { current, currentData, currentOverlay, savedLabel } from "./state";
import useDelete from "./useDelete";

export default function useExit(revertLabel = true) {
  const setEditing = useSetAtom(editing);
  const setSaved = useSetAtom(savedLabel);
  const { scene } = useLighter();
  const overlay = useAtomValue(currentOverlay);
  const remove = useDelete();

  return useCallback(() => {
    const store = getDefaultStore();
    store.get(currentOverlay)?.setSelected(false);
    const label = store.get(savedLabel);
    const unsaved = store.get(current);

    if (!label) {
      return;
    }

    // label has not been persisted, so remove it
    if (unsaved?.isNew) {
      remove();
      setEditing(null);
      setSaved(null);
      return;
    }

    // return the label to the last "saved" state
    if (revertLabel) {
      label && store.set(currentData, label);

      overlay &&
        scene?.executeCommand(
          new UpdateLabelCommand(overlay, overlay.label, label)
        );

      if (overlay instanceof BoundingBoxOverlay) {
        overlay.label.bounding_box &&
          scene?.executeCommand(
            new TransformOverlayCommand(
              overlay,
              overlay.id,
              overlay.getAbsoluteBounds(),
              scene?.convertRelativeToAbsolute(overlay.label.bounding_box)
            )
          );
      }
    }
    setSaved(null);
    setEditing(null);
  }, [scene, setEditing, setSaved, overlay, revertLabel, remove]);
}
