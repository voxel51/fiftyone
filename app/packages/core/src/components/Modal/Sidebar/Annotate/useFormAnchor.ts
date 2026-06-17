import { useAnnotationEngine, useInteraction } from "@fiftyone/annotation";
import { getDefaultStore, useAtomValue } from "jotai";
import { useLayoutEffect } from "react";
import { useAnnotationContext } from "./Edit/useAnnotationContext";
import {
  editingLabelAtom,
  pendingNewTypeAtom,
} from "./Edit/useAnnotationContext/atoms";
import { current } from "./Edit/useAnnotationContext/selectors";
import useExit from "./Edit/useExit";
import { labelMap } from "./useLabels";

const STORE = getDefaultStore();

/**
 * Form follows the anchor: the engine's interaction anchor is the single
 * source of "which committed label is open for editing" — every surface
 * (2D canvas, 3D scene, sidebar rows) writes the anchor, and only this hook
 * writes `editing` for committed labels. `editing` survives as the form's
 * internal plumbing and as the surface-owned DRAFT slot: a pre-entity or
 * uncommitted draft holds the form until its own flow releases it, and the
 * anchor never clobbers it.
 *
 * Applied in a layout effect (pre-paint): Lighter emits
 * deselect-then-select on selection change, and a post-paint apply flashes
 * the deselected frame.
 */
export const useFormAnchor = (): void => {
  const engine = useAnnotationEngine();
  const anchor = useInteraction(engine, (i) => i.getAnchor());
  const labels = useAtomValue(labelMap);
  const { select } = useAnnotationContext();
  const onExit = useExit();

  useLayoutEffect(() => {
    const editingAtom = STORE.get(editingLabelAtom);
    const isDraft =
      STORE.get(pendingNewTypeAtom) !== null ||
      Boolean(STORE.get(current)?.isNew);

    // the draft lock is surface-owned
    if (isDraft) {
      return;
    }

    if (!anchor) {
      if (editingAtom) {
        onExit();
      }

      return;
    }

    const labelAtom = labels[anchor.instanceId];

    if (labelAtom && labelAtom !== editingAtom) {
      select(labelAtom);
    }
  }, [anchor, labels, onExit, select]);
};
