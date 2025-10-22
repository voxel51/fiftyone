import {
  BoundingBoxOverlay,
  TransformOverlayCommand,
  UpdateLabelCommand,
  useLighter,
} from "@fiftyone/lighter";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { editing } from ".";
import { current, currentOverlay, savedLabel } from "./state";

export default function useExit() {
  const setEditing = useSetAtom(editing);
  const setSaved = useSetAtom(savedLabel);
  const { scene } = useLighter();
  const overlay = useAtomValue(currentOverlay);
  const e = useAtomValue(current);

  return useCallback(() => {
    const store = getDefaultStore();
    store.get(currentOverlay)?.setSelected(false);
    const label = store.get(savedLabel);
    setEditing(null);
    setSaved(null);

    if (e?.isNew) {
      scene?.exitInteractiveMode();
      return;
    }

    overlay &&
      scene?.executeCommand(
        new UpdateLabelCommand(overlay, overlay.label, label)
      );

    if (overlay instanceof BoundingBoxOverlay) {
      const rect = {
        x: label?.bounding_box[0],
        y: label?.bounding_box[1],
        width: label?.bounding_box[2],
        height: label?.bounding_box[3],
      };

      scene?.executeCommand(
        new TransformOverlayCommand(
          overlay,
          overlay.id,
          overlay.getAbsoluteBounds(),
          rect,
          true
        )
      );
    }
  }, [scene, setEditing, setSaved, overlay, e]);
}
