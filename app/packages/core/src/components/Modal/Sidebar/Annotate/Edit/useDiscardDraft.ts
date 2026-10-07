import {
  useActiveAnnotationSampleId,
  useAnnotationEngine,
} from "@fiftyone/annotation";
import { useLighter } from "@fiftyone/lighter";
import { useCallback, useRef } from "react";
import { useAnnotationContext } from "./useAnnotationContext";
import useExit from "./useExit";

/**
 * Tears down the label being drawn and closes its form. Given an overlay id,
 * only that draft is discarded. Referentially stable.
 */
export default function useDiscardDraft(): (overlayId?: string) => void {
  const { scene, removeOverlay } = useLighter();
  const { selected } = useAnnotationContext();
  const label = selected?.label;
  // engine identity from the anchor — carries the `frames.<field>` path and
  // frame a video frame label needs
  const ref = selected?.ref ?? undefined;
  const engine = useAnnotationEngine();
  const sample = useActiveAnnotationSampleId();
  const exit = useExit();

  const discard = useCallback(
    (overlayId?: string) => {
      if (!label?.isNew || (overlayId && overlayId !== label.data._id)) {
        return;
      }

      // a label still being drawn lives in interactive mode — leave it and
      // tear down its in-progress overlay
      if (scene && !scene.isDestroyed && scene.renderLoopActive) {
        scene.exitInteractiveMode();
        removeOverlay(label.data._id, true);
      }

      // also drop it from the engine: `isNew` is form-side bookkeeping, but a
      // drawn label is already engine-committed, so the engine-derived sidebar
      // only removes the row (and autosave only persists the delete + Ctrl-Z
      // only restores it) once the engine is told. A no-op if never committed.
      engine.deleteLabel(
        ref ?? {
          sample,
          path: label.path,
          instanceId: label.data._id,
        },
      );

      exit();
    },
    [engine, exit, label, ref, removeOverlay, sample, scene],
  );

  // canvas gesture handlers call this, so its identity must not churn
  const discardRef = useRef(discard);
  discardRef.current = discard;

  return useCallback((overlayId) => discardRef.current(overlayId), []);
}
