import { useLighter } from "@fiftyone/lighter";
import { isGeneratedView } from "@fiftyone/state";
import { getDefaultStore } from "jotai";
import { useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { editing } from "./Edit";
import { current, savedLabel } from "./Edit/state";
import useExit from "./Edit/useExit";
import { labelMap } from "./useLabels";

const STORE = getDefaultStore();

export interface FocusOptions {
  ignoreSideEffects?: boolean;
}

export interface FocusController {
  /**
   * Reacts to an overlay being selected: if no label is currently being
   * edited, makes this overlay the editing focus; otherwise lets the
   * existing edit stay (and pushes the selection back out via deselect).
   */
  selectOverlay: (id: string, options?: FocusOptions) => void;
  /**
   * Reacts to an overlay being deselected: exits edit mode (unless we're
   * in a generated view, where edit mode is sticky for the single label).
   */
  deselectOverlay: (options?: FocusOptions) => void;
}

export default function useFocus(): FocusController {
  const { scene } = useLighter();
  const onExit = useExit();
  const isGenerated = useRecoilValue(isGeneratedView);

  const selectOverlay = useCallback(
    (id: string, options?: FocusOptions) => {
      if (options?.ignoreSideEffects) return;

      const editingValue = STORE.get(editing);
      if (editingValue) {
        const currentLabel = STORE.get(current);
        const currentOverlayId = currentLabel?.overlay?.id;

        // If the overlay being edited is no longer in the scene, the edit
        // target is stale and must not block selecting its replacement.
        // A string `editing` value (add-schema flow) has no overlay, so it's
        // never stale.
        const editingStale =
          typeof editingValue !== "string" &&
          !!currentOverlayId &&
          !!scene &&
          !scene.getOverlay(currentOverlayId);

        if (!editingStale) {
          if (currentLabel?.isNew) return;

          // Re-clicking the overlay that's already being edited — needed
          // for drag/resize interactions in patches view auto-edit.
          if (currentOverlayId === id) return;

          // Another label is already open for editing; cancel the new
          // selection and keep editing the current one.
          scene?.deselectOverlay(id, { ignoreSideEffects: true });
          return;
        }
      }

      const label = STORE.get(labelMap)[id];
      if (!label) return;

      STORE.set(savedLabel, STORE.get(label)?.data);
      STORE.set(editing, label);
      scene?.selectOverlay(id, { ignoreSideEffects: true });
    },
    [scene]
  );

  const deselectOverlay = useCallback(
    (options?: FocusOptions) => {
      if (options?.ignoreSideEffects) return;

      // In generated views (patches/clips/frames), don't exit edit mode on
      // deselect — the user should stay in edit mode for the single label.
      if (isGenerated) return;

      onExit();
    },
    [isGenerated, onExit]
  );

  return useMemo(
    () => ({ selectOverlay, deselectOverlay }),
    [selectOverlay, deselectOverlay]
  );
}
