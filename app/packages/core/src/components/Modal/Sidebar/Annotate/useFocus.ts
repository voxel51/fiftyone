import { useAnnotationEngine } from "@fiftyone/annotation";
import { useLighter } from "@fiftyone/lighter";
import { isGeneratedView } from "@fiftyone/state";
import { getDefaultStore } from "jotai";
import { useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { editing } from "./Edit";
import { current } from "./Edit/state";
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
  const engine = useAnnotationEngine();
  const onExit = useExit();
  const isGenerated = useRecoilValue(isGeneratedView);

  const selectOverlay = useCallback(
    (id: string, options?: FocusOptions) => {
      if (options?.ignoreSideEffects) return;

      // the DRAFT lock: a pre-entity draft holds the form — cancel the new
      // selection and keep the draft. Committed labels carry no lock: the
      // anchor just moves (form follows it).
      if (STORE.get(editing)) {
        const currentLabel = STORE.get(current);

        if (currentLabel?.isNew) {
          // the draft's OWN overlay keeps its scene-native selection (the
          // editing affordance on the box being drawn) — only foreign
          // overlays get their selection cancelled
          if (currentLabel?.overlay?.id !== id) {
            scene?.deselectOverlay(id, { ignoreSideEffects: true });
          }

          return;
        }

        // Re-clicking the overlay that's already being edited — needed
        // for drag/resize interactions in patches view auto-edit.
        if (currentLabel?.overlay?.id === id) return;
      }

      const label = STORE.get(labelMap)[id];
      if (!label) return;

      // the form-anchor binding sets `editing` from the anchor
      engine.interaction.setActive([
        {
          sample: engine.ambientSample(),
          path: STORE.get(label).path,
          instanceId: id,
        },
      ]);
    },
    [engine, scene]
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
