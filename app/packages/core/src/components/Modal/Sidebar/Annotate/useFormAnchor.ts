import { useAnnotationEngine, useInteraction } from "@fiftyone/annotation";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useLayoutEffect } from "react";
import { editing } from "./Edit";
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
  const setEditing = useSetAtom(editing);
  const onExit = useExit();

  useLayoutEffect(() => {
    const value = STORE.get(editing);
    const isDraft =
      typeof value === "string" || (value !== null && STORE.get(value)?.isNew);

    // the draft lock is surface-owned
    if (isDraft) {
      return;
    }

    if (!anchor) {
      if (value) {
        onExit();
      }

      return;
    }

    const labelAtom = labels[anchor.instanceId];

    if (labelAtom && labelAtom !== value) {
      setEditing(labelAtom);
    }
  }, [anchor, labels, onExit, setEditing]);
};
