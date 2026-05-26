import { useLighter } from "@fiftyone/lighter";
import { isGeneratedView } from "@fiftyone/state";
import { getDefaultStore } from "jotai";
import { useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { useAnnotationContext } from "./Edit/useAnnotationContext";
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
  const { selected, select } = useAnnotationContext();

  const selectOverlay = useCallback(
    (id: string, options?: FocusOptions) => {
      if (options?.ignoreSideEffects) return;

      // Something is already being edited (either a label or a pending
      // new-type schema flow) — cancel the new selection.
      if (selected.label !== null || selected.pendingNewType !== null) {
        const currentLabel = selected.label;

        if (currentLabel?.isNew) return;

        // Re-clicking the overlay that's already being edited — needed
        // for drag/resize interactions in patches view auto-edit.
        if (currentLabel?.overlay?.id === id) return;

        // Another label is already open for editing; cancel the new
        // selection and keep editing the current one.
        scene?.deselectOverlay(id, { ignoreSideEffects: true });
        return;
      }

      const label = STORE.get(labelMap)[id];
      if (!label) return;

      select(label);
      scene?.selectOverlay(id, { ignoreSideEffects: true });
    },
    [scene, select, selected.label, selected.pendingNewType]
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

  return useMemo(() => ({ selectOverlay, deselectOverlay }), [
    selectOverlay,
    deselectOverlay,
  ]);
}
